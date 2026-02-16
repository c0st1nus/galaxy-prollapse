import {Elysia, t} from "elysia";
import {db} from "../database";
import {
  checklists,
  geofenceViolations,
  objects,
  rooms,
  syncOperations,
  taskEvents,
  tasks,
  users,
} from "../database/schema";
import {and, eq, isNull, sql} from "drizzle-orm";
import {jwt} from "@elysiajs/jwt";
import {config} from "../utils/config";
import type {JwtPayload} from "../utils/types";
import {AiRatingMode, rateCleaningTask} from "../services/ai-rating";

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
      const user: JwtPayload = {
          id: Number(profile.id),
          role: profile.role as JwtPayload["role"],
          company_id: Number(profile.company_id),
      };
      if (user.role !== "supervisor" && user.role !== "admin") {
        set.status = 403;
        throw new Error("Forbidden");
    }
      return {user};
  })
  .get("/analytics/quality", async ({user}) => {
    const summary = await db.select({
      ratedTasks: sql<number>`count(case when ${tasks.ai_score} is not null then 1 end)`.mapWith(Number),
      inspectedTasks: sql<number>`count(case when ${checklists.score} is not null then 1 end)`.mapWith(Number),
      avgAiScore: sql<number>`coalesce(avg(${tasks.ai_score}), 0)`.mapWith(Number),
      avgInspectionScore: sql<number>`coalesce(avg(${checklists.score}), 0)`.mapWith(Number),
      avgScoreDelta: sql<number>`coalesce(avg(abs(${tasks.ai_score} - ${checklists.score})), 0)`.mapWith(Number),
    })
      .from(tasks)
      .innerJoin(rooms, eq(tasks.room_id, rooms.id))
      .innerJoin(objects, eq(rooms.object_id, objects.id))
      .leftJoin(checklists, eq(tasks.id, checklists.task_id))
      .where(eq(objects.company_id, user.company_id))
      .limit(1);

    const byCleaner = await db.select({
      cleanerId: users.id,
      cleanerName: users.name,
      tasksRated: sql<number>`count(case when ${tasks.ai_score} is not null then 1 end)`.mapWith(Number),
      avgAiScore: sql<number>`coalesce(avg(${tasks.ai_score}), 0)`.mapWith(Number),
      avgInspectionScore: sql<number>`coalesce(avg(${checklists.score}), 0)`.mapWith(Number),
      avgScoreDelta: sql<number>`coalesce(avg(abs(${tasks.ai_score} - ${checklists.score})), 0)`.mapWith(Number),
    })
      .from(tasks)
      .innerJoin(users, eq(tasks.cleaner_id, users.id))
      .innerJoin(rooms, eq(tasks.room_id, rooms.id))
      .innerJoin(objects, eq(rooms.object_id, objects.id))
      .leftJoin(checklists, eq(tasks.id, checklists.task_id))
      .where(eq(objects.company_id, user.company_id))
      .groupBy(users.id, users.name);

    return {
      summary: summary[0] ?? null,
      by_cleaner: byCleaner,
    };
  })
  .get("/analytics/geofence", async ({user}) => {
    const summary = await db.select({
      violationCount: sql<number>`count(${geofenceViolations.id})`.mapWith(Number),
      avgOverDistance: sql<number>`coalesce(avg(${geofenceViolations.distance_meters}), 0)`.mapWith(Number),
    })
      .from(geofenceViolations)
      .innerJoin(tasks, eq(geofenceViolations.task_id, tasks.id))
      .innerJoin(rooms, eq(tasks.room_id, rooms.id))
      .innerJoin(objects, eq(rooms.object_id, objects.id))
      .where(eq(objects.company_id, user.company_id))
      .limit(1);

    const byCleaner = await db.select({
      cleanerId: users.id,
      cleanerName: users.name,
      violations: sql<number>`count(${geofenceViolations.id})`.mapWith(Number),
      avgDistance: sql<number>`coalesce(avg(${geofenceViolations.distance_meters}), 0)`.mapWith(Number),
    })
      .from(geofenceViolations)
      .innerJoin(users, eq(geofenceViolations.cleaner_id, users.id))
      .innerJoin(tasks, eq(geofenceViolations.task_id, tasks.id))
      .innerJoin(rooms, eq(tasks.room_id, rooms.id))
      .innerJoin(objects, eq(rooms.object_id, objects.id))
      .where(eq(objects.company_id, user.company_id))
      .groupBy(users.id, users.name);

    return {
      summary: summary[0] ?? null,
      by_cleaner: byCleaner,
    };
  })
  .get("/analytics/sync", async ({user}) => {
    const summary = await db.select({
      applied: sql<number>`count(case when ${syncOperations.status} = 'applied' then 1 end)`.mapWith(Number),
      rejected: sql<number>`count(case when ${syncOperations.status} = 'rejected' then 1 end)`.mapWith(Number),
      retryable: sql<number>`count(case when ${syncOperations.status} = 'retryable_error' then 1 end)`.mapWith(Number),
      oldestRetryableAt: sql<Date | null>`min(case when ${syncOperations.status} = 'retryable_error' then ${syncOperations.created_at} else null end)`,
    })
      .from(syncOperations)
      .innerJoin(tasks, eq(syncOperations.task_id, tasks.id))
      .innerJoin(rooms, eq(tasks.room_id, rooms.id))
      .innerJoin(objects, eq(rooms.object_id, objects.id))
      .where(eq(objects.company_id, user.company_id))
      .limit(1);

    const duplicateSummary = await db.select({
      duplicate: sql<number>`count(${taskEvents.id})`.mapWith(Number),
    })
      .from(taskEvents)
      .innerJoin(tasks, eq(taskEvents.task_id, tasks.id))
      .innerJoin(rooms, eq(tasks.room_id, rooms.id))
      .innerJoin(objects, eq(rooms.object_id, objects.id))
      .where(and(
        eq(objects.company_id, user.company_id),
        eq(taskEvents.event_type, "sync_operation_duplicate"),
      ))
      .limit(1);

    const byCleaner = await db.select({
      cleanerId: users.id,
      cleanerName: users.name,
      applied: sql<number>`count(case when ${syncOperations.status} = 'applied' then 1 end)`.mapWith(Number),
      rejected: sql<number>`count(case when ${syncOperations.status} = 'rejected' then 1 end)`.mapWith(Number),
      retryable: sql<number>`count(case when ${syncOperations.status} = 'retryable_error' then 1 end)`.mapWith(Number),
    })
      .from(syncOperations)
      .innerJoin(users, eq(syncOperations.cleaner_id, users.id))
      .innerJoin(tasks, eq(syncOperations.task_id, tasks.id))
      .innerJoin(rooms, eq(tasks.room_id, rooms.id))
      .innerJoin(objects, eq(rooms.object_id, objects.id))
      .where(eq(objects.company_id, user.company_id))
      .groupBy(users.id, users.name);

    const duplicateByCleaner = await db.select({
      cleanerId: users.id,
      duplicate: sql<number>`count(${taskEvents.id})`.mapWith(Number),
    })
      .from(taskEvents)
      .innerJoin(users, eq(taskEvents.actor_id, users.id))
      .innerJoin(tasks, eq(taskEvents.task_id, tasks.id))
      .innerJoin(rooms, eq(tasks.room_id, rooms.id))
      .innerJoin(objects, eq(rooms.object_id, objects.id))
      .where(and(
        eq(objects.company_id, user.company_id),
        eq(taskEvents.event_type, "sync_operation_duplicate"),
      ))
      .groupBy(users.id);

    const duplicateByCleanerMap = new Map<number, number>();
    for (const row of duplicateByCleaner) {
      duplicateByCleanerMap.set(row.cleanerId, row.duplicate);
    }

    const mergedByCleaner = byCleaner.map((row) => ({
      ...row,
      duplicate: duplicateByCleanerMap.get(row.cleanerId) ?? 0,
    }));

    return {
      summary: {
        ...(summary[0] ?? {
          applied: 0,
          rejected: 0,
          retryable: 0,
          oldestRetryableAt: null,
        }),
        duplicate: duplicateSummary[0]?.duplicate ?? 0,
      },
      by_cleaner: mergedByCleaner,
    };
  })
  .get("/:task_id/ai-rating", async ({params, user, set}) => {
    const taskId = parseInt(params.task_id);
    const rows = await db.select({
      task: tasks,
      room: rooms,
      object: objects,
    })
      .from(tasks)
      .innerJoin(rooms, eq(tasks.room_id, rooms.id))
      .innerJoin(objects, eq(rooms.object_id, objects.id))
      .where(and(
        eq(tasks.id, taskId),
        eq(objects.company_id, user.company_id),
      ))
      .limit(1);

    if (!rows.length) {
      set.status = 404;
      return {message: "Task not found"};
    }

    const row = rows[0];
    return {
      task_id: row.task.id,
      ai_status: row.task.ai_status,
      ai_model: row.task.ai_model,
      ai_score: row.task.ai_score,
      ai_feedback: row.task.ai_feedback,
      ai_raw: row.task.ai_raw,
      ai_rated_at: row.task.ai_rated_at,
    };
  })
  .post("/:task_id/ai-rate", async ({params, body, user, set}) => {
    const taskId = parseInt(params.task_id);
    const mode = (body.mode ?? "auto") as AiRatingMode;
    const allowedModes: AiRatingMode[] = ["auto", "primary", "escalation", "override"];
    if (!allowedModes.includes(mode)) {
      set.status = 400;
      return {message: "Unsupported mode"};
    }

    if (mode === "override" && user.role !== "admin") {
      set.status = 403;
      return {message: "Only admins can trigger override model reruns"};
    }

    const rows = await db.select({
      task: tasks,
      room: rooms,
      object: objects,
    })
      .from(tasks)
      .innerJoin(rooms, eq(tasks.room_id, rooms.id))
      .innerJoin(objects, eq(rooms.object_id, objects.id))
      .where(and(
        eq(tasks.id, taskId),
        eq(objects.company_id, user.company_id),
      ))
      .limit(1);

    if (!rows.length) {
      set.status = 404;
      return {message: "Task not found"};
    }

    const row = rows[0];
    if (!row.task.photo_before || !row.task.photo_after) {
      set.status = 400;
      return {message: "Task needs both before and after photos for AI rating"};
    }

    await db.update(tasks)
      .set({
        ai_status: "pending",
      })
      .where(eq(tasks.id, row.task.id));

    try {
      const rating = await rateCleaningTask({
        photoBefore: row.task.photo_before,
        photoAfter: row.task.photo_after,
        roomType: row.room.type,
        cleaningStandard: row.object.cleaning_standard,
        mode,
      });

      const updated = await db.update(tasks)
        .set({
          ai_status: "succeeded",
          ai_model: rating.model,
          ai_score: rating.score,
          ai_feedback: rating.feedback,
          ai_raw: rating.raw,
          ai_rated_at: new Date(),
        })
        .where(eq(tasks.id, row.task.id))
        .returning();

      await db.insert(taskEvents).values({
        task_id: row.task.id,
        actor_id: user.id,
        event_type: "ai_rated_manual",
        event_time: new Date(),
        metadata: {
          mode,
          model: rating.model,
          confidence: rating.confidence,
          escalated: rating.escalated,
          usage: rating.usage,
        },
      });

      return {
        task: updated[0],
        rating,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "AI rating failed";
      await db.update(tasks)
        .set({
          ai_status: "failed",
          ai_raw: {
            error: message,
          },
          ai_rated_at: new Date(),
        })
        .where(eq(tasks.id, row.task.id));

      await db.insert(taskEvents).values({
        task_id: row.task.id,
        actor_id: user.id,
        event_type: "ai_rating_failed_manual",
        event_time: new Date(),
        metadata: {
          mode,
          error: message,
        },
      });

      set.status = 502;
      return {
        message: "AI rerun failed",
        error: message,
      };
    }
  }, {
    body: t.Object({
      mode: t.Optional(t.String()),
    }),
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
  });
