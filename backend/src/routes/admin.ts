import { Elysia, t } from "elysia";
import { db } from "../database";
import { users, tasks, rooms, objects } from "../database/schema";
import { eq, sql } from "drizzle-orm";
import { jwt } from "@elysiajs/jwt";
import { config } from "../utils/config";

export const adminRoutes = new Elysia()
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
    // @ts-ignore
    if (profile.role !== "admin") {
        set.status = 403;
        throw new Error("Forbidden");
    }
    return { user: profile };
  })
  .get("/analytics/efficiency", async () => {
    // Stats: sqm cleaned by each employee.
    // Sum area_sqm of rooms where task.status = 'completed' grouped by cleaner.
    
    const result = await db.select({
        cleanerName: users.name,
        totalArea: sql<number>`sum(${rooms.area_sqm})`.mapWith(Number)
    })
    .from(tasks)
    .innerJoin(users, eq(tasks.cleaner_id, users.id))
    .innerJoin(rooms, eq(tasks.room_id, rooms.id))
    .where(eq(tasks.status, "completed"))
    .groupBy(users.name);
    
    return result;
  })
  .get("/objects/status", async () => {
    // Monitoring of all objects.
    // Return all objects with some status summary?
    // Let's return objects and maybe count of pending/completed tasks.
    
    // Simple fetch of all objects for now as "status" wasn't strictly defined by user other than "monitoring".
    // I'll add a simple count of tasks if possible, or just list objects.
    // Let's list objects with a dummy status or aggregated task info if feasible.
    // For MVP, just returning objects.
    
    const allObjects = await db.select().from(objects);
    return allObjects; 
  });
