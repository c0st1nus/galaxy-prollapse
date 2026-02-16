import {Elysia, t} from "elysia";
import {db} from "../database";
import {objects, rooms, tasks} from "../database/schema";
import {and, eq, gte, lt, SQL} from "drizzle-orm";
import {jwt} from "@elysiajs/jwt";
import {config} from "../utils/config";
import type {JwtPayload} from "../utils/types";
import {parseCoordinate} from "../services/geofencing";
import {
  completeTaskAction,
  getTaskAiRatingForCleaner,
  getTaskChecklistForCleaner,
  startTaskAction,
  TaskActionError,
  toCleanerIdentity,
  updateTaskChecklistAction,
} from "../services/task-actions";

function parseDateOnly(value: string) {
    const [year, month, day] = value.split("-").map((part) => Number(part));
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
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
      const user: JwtPayload = {
          id: Number(profile.id),
          role: profile.role as JwtPayload["role"],
          company_id: Number(profile.company_id),
      };
      if (user.role !== "cleaner") {
          set.status = 403;
          throw new Error("Forbidden: only cleaners can access task routes");
      }
      return {user};
  })
  .get("/my", async ({user, query}) => {
    // build dynamic filter conditions
    const conditions: SQL[] = [
      eq(tasks.cleaner_id, user.id),
      eq(objects.company_id, user.company_id),
    ];

    // optional status filter
    if (query.status) {
      conditions.push(eq(tasks.status, query.status as "pending" | "in_progress" | "completed"));
    }

    // optional date range filter (on timestamp_start)
    if (query.date_from) {
      conditions.push(gte(tasks.timestamp_start, new Date(query.date_from)));
    }
    if (query.date_to) {
      conditions.push(lte(tasks.timestamp_start, new Date(query.date_to)));
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

    try {
      const result = await startTaskAction({
        cleaner: toCleanerIdentity(user.id, user.company_id),
        taskId,
        photoBefore: body.photo_before ?? null,
        photoBeforeUrl: body.photo_before_url ?? null,
        latitude: parseCoordinate(body.latitude),
        longitude: parseCoordinate(body.longitude),
        clientOperationId: body.client_operation_id ?? null,
      });

      return result;
    } catch (error) {
      if (error instanceof TaskActionError) {
        set.status = error.status;
        return {message: error.message, code: error.code};
      }
      throw error;
    }
  }, {
    body: t.Object({
      photo_before: t.Optional(t.File()),
      photo_before_url: t.Optional(t.String()),
      latitude: t.Optional(t.Union([t.String(), t.Number()])),
      longitude: t.Optional(t.Union([t.String(), t.Number()])),
      client_operation_id: t.Optional(t.String()),
    })
  })
  .patch("/:id/complete", async ({ params, body, user, set }) => {
    const taskId = parseInt(params.id);

    try {
      const result = await completeTaskAction({
        cleaner: toCleanerIdentity(user.id, user.company_id),
        taskId,
        photoAfter: body.photo_after ?? null,
        photoAfterUrl: body.photo_after_url ?? null,
        latitude: parseCoordinate(body.latitude),
        longitude: parseCoordinate(body.longitude),
        clientOperationId: body.client_operation_id ?? null,
      });

      return result;
    } catch (error) {
      if (error instanceof TaskActionError) {
        set.status = error.status;
        return {message: error.message, code: error.code};
      }
      throw error;
    }
  }, {
    body: t.Object({
      photo_after: t.Optional(t.File()),
      photo_after_url: t.Optional(t.String()),
      latitude: t.Optional(t.Union([t.String(), t.Number()])),
      longitude: t.Optional(t.Union([t.String(), t.Number()])),
      client_operation_id: t.Optional(t.String()),
    })
  })
  .get("/:id/checklist", async ({params, user, set}) => {
    const taskId = parseInt(params.id);
    try {
      return await getTaskChecklistForCleaner(toCleanerIdentity(user.id, user.company_id), taskId);
    } catch (error) {
      if (error instanceof TaskActionError) {
        set.status = error.status;
        return {message: error.message, code: error.code};
      }
      throw error;
    }
  })
  .patch("/:id/checklist", async ({params, user, body, set}) => {
    const taskId = parseInt(params.id);

    try {
      return await updateTaskChecklistAction({
        cleaner: toCleanerIdentity(user.id, user.company_id),
        taskId,
        items: body.items,
        clientOperationId: body.client_operation_id ?? null,
      });
    } catch (error) {
      if (error instanceof TaskActionError) {
        set.status = error.status;
        return {message: error.message, code: error.code};
      }
      throw error;
    }
  }, {
    body: t.Object({
      items: t.Array(t.Object({
        id: t.Optional(t.String()),
        label: t.String(),
        required: t.Optional(t.Boolean()),
        done: t.Boolean(),
        note: t.Optional(t.String()),
      })),
      client_operation_id: t.Optional(t.String()),
    }),
  })
  .get("/:id/ai-rating", async ({params, user, set}) => {
    const taskId = parseInt(params.id);
    try {
      return await getTaskAiRatingForCleaner(toCleanerIdentity(user.id, user.company_id), taskId);
    } catch (error) {
      if (error instanceof TaskActionError) {
        set.status = error.status;
        return {message: error.message, code: error.code};
      }
      throw error;
    }
  });
