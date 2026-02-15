import {Elysia, t} from "elysia";
import {db} from "../database";
import {objects, rooms, tasks} from "../database/schema";
import {and, eq, gte, lt, SQL} from "drizzle-orm";
import {jwt} from "@elysiajs/jwt";
import {config} from "../utils/config";
import {uploadFile} from "../services/storage";
import type {JwtPayload} from "../utils/types";

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
    
    let photoBeforePath = undefined;
    if (body.photo_before) {
        photoBeforePath = await uploadFile(body.photo_before);
    }

    const updated = await db.update(tasks)
        .set({ 
            status: "in_progress",
            timestamp_start: new Date(),
            photo_before: photoBeforePath
        })
        .where(and(eq(tasks.id, taskId), eq(tasks.cleaner_id, user.id)))
        .returning();
        
    if (!updated.length) {
        set.status = 404;
        return { message: "Task not found or not assigned to you" };
    }
    
    return updated[0];
  }, {
    body: t.Object({
        photo_before: t.Optional(t.File())
    })
  })
  .patch("/:id/complete", async ({ params, body, user, set }) => {
    const taskId = parseInt(params.id);
    
    let photoAfterPath = undefined;
    if (body.photo_after) {
        photoAfterPath = await uploadFile(body.photo_after);
    }
    
    const updated = await db.update(tasks)
        .set({ 
            status: "completed",
            timestamp_end: new Date(),
            photo_after: photoAfterPath
        })
        .where(and(eq(tasks.id, taskId), eq(tasks.cleaner_id, user.id)))
        .returning();
        
    if (!updated.length) {
        set.status = 404;
        return { message: "Task not found or not assigned to you" };
    }
    
    return updated[0];
  }, {
    body: t.Object({
        photo_after: t.Optional(t.File())
    })
  });
