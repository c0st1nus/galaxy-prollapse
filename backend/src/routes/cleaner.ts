import { Elysia, t } from "elysia";
import { db } from "../database";
import { tasks, rooms, objects } from "../database/schema";
import { eq, and } from "drizzle-orm";
import { jwt } from "@elysiajs/jwt";
import { config } from "../utils/config";

// Mock middleware to check auth (derived from jwt) - using header for simplicity in this example
// In production, use value from cookie or header and verify.

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
    return { user: profile };
  })
  .get("/my", async ({ user }) => {
    // Implement: Get tasks for cleaner (today)
    // For simplicity, returning all tasks assigned to me pending or in_progress
    // In real app, filter by date.
    
    // Join with rooms and objects to get details
    const result = await db.select({
        task: tasks,
        room: rooms,
        object: objects
    })
    .from(tasks)
    .innerJoin(rooms, eq(tasks.room_id, rooms.id))
    .innerJoin(objects, eq(rooms.object_id, objects.id))
    .where(and(
        eq(tasks.cleaner_id, user.id as number),
        // eq(tasks.status, "pending") // or in_progress, showing all for now
    ));
    
    return result;
  })
  .patch("/:id/start", async ({ params, user, set }) => {
    const taskId = parseInt(params.id);
    const updated = await db.update(tasks)
        .set({ 
            status: "in_progress",
            timestamp_start: new Date()
        })
        .where(and(eq(tasks.id, taskId), eq(tasks.cleaner_id, user.id as number)))
        .returning();
        
    if (!updated.length) {
        set.status = 404;
        return { message: "Task not found or not assigned to you" };
    }
    
    return updated[0];
  })
  .patch("/:id/complete", async ({ params, body, user, set }) => {
    const taskId = parseInt(params.id);
    const updated = await db.update(tasks)
        .set({ 
            status: "completed",
            timestamp_end: new Date(),
            photo_after: body.photo_after // Assuming URL or base64 string
        })
        .where(and(eq(tasks.id, taskId), eq(tasks.cleaner_id, user.id as number)))
        .returning();
        
    if (!updated.length) {
        set.status = 404;
        return { message: "Task not found or not assigned to you" };
    }
    
    return updated[0];
  }, {
    body: t.Object({
        photo_after: t.String()
    })
  });
