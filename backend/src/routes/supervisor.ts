import {Elysia, t} from "elysia";
import {db} from "../database";
import {checklists, geofenceViolations, objects, rooms, syncOperations, tasks} from "../database/schema";
import {and, eq, isNull, sql} from "drizzle-orm";
import {jwt} from "@elysiajs/jwt";
import {config} from "../utils/config";
import type {JwtPayload} from "../utils/types";
import {normalizeUserRole} from "../utils/roles";

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
    return {
        task_id: taskId,
        ai_status: t0.ai_status,
        ai_model: t0.ai_model,
        ai_score: t0.ai_score,
        ai_feedback: t0.ai_feedback,
        ai_raw: t0.ai_raw,
        ai_rated_at: t0.ai_rated_at,
    };
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

    // mark as pending
    await db.update(tasks)
        .set({ ai_status: "pending" })
        .where(eq(tasks.id, taskId));

    // attempt ai rating if openai key is configured
    if (config.OPENAI_API_KEY) {
        try {
            const prompt = `Rate the cleaning quality of a ${room.type} room (${room.area_sqm} sqm) at "${object.address}" with standard "${object.cleaning_standard}". Photo before: ${task.photo_before || "none"}. Photo after: ${task.photo_after || "none"}. Rate 1-5 and provide feedback. Respond in JSON: {"score":N,"feedback":"...","issues":[]}`;

            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${config.OPENAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: "You are a cleaning quality inspector. Rate work quality 1-5 based on context. Always respond with valid JSON." },
                        { role: "user", content: prompt },
                    ],
                    max_tokens: 500,
                }),
            });

            const data = await response.json() as any;
            const content = data.choices?.[0]?.message?.content || "{}";
            let parsed: any = {};
            try {
                parsed = JSON.parse(content);
            } catch {
                parsed = { score: 3, feedback: content, issues: [] };
            }

            await db.update(tasks).set({
                ai_status: "succeeded",
                ai_model: "gpt-4o-mini",
                ai_score: Math.min(5, Math.max(1, Number(parsed.score) || 3)),
                ai_feedback: parsed.feedback || content,
                ai_raw: data,
                ai_rated_at: new Date(),
            }).where(eq(tasks.id, taskId));

            const updated = await db.select().from(tasks).where(eq(tasks.id, taskId));
            return {
                task_id: taskId,
                ai_status: updated[0].ai_status,
                ai_model: updated[0].ai_model,
                ai_score: updated[0].ai_score,
                ai_feedback: updated[0].ai_feedback,
                ai_raw: updated[0].ai_raw,
                ai_rated_at: updated[0].ai_rated_at,
            };
        } catch (err: any) {
            await db.update(tasks).set({
                ai_status: "failed",
                ai_feedback: err?.message || "AI rating failed",
            }).where(eq(tasks.id, taskId));
        }
    }

    // return current state
    const updated = await db.select().from(tasks).where(eq(tasks.id, taskId));
    return {
        task_id: taskId,
        ai_status: updated[0].ai_status,
        ai_model: updated[0].ai_model,
        ai_score: updated[0].ai_score,
        ai_feedback: updated[0].ai_feedback,
        ai_raw: updated[0].ai_raw,
        ai_rated_at: updated[0].ai_rated_at,
    };
  })
  // analytics: quality trend (ai score vs inspection score)
  .get("/analytics/quality", async ({ user }) => {
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
    ))
    .groupBy(sql`to_char(${tasks.timestamp_end}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${tasks.timestamp_end}, 'YYYY-MM-DD')`);

    return result;
  })
  // analytics: geofence violations
  .get("/analytics/geofence", async ({ user }) => {
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
    .where(eq(objects.company_id, user.company_id))
    .groupBy(sql`to_char(${geofenceViolations.created_at}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${geofenceViolations.created_at}, 'YYYY-MM-DD')`);

    return result;
  })
  // analytics: sync health
  .get("/analytics/sync", async ({ user }) => {
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
    .where(eq(objects.company_id, user.company_id))
    .groupBy(sql`to_char(${syncOperations.created_at}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${syncOperations.created_at}, 'YYYY-MM-DD')`);

    return result;
  });
