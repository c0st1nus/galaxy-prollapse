import {Elysia, t} from "elysia";
import {db} from "../database";
import {geofenceViolations, objectSessions, objects, questionnaireResponses, rooms, taskChecklists, tasks} from "../database/schema";
import {and, eq, gte, lt, SQL} from "drizzle-orm";
import {jwt} from "@elysiajs/jwt";
import {config} from "../utils/config";
import {uploadFile} from "../services/storage";
import {validatePhotoFile} from "../services/photo";
import {aiFeedbackForAudience, runCleaningAiReview} from "../services/ai-review";
import {determineAppaLevel, APPA_LABELS, generateChecklistFromAnswers, getNextQuestions} from "../services/questionnaire";
import type {JwtPayload} from "../utils/types";
import type {QuestionnaireAnswer} from "../services/questionnaire";
import {normalizeUserRole} from "../utils/roles";

type TaskAiState = {
    ai_status: "not_requested" | "pending" | "succeeded" | "failed";
    ai_model: string | null;
    ai_score: number | null;
    ai_feedback: string | null;
    ai_raw: unknown;
    ai_rated_at: Date | null;
};

function parseDateOnly(value: string) {
    const [year, month, day] = value.split("-").map((part) => Number(part));
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function buildTaskQuestionnaireCondition(taskId: number, user: JwtPayload): SQL {
    if (user.role === "cleaner") {
        return and(
            eq(tasks.id, taskId),
            eq(tasks.cleaner_id, user.id),
            eq(objects.company_id, user.company_id),
        ) as SQL;
    }
    return and(
        eq(tasks.id, taskId),
        eq(objects.company_id, user.company_id),
    ) as SQL;
}

function buildTaskAiRatingResponse(taskId: number, task: TaskAiState) {
    const audienceFeedback = aiFeedbackForAudience(task.ai_raw, task.ai_feedback);
    return {
        task_id: taskId,
        ai_status: task.ai_status,
        ai_model: task.ai_model,
        ai_score: task.ai_score,
        ai_feedback: task.ai_feedback,
        ai_feedback_cleaner: audienceFeedback.cleaner,
        ai_feedback_supervisor: audienceFeedback.supervisor,
        ai_review: audienceFeedback.review,
        ai_raw: task.ai_raw,
        ai_rated_at: task.ai_rated_at,
    };
}

function checklistItemTitles(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => {
            if (!item || typeof item !== "object") return "";
            const title = (item as {title?: unknown}).title;
            return typeof title === "string" ? title.trim() : "";
        })
        .filter(Boolean)
        .slice(0, 30);
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // metres
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function validateGeofence(
    objectRow: { latitude: string | null; longitude: string | null; geofence_radius_meters: number },
    cleanerLat: string | undefined,
    cleanerLng: string | undefined,
    taskId: number,
    cleanerId: number,
    phase: "start" | "complete",
): Promise<{ allowed: boolean; distance?: number }> {
    // skip if object has no coordinates configured
    if (!objectRow.latitude || !objectRow.longitude) return { allowed: true };
    // skip if cleaner didn't send coordinates
    if (!cleanerLat || !cleanerLng) return { allowed: true };

    const dist = haversineDistance(
        Number(objectRow.latitude), Number(objectRow.longitude),
        Number(cleanerLat), Number(cleanerLng),
    );

    if (dist <= objectRow.geofence_radius_meters) return { allowed: true, distance: dist };

    // log violation
    await db.insert(geofenceViolations).values({
        task_id: taskId,
        cleaner_id: cleanerId,
        phase,
        distance_meters: String(Math.round(dist * 100) / 100),
        allowed_radius_meters: objectRow.geofence_radius_meters,
        latitude: cleanerLat,
        longitude: cleanerLng,
    });

    return { allowed: false, distance: dist };
}

export const cleanerRoutes = new Elysia({ prefix: "/tasks" })
  .use(
    jwt({
      name: "jwt",
      secret: config.JWT_SECRET,
    })
  )
  .derive(async ({ headers, jwt, set }) => {
    const auth = headers["authorization"];
    if (!auth) {
        set.status = 401;
        throw new Error("Unauthorized");
    }
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
    const profile = await jwt.verify(token);
    if (!profile) {
        set.status = 401;
        throw new Error("Unauthorized");
    }
      const role = normalizeUserRole(profile.role);
      if (!role) {
          set.status = 403;
          throw new Error("Forbidden");
      }
      const user: JwtPayload = {
          id: Number(profile.id),
          role,
          company_id: Number(profile.company_id),
      };
      if (user.role !== "cleaner" && user.role !== "admin" && user.role !== "supervisor") {
          set.status = 403;
          throw new Error("Forbidden: only cleaners, admins, and supervisors can access task routes");
      }
      return {user};
  })
    .get("/my", async ({user, query}) => {
        // build dynamic filter conditions
        const conditions: SQL[] = [eq(objects.company_id, user.company_id)];
        if (user.role === "cleaner") {
            conditions.push(eq(tasks.cleaner_id, user.id));
        }

        // optional status filter
        if (query.status) {
            conditions.push(eq(tasks.status, query.status as "pending" | "in_progress" | "completed"));
        }

        // optional date range filter (on timestamp_start)
        if (query.date_from) {
            const dateFrom = parseDateOnly(query.date_from);
            if (dateFrom) {
                conditions.push(gte(tasks.timestamp_start, dateFrom));
            }
        }
        if (query.date_to) {
            const dateTo = parseDateOnly(query.date_to);
            if (dateTo) {
                // treat date_to as end of day by filtering to next-day exclusive boundary.
                dateTo.setDate(dateTo.getDate() + 1);
                conditions.push(lt(tasks.timestamp_start, dateTo));
            }
        }

    const result = await db.select({
        task: tasks,
        room: rooms,
        object: objects
    })
    .from(tasks)
    .innerJoin(rooms, eq(tasks.room_id, rooms.id))
    .innerJoin(objects, eq(rooms.object_id, objects.id))
        .where(and(...conditions));
    
    return result;
    }, {
        query: t.Object({
            status: t.Optional(t.String()),
            date_from: t.Optional(t.String()),
            date_to: t.Optional(t.String()),
        })
  })
  .patch("/:id/start", async ({ params, user, set, body }) => {
    const taskId = parseInt(params.id);

    // look up task + object for geofence check
    const taskRow = await db.select({ task: tasks, room: rooms, object: objects })
        .from(tasks)
        .innerJoin(rooms, eq(tasks.room_id, rooms.id))
        .innerJoin(objects, eq(rooms.object_id, objects.id))
        .where(and(eq(tasks.id, taskId), eq(tasks.cleaner_id, user.id)));
    if (!taskRow.length) {
        set.status = 404;
        return { message: "Task not found or not assigned to you" };
    }

    const activeSession = await db.select()
        .from(objectSessions)
        .where(and(
            eq(objectSessions.object_id, taskRow[0].object.id),
            eq(objectSessions.cleaner_id, user.id),
            eq(objectSessions.status, "active"),
        ))
        .limit(1);
    if (!activeSession.length) {
        set.status = 403;
        return { message: "Check in to this object before starting task work" };
    }
    if (!activeSession[0].current_inside_geofence) {
        set.status = 403;
        return { message: "You are outside the geofence. Return inside before starting task work" };
    }
    if (!body.latitude || !body.longitude) {
        set.status = 400;
        return { message: "GPS coordinates are required while working in geofenced mode" };
    }

    // geofence validation
    const geo = await validateGeofence(
        taskRow[0].object, body.latitude, body.longitude,
        taskId, user.id, "start",
    );
    if (!geo.allowed) {
        set.status = 403;
        return { message: `Geofence violation: you are ${Math.round(geo.distance!)}m away (max ${taskRow[0].object.geofence_radius_meters}m)` };
    }

    let photoBeforePath = undefined;
    if (body.photo_before) {
        try {
            validatePhotoFile(body.photo_before, "photo_before");
        } catch (err) {
            set.status = 400;
            return { message: err instanceof Error ? err.message : "Invalid photo_before" };
        }
        photoBeforePath = await uploadFile(body.photo_before);
    }

    const updateData: Record<string, unknown> = {
        status: "in_progress",
        timestamp_start: new Date(),
    };
    if (photoBeforePath) updateData.photo_before = photoBeforePath;

    // gps coordinates
    if (body.latitude) updateData.checkin_latitude = body.latitude;
    if (body.longitude) updateData.checkin_longitude = body.longitude;

    const updated = await db.update(tasks)
        .set(updateData)
        .where(and(eq(tasks.id, taskId), eq(tasks.cleaner_id, user.id)))
        .returning();
    
    return updated[0];
  }, {
    body: t.Object({
        photo_before: t.Optional(t.File()),
        latitude: t.Optional(t.String()),
        longitude: t.Optional(t.String()),
        client_operation_id: t.Optional(t.String()),
    })
  })
  .patch("/:id/complete", async ({ params, body, user, set }) => {
    const taskId = parseInt(params.id);

    // look up task + object for geofence check
    const taskRow = await db.select({ task: tasks, room: rooms, object: objects })
        .from(tasks)
        .innerJoin(rooms, eq(tasks.room_id, rooms.id))
        .innerJoin(objects, eq(rooms.object_id, objects.id))
        .where(and(eq(tasks.id, taskId), eq(tasks.cleaner_id, user.id)));
    if (!taskRow.length) {
        set.status = 404;
        return { message: "Task not found or not assigned to you" };
    }

    const activeSession = await db.select()
        .from(objectSessions)
        .where(and(
            eq(objectSessions.object_id, taskRow[0].object.id),
            eq(objectSessions.cleaner_id, user.id),
            eq(objectSessions.status, "active"),
        ))
        .limit(1);
    if (!activeSession.length) {
        set.status = 403;
        return { message: "Check in to this object before completing task work" };
    }
    if (!activeSession[0].current_inside_geofence) {
        set.status = 403;
        return { message: "You are outside the geofence. Return inside before completing task work" };
    }
    if (!body.latitude || !body.longitude) {
        set.status = 400;
        return { message: "GPS coordinates are required while working in geofenced mode" };
    }

    // geofence validation
    const geo = await validateGeofence(
        taskRow[0].object, body.latitude, body.longitude,
        taskId, user.id, "complete",
    );
    if (!geo.allowed) {
        set.status = 403;
        return { message: `Geofence violation: you are ${Math.round(geo.distance!)}m away (max ${taskRow[0].object.geofence_radius_meters}m)` };
    }

    let photoAfterPath = undefined;
    if (body.photo_after) {
        try {
            validatePhotoFile(body.photo_after, "photo_after");
        } catch (err) {
            set.status = 400;
            return { message: err instanceof Error ? err.message : "Invalid photo_after" };
        }
        photoAfterPath = await uploadFile(body.photo_after);
    }

    const hasTaskPhoto = Boolean(
        taskRow[0].task.photo_before ||
        taskRow[0].task.photo_after ||
        photoAfterPath
    );
    if (!hasTaskPhoto) {
        set.status = 400;
        return { message: "At least one task photo is required before completion" };
    }

    const updateData: Record<string, unknown> = {
        status: "completed",
        timestamp_end: new Date(),
    };
    if (photoAfterPath) updateData.photo_after = photoAfterPath;

    // gps coordinates
    if (body.latitude) updateData.checkout_latitude = body.latitude;
    if (body.longitude) updateData.checkout_longitude = body.longitude;
    
    const updated = await db.update(tasks)
        .set(updateData)
        .where(and(eq(tasks.id, taskId), eq(tasks.cleaner_id, user.id)))
        .returning();
    
    return updated[0];
  }, {
    body: t.Object({
        photo_after: t.Optional(t.File()),
        latitude: t.Optional(t.String()),
        longitude: t.Optional(t.String()),
        client_operation_id: t.Optional(t.String()),
    })
  })
  // task checklist: get or auto-generate
  .get("/:id/checklist", async ({ params, user, set }) => {
    const taskId = parseInt(params.id);

    // verify ownership
    const taskRow = await db.select({ task: tasks, room: rooms, object: objects })
        .from(tasks)
        .innerJoin(rooms, eq(tasks.room_id, rooms.id))
        .innerJoin(objects, eq(rooms.object_id, objects.id))
        .where(and(eq(tasks.id, taskId), eq(tasks.cleaner_id, user.id)));
    if (!taskRow.length) {
        set.status = 404;
        return { message: "Task not found" };
    }

    // check for existing checklist
    const existing = await db.select().from(taskChecklists).where(eq(taskChecklists.task_id, taskId));
    if (existing.length) {
        const normalizedItems = Array.isArray(existing[0].items)
            ? (existing[0].items as Array<Record<string, unknown>>).map((item) => ({
                ...item,
                photo_required: false,
            }))
            : [];
        return {
            task_id: taskId,
            template_id: existing[0].template_id,
            room_type: taskRow[0].room.type,
            cleaning_standard: taskRow[0].object.cleaning_standard,
            items: normalizedItems,
            completion_percent: existing[0].completion_percent,
            updated_at: existing[0].updated_at,
        };
    }

    // no checklist yet – return empty placeholder
    return {
        task_id: taskId,
        template_id: null,
        room_type: taskRow[0].room.type,
        cleaning_standard: taskRow[0].object.cleaning_standard,
        items: [],
        completion_percent: 0,
        updated_at: null,
    };
  })
  // update task checklist items
  .patch("/:id/checklist", async ({ params, body, user, set }) => {
    const taskId = parseInt(params.id);

    // verify ownership
    const taskRow = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.cleaner_id, user.id)));
    if (!taskRow.length) {
        set.status = 404;
        return { message: "Task not found" };
    }

    const items = body.items as Array<{ id: string; title: string; done: boolean; note?: string; photo_url?: string }>;
    const normalizedItems = items.map((item) => ({
        ...item,
        photo_required: false,
    }));
    const total = normalizedItems.length;
    const done = normalizedItems.filter((i) => i.done).length;
    const completionPercent = total > 0 ? Math.round((done / total) * 100) : 0;

    // upsert
    const existing = await db.select().from(taskChecklists).where(eq(taskChecklists.task_id, taskId));
    if (existing.length) {
        const updated = await db.update(taskChecklists)
            .set({ items: normalizedItems, completion_percent: completionPercent, updated_at: new Date() })
            .where(eq(taskChecklists.task_id, taskId))
            .returning();
        return {
            task_id: taskId,
            template_id: updated[0].template_id,
            items: updated[0].items,
            completion_percent: updated[0].completion_percent,
            updated_at: updated[0].updated_at,
        };
    } else {
        const inserted = await db.insert(taskChecklists).values({
            task_id: taskId,
            items: normalizedItems,
            completion_percent: completionPercent,
        }).returning();
        return {
            task_id: taskId,
            template_id: inserted[0].template_id,
            items: inserted[0].items,
            completion_percent: inserted[0].completion_percent,
            updated_at: inserted[0].updated_at,
        };
    }
  }, {
    body: t.Object({
        items: t.Array(t.Object({
            id: t.String(),
            title: t.String(),
            done: t.Boolean(),
            note: t.Optional(t.String()),
            photo_required: t.Optional(t.Boolean()),
            photo_url: t.Optional(t.String()),
        })),
        client_operation_id: t.Optional(t.String()),
    })
  })
  // checklist item photo upload
  .post("/:id/checklist/upload", async ({ params, body, user, set }) => {
    const taskId = parseInt(params.id);

    // verify ownership
    const taskRow = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.cleaner_id, user.id)));
    if (!taskRow.length) {
        set.status = 404;
        return { message: "Task not found" };
    }

    try {
        validatePhotoFile(body.photo, "photo");
    } catch (err) {
        set.status = 400;
        return { message: err instanceof Error ? err.message : "Invalid photo" };
    }

    const photoUrl = await uploadFile(body.photo);

    // update the matching checklist item's photo_url
    const existing = await db.select().from(taskChecklists).where(eq(taskChecklists.task_id, taskId));
    if (existing.length) {
        const items = existing[0].items as Array<{ id: string; title: string; done: boolean; note?: string; photo_required?: boolean; photo_url?: string }>;
        const item = items.find((i) => i.id === body.item_id);
        if (item) {
            item.photo_url = photoUrl;
            await db.update(taskChecklists)
                .set({ items, updated_at: new Date() })
                .where(eq(taskChecklists.task_id, taskId));
        }
    }

    return { item_id: body.item_id, photo_url: photoUrl };
  }, {
    body: t.Object({
        photo: t.File(),
        item_id: t.String(),
    })
  })
  // ai rating: get current status
  .get("/:id/ai-rating", async ({ params, user, set }) => {
    const taskId = parseInt(params.id);
    const taskRow = await db.select({ task: tasks, room: rooms, object: objects })
        .from(tasks)
        .innerJoin(rooms, eq(tasks.room_id, rooms.id))
        .innerJoin(objects, eq(rooms.object_id, objects.id))
        .where(buildTaskQuestionnaireCondition(taskId, user));
    if (!taskRow.length) {
        set.status = 404;
        return { message: "Task not found" };
    }
    return buildTaskAiRatingResponse(taskId, taskRow[0].task);
  })
  // ai rating: trigger for a task
  .post("/:id/ai-rate", async ({ params, user, set }) => {
    const taskId = parseInt(params.id);
    const taskRow = await db.select({ task: tasks, room: rooms, object: objects })
        .from(tasks)
        .innerJoin(rooms, eq(tasks.room_id, rooms.id))
        .innerJoin(objects, eq(rooms.object_id, objects.id))
        .where(buildTaskQuestionnaireCondition(taskId, user));
    if (!taskRow.length) {
        set.status = 404;
        return { message: "Task not found" };
    }

    const task = taskRow[0].task;
    const room = taskRow[0].room;
    const object = taskRow[0].object;

    if (task.status !== "completed") {
        set.status = 400;
        return { message: "AI review can only run for completed tasks" };
    }

    const photoBeforeUrl = task.photo_before || task.photo_after;
    const photoAfterUrl = task.photo_after || task.photo_before;
    if (!photoBeforeUrl || !photoAfterUrl) {
        set.status = 400;
        return { message: "At least one task photo is required for AI review" };
    }

    const checklistRow = await db.select({
        items: taskChecklists.items,
    }).from(taskChecklists)
        .where(eq(taskChecklists.task_id, taskId))
        .limit(1);
    const checklistItems = checklistItemTitles(checklistRow[0]?.items);

    await db.update(tasks)
        .set({ ai_status: "pending", ai_model: config.AI_REVIEW_MODEL })
        .where(eq(tasks.id, taskId));

    try {
        const ai = await runCleaningAiReview({
            taskId,
            roomType: room.type,
            areaSqm: room.area_sqm,
            cleaningStandard: object.cleaning_standard,
            objectAddress: object.address,
            checklistItems,
            photoBeforeUrl,
            photoAfterUrl,
        });

        await db.update(tasks).set({
            ai_status: "succeeded",
            ai_model: ai.model,
            ai_score: ai.review.score,
            ai_feedback: ai.review.feedback_cleaner,
            ai_raw: {
                review: ai.review,
                prompt: ai.prompt,
                provider_response: ai.raw,
            },
            ai_rated_at: new Date(),
        }).where(eq(tasks.id, taskId));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "AI rating failed";
        await db.update(tasks).set({
            ai_status: "failed",
            ai_model: config.AI_REVIEW_MODEL,
            ai_feedback: message,
            ai_raw: {
                error: message,
            },
            ai_rated_at: new Date(),
        }).where(eq(tasks.id, taskId));
    }

    const updated = await db.select().from(tasks).where(eq(tasks.id, taskId));
    return buildTaskAiRatingResponse(taskId, updated[0]);
  })
  // questionnaire: get next questions for a task
  .get("/:id/questionnaire", async ({ params, user, set }) => {
    const taskId = parseInt(params.id);

    // cleaners can access only their own task; supervisors/admins can access any task in company.
    const taskRow = await db.select({ task: tasks, room: rooms, object: objects })
        .from(tasks)
        .innerJoin(rooms, eq(tasks.room_id, rooms.id))
        .innerJoin(objects, eq(rooms.object_id, objects.id))
        .where(buildTaskQuestionnaireCondition(taskId, user));
    if (!taskRow.length) {
        set.status = 404;
        return { message: "Task not found" };
    }

    // check existing answers
    const existing = await db.select().from(questionnaireResponses).where(eq(questionnaireResponses.task_id, taskId));
    const currentAnswers: QuestionnaireAnswer[] = existing.length
        ? (existing[0].answers as QuestionnaireAnswer[])
        : [];

    const nextQuestions = getNextQuestions(taskRow[0].room.type, currentAnswers);
    const isComplete = nextQuestions.length === 0 && currentAnswers.length > 0;
    const appaLevel = isComplete ? determineAppaLevel(currentAnswers) : null;

    return {
        task_id: taskId,
        room_type: taskRow[0].room.type,
        cleaning_standard: taskRow[0].object.cleaning_standard,
        current_answers: currentAnswers,
        next_questions: nextQuestions,
        is_complete: isComplete,
        determined_appa_level: appaLevel,
        appa_label: appaLevel ? APPA_LABELS[appaLevel] : null,
        generated_checklist: existing.length ? existing[0].generated_checklist : null,
    };
  })
  // questionnaire: submit answers (can be partial – adaptive flow)
  .post("/:id/questionnaire", async ({ params, body, user, set }) => {
    const taskId = parseInt(params.id);

    // cleaners can submit only for own task; supervisors/admins can submit for any task in company.
    const taskRow = await db.select({ task: tasks, room: rooms, object: objects })
        .from(tasks)
        .innerJoin(rooms, eq(tasks.room_id, rooms.id))
        .innerJoin(objects, eq(rooms.object_id, objects.id))
        .where(buildTaskQuestionnaireCondition(taskId, user));
    if (!taskRow.length) {
        set.status = 404;
        return { message: "Task not found" };
    }

    const roomType = taskRow[0].room.type;
    const cleaningStandard = taskRow[0].object.cleaning_standard;
    const newAnswers = body.answers as QuestionnaireAnswer[];

    // merge with existing answers
    const existing = await db.select().from(questionnaireResponses).where(eq(questionnaireResponses.task_id, taskId));
    let allAnswers: QuestionnaireAnswer[];
    if (existing.length) {
        const prev = existing[0].answers as QuestionnaireAnswer[];
        const prevMap = new Map(prev.map((a) => [a.question_id, a]));
        for (const a of newAnswers) {
            prevMap.set(a.question_id, a);
        }
        allAnswers = Array.from(prevMap.values());
    } else {
        allAnswers = newAnswers;
    }

    // check if questionnaire is complete
    const remaining = getNextQuestions(roomType, allAnswers);
    let generatedChecklist = null;

    let determinedAppaLevel: number | null = null;

    if (remaining.length === 0 && allAnswers.length > 0) {
        // determine APPA level from answers
        determinedAppaLevel = determineAppaLevel(allAnswers);

        // generate checklist from answers
        generatedChecklist = generateChecklistFromAnswers(roomType, cleaningStandard, allAnswers);

        // also create/update task_checklists so it integrates with the existing checklist flow
        const existingChecklist = await db.select().from(taskChecklists).where(eq(taskChecklists.task_id, taskId));
        const checklistItems = generatedChecklist.map((item) => ({
            id: item.id,
            title: item.title,
            done: item.done,
            note: item.note || "",
            photo_required: false,
        }));

        if (existingChecklist.length) {
            await db.update(taskChecklists)
                .set({ items: checklistItems, completion_percent: 0, updated_at: new Date() })
                .where(eq(taskChecklists.task_id, taskId));
        } else {
            await db.insert(taskChecklists).values({
                task_id: taskId,
                items: checklistItems,
                completion_percent: 0,
            });
        }

        // auto-update the object's cleaning_standard based on determined APPA level
        const appaStandard = `appa_${determinedAppaLevel}`;
        await db.update(objects)
            .set({ cleaning_standard: appaStandard })
            .where(eq(objects.id, taskRow[0].object.id));
    }

    // upsert questionnaire response
    if (existing.length) {
        await db.update(questionnaireResponses)
            .set({
                answers: allAnswers,
                generated_checklist: generatedChecklist,
                updated_at: new Date(),
            })
            .where(eq(questionnaireResponses.task_id, taskId));
    } else {
        await db.insert(questionnaireResponses).values({
            task_id: taskId,
            cleaner_id: taskRow[0].task.cleaner_id,
            answers: allAnswers,
            generated_checklist: generatedChecklist,
        });
    }

    // return next state
    const nextQuestions = getNextQuestions(roomType, allAnswers);
    const isComplete = nextQuestions.length === 0 && allAnswers.length > 0;
    return {
        task_id: taskId,
        room_type: roomType,
        cleaning_standard: determinedAppaLevel ? `appa_${determinedAppaLevel}` : cleaningStandard,
        current_answers: allAnswers,
        next_questions: nextQuestions,
        is_complete: isComplete,
        determined_appa_level: determinedAppaLevel,
        appa_label: determinedAppaLevel ? APPA_LABELS[determinedAppaLevel] : null,
        generated_checklist: generatedChecklist,
    };
  }, {
    body: t.Object({
        answers: t.Array(t.Object({
            question_id: t.String(),
            answer: t.Union([t.String(), t.Array(t.String())]),
        })),
    })
  });
