import {Elysia, t} from "elysia";
import {db} from "../database";
import {
    checklists,
    geofenceViolations,
    objectPresenceSegments,
    objectSessions,
    objects,
    rooms,
    syncOperations,
    taskChecklists,
    tasks,
    users,
} from "../database/schema";
import {and, eq, gte, isNull, lt, or, sql} from "drizzle-orm";
import {jwt} from "@elysiajs/jwt";
import {config} from "../utils/config";
import type {JwtPayload} from "../utils/types";
import {isCleanerRole, normalizeUserRole} from "../utils/roles";
import {aiFeedbackForAudience, runCleaningAiReview} from "../services/ai-review";

type TaskAiState = {
    ai_status: "not_requested" | "pending" | "succeeded" | "failed";
    ai_model: string | null;
    ai_score: number | null;
    ai_feedback: string | null;
    ai_raw: unknown;
    ai_rated_at: Date | null;
};

function buildAiRatingResponse(taskId: number, task: TaskAiState) {
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

function parseDateOnly(value: string): Date | null {
    const [year, month, day] = value.split("-").map((part) => Number(part));
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function overlapSeconds(startA: Date, endA: Date, startB: Date, endB: Date): number {
    const start = Math.max(startA.getTime(), startB.getTime());
    const end = Math.min(endA.getTime(), endB.getTime());
    if (end <= start) return 0;
    return Math.floor((end - start) / 1000);
}

function formatDateOnly(value: Date): string {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function dayWindow(dateValue?: Date): { start: Date; end: Date; label: string } {
    const base = dateValue || new Date();
    const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
        start,
        end,
        label: formatDateOnly(start),
    };
}

function analyticsWindowFromQuery(
    query: { date_from?: string; date_to?: string },
    options?: { daysBack?: number },
): { windowFrom: Date; windowTo: Date; error: string | null } {
    const today = dayWindow();
    const defaultFrom = new Date(today.start);
    defaultFrom.setDate(defaultFrom.getDate() - (options?.daysBack ?? 13));
    const defaultTo = new Date(today.end);

    const parsedFrom = query.date_from ? parseDateOnly(query.date_from) : null;
    const parsedTo = query.date_to ? parseDateOnly(query.date_to) : null;
    if (query.date_from && !parsedFrom) {
        return {
            windowFrom: defaultFrom,
            windowTo: defaultTo,
            error: "Invalid date_from format. Use YYYY-MM-DD.",
        };
    }
    if (query.date_to && !parsedTo) {
        return {
            windowFrom: defaultFrom,
            windowTo: defaultTo,
            error: "Invalid date_to format. Use YYYY-MM-DD.",
        };
    }

    const windowFrom = parsedFrom || defaultFrom;
    const windowTo = parsedTo
        ? new Date(parsedTo.getFullYear(), parsedTo.getMonth(), parsedTo.getDate() + 1)
        : defaultTo;
    if (windowTo <= windowFrom) {
        return {
            windowFrom: defaultFrom,
            windowTo: defaultTo,
            error: "date_to must be on or after date_from.",
        };
    }

    return {
        windowFrom,
        windowTo,
        error: null,
    };
}

type TrackingCleanerAggregate = {
    cleaner_id: number;
    cleaner_name: string;
    on_site_seconds: number;
    off_site_seconds: number;
    task_count: number;
    pending_tasks: number;
    in_progress_tasks: number;
    completed_tasks: number;
    has_active_session: boolean;
    last_presence_at: Date | null;
};

type TrackingObjectAggregate = {
    object_id: number;
    object_address: string;
    on_site_seconds: number;
    off_site_seconds: number;
    task_count: number;
    pending_tasks: number;
    in_progress_tasks: number;
    completed_tasks: number;
    last_presence_at: Date | null;
    cleaners: Map<number, TrackingCleanerAggregate>;
    tasks: Map<number, {
        task_id: number;
        status: "pending" | "in_progress" | "completed";
        timestamp_start: Date | null;
        timestamp_end: Date | null;
        room_id: number;
        room_type: string;
        room_area_sqm: number;
        cleaner_id: number;
        cleaner_name: string;
        cleaner_email: string;
    }>;
};

async function buildObjectTrackingForWindow(input: {
    companyId: number;
    windowStart: Date;
    windowEnd: Date;
    now?: Date;
}) {
    const now = input.now || new Date();

    const segmentRows = await db.select({
        object_id: objectPresenceSegments.object_id,
        object_address: objects.address,
        cleaner_id: objectPresenceSegments.cleaner_id,
        cleaner_name: users.name,
        is_inside: objectPresenceSegments.is_inside,
        start_at: objectPresenceSegments.start_at,
        end_at: objectPresenceSegments.end_at,
    })
        .from(objectPresenceSegments)
        .innerJoin(objects, eq(objectPresenceSegments.object_id, objects.id))
        .innerJoin(users, eq(objectPresenceSegments.cleaner_id, users.id))
        .where(and(
            eq(objects.company_id, input.companyId),
            lt(objectPresenceSegments.start_at, input.windowEnd),
            or(isNull(objectPresenceSegments.end_at), gte(objectPresenceSegments.end_at, input.windowStart)),
        ));

    const sessionRows = await db.select({
        object_id: objectSessions.object_id,
        object_address: objects.address,
        cleaner_id: objectSessions.cleaner_id,
        cleaner_name: users.name,
        status: objectSessions.status,
        last_presence_at: objectSessions.last_presence_at,
    })
        .from(objectSessions)
        .innerJoin(objects, eq(objectSessions.object_id, objects.id))
        .innerJoin(users, eq(objectSessions.cleaner_id, users.id))
        .where(and(
            eq(objects.company_id, input.companyId),
            lt(objectSessions.checkin_at, input.windowEnd),
            or(isNull(objectSessions.checkout_at), gte(objectSessions.checkout_at, input.windowStart)),
        ));

    const taskRows = await db.select({
        task_id: tasks.id,
        object_id: objects.id,
        object_address: objects.address,
        cleaner_id: tasks.cleaner_id,
        cleaner_name: users.name,
        cleaner_email: users.email,
        status: tasks.status,
        timestamp_start: tasks.timestamp_start,
        timestamp_end: tasks.timestamp_end,
        room_id: rooms.id,
        room_type: rooms.type,
        room_area_sqm: rooms.area_sqm,
    })
        .from(tasks)
        .innerJoin(rooms, eq(tasks.room_id, rooms.id))
        .innerJoin(objects, eq(rooms.object_id, objects.id))
        .innerJoin(users, eq(tasks.cleaner_id, users.id))
        .where(eq(objects.company_id, input.companyId));

    const filteredTaskRows = taskRows.filter((row) => {
        if (row.status === "pending" || row.status === "in_progress") return true;
        const startedInWindow = row.timestamp_start && row.timestamp_start >= input.windowStart && row.timestamp_start < input.windowEnd;
        const endedInWindow = row.timestamp_end && row.timestamp_end >= input.windowStart && row.timestamp_end < input.windowEnd;
        return Boolean(startedInWindow || endedInWindow);
    });

    const objectMap = new Map<number, TrackingObjectAggregate>();

    const ensureObject = (objectId: number, objectAddress: string): TrackingObjectAggregate => {
        if (!objectMap.has(objectId)) {
            objectMap.set(objectId, {
                object_id: objectId,
                object_address: objectAddress,
                on_site_seconds: 0,
                off_site_seconds: 0,
                task_count: 0,
                pending_tasks: 0,
                in_progress_tasks: 0,
                completed_tasks: 0,
                last_presence_at: null,
                cleaners: new Map<number, TrackingCleanerAggregate>(),
                tasks: new Map(),
            });
        }
        return objectMap.get(objectId)!;
    };

    const ensureCleaner = (
        objectAggregate: TrackingObjectAggregate,
        cleanerId: number,
        cleanerName: string,
    ): TrackingCleanerAggregate => {
        if (!objectAggregate.cleaners.has(cleanerId)) {
            objectAggregate.cleaners.set(cleanerId, {
                cleaner_id: cleanerId,
                cleaner_name: cleanerName || `Cleaner #${cleanerId}`,
                on_site_seconds: 0,
                off_site_seconds: 0,
                task_count: 0,
                pending_tasks: 0,
                in_progress_tasks: 0,
                completed_tasks: 0,
                has_active_session: false,
                last_presence_at: null,
            });
        } else if (cleanerName) {
            objectAggregate.cleaners.get(cleanerId)!.cleaner_name = cleanerName;
        }
        return objectAggregate.cleaners.get(cleanerId)!;
    };

    for (const segment of segmentRows) {
        const segmentEnd = segment.end_at || now;
        if (segmentEnd <= segment.start_at) continue;
        const seconds = overlapSeconds(segment.start_at, segmentEnd, input.windowStart, input.windowEnd);
        if (!seconds) continue;

        const objectAggregate = ensureObject(segment.object_id, segment.object_address);
        const cleanerAggregate = ensureCleaner(objectAggregate, segment.cleaner_id, segment.cleaner_name);

        if (segment.is_inside) {
            objectAggregate.on_site_seconds += seconds;
            cleanerAggregate.on_site_seconds += seconds;
        } else {
            objectAggregate.off_site_seconds += seconds;
            cleanerAggregate.off_site_seconds += seconds;
        }
    }

    for (const session of sessionRows) {
        const objectAggregate = ensureObject(session.object_id, session.object_address);
        const cleanerAggregate = ensureCleaner(objectAggregate, session.cleaner_id, session.cleaner_name);

        if (session.status === "active") {
            cleanerAggregate.has_active_session = true;
        }

        if (!cleanerAggregate.last_presence_at || session.last_presence_at > cleanerAggregate.last_presence_at) {
            cleanerAggregate.last_presence_at = session.last_presence_at;
        }
        if (!objectAggregate.last_presence_at || session.last_presence_at > objectAggregate.last_presence_at) {
            objectAggregate.last_presence_at = session.last_presence_at;
        }
    }

    for (const task of filteredTaskRows) {
        const objectAggregate = ensureObject(task.object_id, task.object_address);
        const cleanerAggregate = ensureCleaner(objectAggregate, task.cleaner_id, task.cleaner_name);

        objectAggregate.tasks.set(task.task_id, {
            task_id: task.task_id,
            status: task.status,
            timestamp_start: task.timestamp_start,
            timestamp_end: task.timestamp_end,
            room_id: task.room_id,
            room_type: task.room_type,
            room_area_sqm: task.room_area_sqm,
            cleaner_id: task.cleaner_id,
            cleaner_name: task.cleaner_name,
            cleaner_email: task.cleaner_email,
        });

        objectAggregate.task_count += 1;
        cleanerAggregate.task_count += 1;

        if (task.status === "pending") {
            objectAggregate.pending_tasks += 1;
            cleanerAggregate.pending_tasks += 1;
        } else if (task.status === "in_progress") {
            objectAggregate.in_progress_tasks += 1;
            cleanerAggregate.in_progress_tasks += 1;
        } else if (task.status === "completed") {
            objectAggregate.completed_tasks += 1;
            cleanerAggregate.completed_tasks += 1;
        }
    }

    const objectsData = Array.from(objectMap.values())
        .map((objectAggregate) => {
            const totalElapsed = objectAggregate.on_site_seconds + objectAggregate.off_site_seconds;
            const statusWeight: Record<"pending" | "in_progress" | "completed", number> = {
                in_progress: 0,
                pending: 1,
                completed: 2,
            };
            const cleanersData = Array.from(objectAggregate.cleaners.values())
                .map((cleanerAggregate) => {
                    const cleanerTotal = cleanerAggregate.on_site_seconds + cleanerAggregate.off_site_seconds;
                    return {
                        cleaner_id: cleanerAggregate.cleaner_id,
                        cleaner_name: cleanerAggregate.cleaner_name,
                        on_site_seconds: cleanerAggregate.on_site_seconds,
                        off_site_seconds: cleanerAggregate.off_site_seconds,
                        total_elapsed_seconds: cleanerTotal,
                        on_site_ratio: cleanerTotal > 0 ? Number((cleanerAggregate.on_site_seconds / cleanerTotal).toFixed(4)) : 0,
                        task_count: cleanerAggregate.task_count,
                        pending_tasks: cleanerAggregate.pending_tasks,
                        in_progress_tasks: cleanerAggregate.in_progress_tasks,
                        completed_tasks: cleanerAggregate.completed_tasks,
                        has_active_session: cleanerAggregate.has_active_session,
                        last_presence_at: cleanerAggregate.last_presence_at,
                    };
                })
                .sort((a, b) => {
                    const activeDelta = Number(b.has_active_session) - Number(a.has_active_session);
                    if (activeDelta) return activeDelta;
                    const totalDelta = b.total_elapsed_seconds - a.total_elapsed_seconds;
                    if (totalDelta) return totalDelta;
                    return a.cleaner_name.localeCompare(b.cleaner_name);
                });
            const tasksData = Array.from(objectAggregate.tasks.values())
                .sort((a, b) => {
                    const statusDelta = statusWeight[a.status] - statusWeight[b.status];
                    if (statusDelta) return statusDelta;
                    const startA = a.timestamp_start ? new Date(a.timestamp_start).getTime() : Number.MAX_SAFE_INTEGER;
                    const startB = b.timestamp_start ? new Date(b.timestamp_start).getTime() : Number.MAX_SAFE_INTEGER;
                    if (startA !== startB) return startA - startB;
                    return a.task_id - b.task_id;
                });

            return {
                object_id: objectAggregate.object_id,
                object_address: objectAggregate.object_address,
                on_site_seconds: objectAggregate.on_site_seconds,
                off_site_seconds: objectAggregate.off_site_seconds,
                total_elapsed_seconds: totalElapsed,
                on_site_ratio: totalElapsed > 0 ? Number((objectAggregate.on_site_seconds / totalElapsed).toFixed(4)) : 0,
                task_count: objectAggregate.task_count,
                pending_tasks: objectAggregate.pending_tasks,
                in_progress_tasks: objectAggregate.in_progress_tasks,
                completed_tasks: objectAggregate.completed_tasks,
                active_cleaner_count: cleanersData.filter((cleaner) => cleaner.has_active_session).length,
                last_presence_at: objectAggregate.last_presence_at,
                cleaners: cleanersData,
                tasks: tasksData,
            };
        })
        .sort((a, b) => {
            const activeCleanerDelta = b.active_cleaner_count - a.active_cleaner_count;
            if (activeCleanerDelta) return activeCleanerDelta;
            const totalDelta = b.total_elapsed_seconds - a.total_elapsed_seconds;
            if (totalDelta) return totalDelta;
            return a.object_address.localeCompare(b.object_address);
        });

    const activeCleanerIds = new Set<number>();
    for (const row of objectsData) {
        for (const cleaner of row.cleaners) {
            if (cleaner.has_active_session) activeCleanerIds.add(cleaner.cleaner_id);
        }
    }

    return {
        date: formatDateOnly(input.windowStart),
        summary: {
            object_count: objectsData.length,
            active_object_count: objectsData.filter((row) => row.active_cleaner_count > 0).length,
            active_cleaner_count: activeCleanerIds.size,
        },
        objects: objectsData,
    };
}

export const supervisorRoutes = new Elysia({ prefix: "/inspections" })
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
      if (user.role !== "supervisor" && user.role !== "admin") {
        set.status = 403;
        throw new Error("Forbidden");
    }
      return {user};
  })
  .get("/pending", async ({ user }) => {
      // completed tasks that have not been inspected yet (no checklist row)
    const pendingInspections = await db.select({
        task: tasks,
        room: rooms,
        object: objects
    })
    .from(tasks)
    .innerJoin(rooms, eq(tasks.room_id, rooms.id))
    .innerJoin(objects, eq(rooms.object_id, objects.id))
    .leftJoin(checklists, eq(tasks.id, checklists.task_id))
    .where(and(
        eq(tasks.status, "completed"),
        eq(objects.company_id, user.company_id),
        isNull(checklists.id)
    ));

      return pendingInspections;
  })
  .get("/tracking/today", async ({ user, query, set }) => {
      const parsedDate = query.date ? parseDateOnly(query.date) : null;
      if (query.date && !parsedDate) {
          set.status = 400;
          return { message: "Invalid date format. Use YYYY-MM-DD." };
      }

      const window = dayWindow(parsedDate || undefined);
      return buildObjectTrackingForWindow({
          companyId: user.company_id,
          windowStart: window.start,
          windowEnd: window.end,
      });
  }, {
      query: t.Object({
          date: t.Optional(t.String()),
      }),
  })
  .get("/manage/rooms", async ({ user }) => {
      const result = await db.select({
          id: rooms.id,
          object_id: rooms.object_id,
          type: rooms.type,
          area_sqm: rooms.area_sqm,
          objectAddress: objects.address,
      })
          .from(rooms)
          .innerJoin(objects, eq(rooms.object_id, objects.id))
          .where(eq(objects.company_id, user.company_id))
          .orderBy(rooms.id);
      return result;
  })
  .get("/manage/cleaners", async ({ user }) => {
      const result = await db.select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
      })
          .from(users)
          .where(and(
              eq(users.company_id, user.company_id),
              eq(users.role, "cleaner"),
          ))
          .orderBy(users.id);
      return result.map((row) => ({
          ...row,
          role: "cleaner",
      }));
  })
  .post("/tasks", async ({ body, user, set }) => {
      const room = await db.select({
          room_id: rooms.id,
      })
          .from(rooms)
          .innerJoin(objects, eq(rooms.object_id, objects.id))
          .where(and(eq(rooms.id, body.room_id), eq(objects.company_id, user.company_id)));
      if (!room.length) {
          set.status = 403;
          return { message: "Room does not belong to your company" };
      }

      const cleaner = await db.select({
          id: users.id,
          role: users.role,
      })
          .from(users)
          .where(and(
              eq(users.id, body.cleaner_id),
              eq(users.company_id, user.company_id),
          ))
          .limit(1);
      if (!cleaner.length || !isCleanerRole(cleaner[0].role)) {
          set.status = 403;
          return { message: "Cleaner does not belong to your company" };
      }

      const inserted = await db.insert(tasks).values({
          room_id: body.room_id,
          cleaner_id: body.cleaner_id,
          status: "pending",
      }).returning();
      return inserted[0];
  }, {
      body: t.Object({
          room_id: t.Integer(),
          cleaner_id: t.Integer(),
      }),
  })
  .patch("/tasks/:id", async ({ params, body, user, set }) => {
      const taskId = parseInt(params.id);
      const existing = await db.select({
          task_id: tasks.id,
      })
          .from(tasks)
          .innerJoin(rooms, eq(tasks.room_id, rooms.id))
          .innerJoin(objects, eq(rooms.object_id, objects.id))
          .where(and(eq(tasks.id, taskId), eq(objects.company_id, user.company_id)));
      if (!existing.length) {
          set.status = 404;
          return { message: "Task not found" };
      }

      if (body.room_id !== undefined) {
          const room = await db.select({
              room_id: rooms.id,
          })
              .from(rooms)
              .innerJoin(objects, eq(rooms.object_id, objects.id))
              .where(and(eq(rooms.id, body.room_id), eq(objects.company_id, user.company_id)));
          if (!room.length) {
              set.status = 403;
              return { message: "Room does not belong to your company" };
          }
      }

      if (body.cleaner_id !== undefined) {
          const cleaner = await db.select({
              id: users.id,
              role: users.role,
          })
              .from(users)
              .where(and(
                  eq(users.id, body.cleaner_id),
                  eq(users.company_id, user.company_id),
              ))
              .limit(1);
          if (!cleaner.length || !isCleanerRole(cleaner[0].role)) {
              set.status = 403;
              return { message: "Cleaner does not belong to your company" };
          }
      }

      const updateData: Record<string, unknown> = {};
      if (body.room_id !== undefined) updateData.room_id = body.room_id;
      if (body.cleaner_id !== undefined) updateData.cleaner_id = body.cleaner_id;
      if (body.status !== undefined) updateData.status = body.status;
      if (!Object.keys(updateData).length) {
          const currentTask = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
          return currentTask[0];
      }

      const updated = await db.update(tasks)
          .set(updateData)
          .where(eq(tasks.id, taskId))
          .returning();
      return updated[0];
  }, {
      body: t.Object({
          room_id: t.Optional(t.Integer()),
          cleaner_id: t.Optional(t.Integer()),
          status: t.Optional(t.Union([
              t.Literal("pending"),
              t.Literal("in_progress"),
              t.Literal("completed"),
          ])),
      }),
  })
  .delete("/tasks/:id", async ({ params, user, set }) => {
      const taskId = parseInt(params.id);
      const existing = await db.select({
          task_id: tasks.id,
      })
          .from(tasks)
          .innerJoin(rooms, eq(tasks.room_id, rooms.id))
          .innerJoin(objects, eq(rooms.object_id, objects.id))
          .where(and(eq(tasks.id, taskId), eq(objects.company_id, user.company_id)));
      if (!existing.length) {
          set.status = 404;
          return { message: "Task not found" };
      }

      const deleted = await db.delete(tasks).where(eq(tasks.id, taskId)).returning();
      return { message: "Task deleted successfully", deletedTaskId: deleted[0]?.id ?? taskId };
  })
  .post("/:task_id", async ({ params, body, user, set }) => {
    const taskId = parseInt(params.task_id);

      // verify task belongs to same company and is completed
      const task = await db.select()
          .from(tasks)
          .innerJoin(rooms, eq(tasks.room_id, rooms.id))
          .innerJoin(objects, eq(rooms.object_id, objects.id))
          .where(and(
              eq(tasks.id, taskId),
              eq(tasks.status, "completed"),
              eq(objects.company_id, user.company_id)
          ));
      if (!task.length) {
          set.status = 404;
          return {message: "Task not found, not completed, or not in your company"};
    }

      // unique constraint on task_id prevents duplicates at db level
      try {
          const newChecklist = await db.insert(checklists).values({
              task_id: taskId,
              inspector_id: user.id,
              score: body.score,
              comment: body.comment
          }).returning();

          return newChecklist[0];
      } catch (err: any) {
          if (err?.code === "23505") {
              set.status = 400;
              return {message: "Inspection already exists"};
          }
          throw err;
      }
  }, {
    body: t.Object({
        score: t.Integer({ minimum: 1, maximum: 5 }),
        comment: t.Optional(t.String())
    })
  })
  // ai rating: get for a task
  .get("/:task_id/ai-rating", async ({ params, user, set }) => {
    const taskId = parseInt(params.task_id);
    const taskRow = await db.select()
        .from(tasks)
        .innerJoin(rooms, eq(tasks.room_id, rooms.id))
        .innerJoin(objects, eq(rooms.object_id, objects.id))
        .where(and(eq(tasks.id, taskId), eq(objects.company_id, user.company_id)));
    if (!taskRow.length) {
        set.status = 404;
        return { message: "Task not found" };
    }
    const t0 = taskRow[0].tasks;
    return buildAiRatingResponse(taskId, t0);
  })
  // ai rating: trigger for a task
  .post("/:task_id/ai-rate", async ({ params, user, set }) => {
    const taskId = parseInt(params.task_id);
    const taskRow = await db.select()
        .from(tasks)
        .innerJoin(rooms, eq(tasks.room_id, rooms.id))
        .innerJoin(objects, eq(rooms.object_id, objects.id))
        .where(and(eq(tasks.id, taskId), eq(objects.company_id, user.company_id)));
    if (!taskRow.length) {
        set.status = 404;
        return { message: "Task not found" };
    }

    const task = taskRow[0].tasks;
    const room = taskRow[0].rooms;
    const object = taskRow[0].objects;

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

    // mark as pending
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

    // return current state
    const updated = await db.select().from(tasks).where(eq(tasks.id, taskId));
    return buildAiRatingResponse(taskId, updated[0]);
  })
  // analytics: quality trend (ai score vs inspection score)
  .get("/analytics/quality", async ({ user, query, set }) => {
    const window = analyticsWindowFromQuery(query);
    if (window.error) {
        set.status = 400;
        return { message: window.error };
    }

    const result = await db.select({
        label: sql<string>`to_char(${tasks.timestamp_end}, 'YYYY-MM-DD')`,
        value: sql<number>`coalesce(avg(${checklists.score}), 0)`.mapWith(Number),
        aux: sql<number>`coalesce(avg(${tasks.ai_score}), 0)`.mapWith(Number),
    })
    .from(tasks)
    .innerJoin(rooms, eq(tasks.room_id, rooms.id))
    .innerJoin(objects, eq(rooms.object_id, objects.id))
    .leftJoin(checklists, eq(tasks.id, checklists.task_id))
    .where(and(
        eq(tasks.status, "completed"),
        eq(objects.company_id, user.company_id),
        gte(tasks.timestamp_end, window.windowFrom),
        lt(tasks.timestamp_end, window.windowTo),
    ))
    .groupBy(sql`to_char(${tasks.timestamp_end}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${tasks.timestamp_end}, 'YYYY-MM-DD')`);

    return result;
  }, {
    query: t.Object({
        date_from: t.Optional(t.String()),
        date_to: t.Optional(t.String()),
    }),
  })
  // analytics: geofence violations
  .get("/analytics/geofence", async ({ user, query, set }) => {
    const window = analyticsWindowFromQuery(query);
    if (window.error) {
        set.status = 400;
        return { message: window.error };
    }

    const result = await db.select({
        label: sql<string>`to_char(${geofenceViolations.created_at}, 'YYYY-MM-DD')`,
        violations: sql<number>`count(${geofenceViolations.id})`.mapWith(Number),
        rate: sql<number>`0`.mapWith(Number),
        median_distance_meters: sql<number>`coalesce(avg(${geofenceViolations.distance_meters}::numeric), 0)`.mapWith(Number),
    })
    .from(geofenceViolations)
    .innerJoin(tasks, eq(geofenceViolations.task_id, tasks.id))
    .innerJoin(rooms, eq(tasks.room_id, rooms.id))
    .innerJoin(objects, eq(rooms.object_id, objects.id))
    .where(and(
        eq(objects.company_id, user.company_id),
        gte(geofenceViolations.created_at, window.windowFrom),
        lt(geofenceViolations.created_at, window.windowTo),
    ))
    .groupBy(sql`to_char(${geofenceViolations.created_at}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${geofenceViolations.created_at}, 'YYYY-MM-DD')`);

    return result;
  }, {
    query: t.Object({
        date_from: t.Optional(t.String()),
        date_to: t.Optional(t.String()),
    }),
  })
  // analytics: sync health
  .get("/analytics/sync", async ({ user, query, set }) => {
    const window = analyticsWindowFromQuery(query);
    if (window.error) {
        set.status = 400;
        return { message: window.error };
    }

    const result = await db.select({
        label: sql<string>`to_char(${syncOperations.created_at}, 'YYYY-MM-DD')`,
        success_rate: sql<number>`coalesce(avg(case when ${syncOperations.status} = 'applied' then 1.0 else 0.0 end), 0)`.mapWith(Number),
        retry_rate: sql<number>`coalesce(avg(case when ${syncOperations.status} = 'retryable_error' then 1.0 else 0.0 end), 0)`.mapWith(Number),
        duplicate_rate: sql<number>`coalesce(avg(case when ${syncOperations.status} = 'duplicate' then 1.0 else 0.0 end), 0)`.mapWith(Number),
        failed_backlog: sql<number>`count(case when ${syncOperations.status} = 'retryable_error' then 1 end)`.mapWith(Number),
    })
    .from(syncOperations)
    .innerJoin(tasks, eq(syncOperations.task_id, tasks.id))
    .innerJoin(rooms, eq(tasks.room_id, rooms.id))
    .innerJoin(objects, eq(rooms.object_id, objects.id))
    .where(and(
        eq(objects.company_id, user.company_id),
        gte(syncOperations.created_at, window.windowFrom),
        lt(syncOperations.created_at, window.windowTo),
    ))
    .groupBy(sql`to_char(${syncOperations.created_at}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${syncOperations.created_at}, 'YYYY-MM-DD')`);

    return result;
  }, {
    query: t.Object({
        date_from: t.Optional(t.String()),
        date_to: t.Optional(t.String()),
    }),
  })
  // analytics: cleaner time on-site/off-site based on object geofence presence
  .get("/analytics/time", async ({ user, query, set }) => {
    const todayWindow = dayWindow();
    const window = analyticsWindowFromQuery(query);
    if (window.error) {
        set.status = 400;
        return { message: window.error };
    }
    const windowFrom = window.windowFrom;
    const windowTo = window.windowTo;
    const now = new Date();

    const companyCleanerRows = await db.select({
        cleaner_id: users.id,
        cleaner_name: users.name,
    })
        .from(users)
        .where(and(
            eq(users.company_id, user.company_id),
            eq(users.role, "cleaner"),
        ));

    const segmentRows = await db.select({
        cleaner_id: objectPresenceSegments.cleaner_id,
        cleaner_name: users.name,
        object_id: objectPresenceSegments.object_id,
        object_address: objects.address,
        is_inside: objectPresenceSegments.is_inside,
        start_at: objectPresenceSegments.start_at,
        end_at: objectPresenceSegments.end_at,
    })
    .from(objectPresenceSegments)
    .innerJoin(objects, eq(objectPresenceSegments.object_id, objects.id))
    .innerJoin(users, eq(objectPresenceSegments.cleaner_id, users.id))
    .where(and(
        eq(objects.company_id, user.company_id),
        lt(objectPresenceSegments.start_at, windowTo),
        or(isNull(objectPresenceSegments.end_at), gte(objectPresenceSegments.end_at, windowFrom)),
    ));

    const taskRows = await db.select({
        task_id: tasks.id,
        cleaner_id: tasks.cleaner_id,
        room_id: rooms.id,
        object_id: objects.id,
        timestamp_start: tasks.timestamp_start,
        timestamp_end: tasks.timestamp_end,
        status: tasks.status,
    })
    .from(tasks)
    .innerJoin(rooms, eq(tasks.room_id, rooms.id))
    .innerJoin(objects, eq(rooms.object_id, objects.id))
    .where(eq(objects.company_id, user.company_id));

    type CleanerAggregate = {
        cleaner_id: number;
        cleaner_name: string;
        on_site_seconds: number;
        off_site_seconds: number;
        task_elapsed_seconds: number;
        objects: Set<number>;
        rooms: Set<number>;
        tasks: Set<number>;
    };

    const cleanerMap = new Map<number, CleanerAggregate>(
        companyCleanerRows.map((row) => [row.cleaner_id, {
            cleaner_id: row.cleaner_id,
            cleaner_name: row.cleaner_name,
            on_site_seconds: 0,
            off_site_seconds: 0,
            task_elapsed_seconds: 0,
            objects: new Set<number>(),
            rooms: new Set<number>(),
            tasks: new Set<number>(),
        }]),
    );
    const objectMap = new Map<number, {
        object_id: number;
        object_address: string;
        on_site_seconds: number;
        off_site_seconds: number;
    }>();

    for (const segment of segmentRows) {
        const end = segment.end_at || now;
        if (end <= segment.start_at) continue;
        const seconds = overlapSeconds(segment.start_at, end, windowFrom, windowTo);
        if (!seconds) continue;

        if (!cleanerMap.has(segment.cleaner_id)) {
            cleanerMap.set(segment.cleaner_id, {
                cleaner_id: segment.cleaner_id,
                cleaner_name: segment.cleaner_name,
                on_site_seconds: 0,
                off_site_seconds: 0,
                task_elapsed_seconds: 0,
                objects: new Set<number>(),
                rooms: new Set<number>(),
                tasks: new Set<number>(),
            });
        }
        const cleanerAgg = cleanerMap.get(segment.cleaner_id)!;
        if (segment.is_inside) cleanerAgg.on_site_seconds += seconds;
        else cleanerAgg.off_site_seconds += seconds;
        cleanerAgg.objects.add(segment.object_id);

        if (!objectMap.has(segment.object_id)) {
            objectMap.set(segment.object_id, {
                object_id: segment.object_id,
                object_address: segment.object_address,
                on_site_seconds: 0,
                off_site_seconds: 0,
            });
        }
        const objectAgg = objectMap.get(segment.object_id)!;
        if (segment.is_inside) objectAgg.on_site_seconds += seconds;
        else objectAgg.off_site_seconds += seconds;
    }

    for (const task of taskRows) {
        if (!task.timestamp_start) continue;
        const taskStart = task.timestamp_start;
        const taskEnd = task.timestamp_end || now;
        if (taskEnd <= taskStart) continue;
        const seconds = overlapSeconds(taskStart, taskEnd, windowFrom, windowTo);
        if (!seconds) continue;

        if (!cleanerMap.has(task.cleaner_id)) {
            cleanerMap.set(task.cleaner_id, {
                cleaner_id: task.cleaner_id,
                cleaner_name: "",
                on_site_seconds: 0,
                off_site_seconds: 0,
                task_elapsed_seconds: 0,
                objects: new Set<number>(),
                rooms: new Set<number>(),
                tasks: new Set<number>(),
            });
        }
        const cleanerAgg = cleanerMap.get(task.cleaner_id)!;
        cleanerAgg.task_elapsed_seconds += seconds;
        cleanerAgg.objects.add(task.object_id);
        cleanerAgg.rooms.add(task.room_id);
        cleanerAgg.tasks.add(task.task_id);
    }

    const cleaners = Array.from(cleanerMap.values()).map((row) => {
        const total = row.on_site_seconds + row.off_site_seconds;
        return {
            cleaner_id: row.cleaner_id,
            cleaner_name: row.cleaner_name || `Cleaner #${row.cleaner_id}`,
            on_site_seconds: row.on_site_seconds,
            off_site_seconds: row.off_site_seconds,
            total_elapsed_seconds: total,
            on_site_ratio: total > 0 ? Number((row.on_site_seconds / total).toFixed(4)) : 0,
            object_count: row.objects.size,
            room_count: row.rooms.size,
            task_count: row.tasks.size,
            task_elapsed_seconds: row.task_elapsed_seconds,
        };
    }).sort((a, b) => b.total_elapsed_seconds - a.total_elapsed_seconds);

    const objectsData = Array.from(objectMap.values()).map((row) => {
        const total = row.on_site_seconds + row.off_site_seconds;
        return {
            object_id: row.object_id,
            object_address: row.object_address,
            on_site_seconds: row.on_site_seconds,
            off_site_seconds: row.off_site_seconds,
            total_elapsed_seconds: total,
            on_site_ratio: total > 0 ? Number((row.on_site_seconds / total).toFixed(4)) : 0,
        };
    }).sort((a, b) => b.total_elapsed_seconds - a.total_elapsed_seconds);

    const summary = cleaners.reduce((acc, row) => {
        acc.on_site_seconds += row.on_site_seconds;
        acc.off_site_seconds += row.off_site_seconds;
        acc.task_elapsed_seconds += row.task_elapsed_seconds;
        return acc;
    }, {
        on_site_seconds: 0,
        off_site_seconds: 0,
        task_elapsed_seconds: 0,
    });
    const totalElapsed = summary.on_site_seconds + summary.off_site_seconds;

    return {
        window: {
            date_from: `${windowFrom.getFullYear()}-${String(windowFrom.getMonth() + 1).padStart(2, "0")}-${String(windowFrom.getDate()).padStart(2, "0")}`,
            date_to: `${new Date(windowTo.getTime() - 1).getFullYear()}-${String(new Date(windowTo.getTime() - 1).getMonth() + 1).padStart(2, "0")}-${String(new Date(windowTo.getTime() - 1).getDate()).padStart(2, "0")}`,
        },
        summary: {
            on_site_seconds: summary.on_site_seconds,
            off_site_seconds: summary.off_site_seconds,
            total_elapsed_seconds: totalElapsed,
            on_site_ratio: totalElapsed > 0 ? Number((summary.on_site_seconds / totalElapsed).toFixed(4)) : 0,
            task_elapsed_seconds: summary.task_elapsed_seconds,
        },
        cleaners,
        objects: objectsData,
        today_tracking: await buildObjectTrackingForWindow({
            companyId: user.company_id,
            windowStart: todayWindow.start,
            windowEnd: todayWindow.end,
            now,
        }),
    };
  }, {
    query: t.Object({
        date_from: t.Optional(t.String()),
        date_to: t.Optional(t.String()),
    }),
  });
