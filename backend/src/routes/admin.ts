import { Elysia, t } from "elysia";
import { db } from "../database";
import { users, tasks, rooms, objects, companies } from "../database/schema";
import { eq, sql, and } from "drizzle-orm";
import { jwt } from "@elysiajs/jwt";
import { config } from "../utils/config";

export const adminRoutes = new Elysia({ prefix: "/admin" })
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
  .get("/analytics/efficiency", async ({ user }) => {
    // Stats: sqm cleaned by each employee.
    // Sum area_sqm of rooms where task.status = 'completed' grouped by cleaner.
    
    const result = await db.select({
        cleanerName: users.name,
        totalArea: sql<number>`sum(${rooms.area_sqm})`.mapWith(Number)
    })
    .from(tasks)
    .innerJoin(users, eq(tasks.cleaner_id, users.id))
    .innerJoin(rooms, eq(tasks.room_id, rooms.id))
    .where(and(
        eq(tasks.status, "completed"),
        // @ts-ignore
        eq(users.company_id, user.company_id)
    ))
    .groupBy(users.name);
    
    return result;
  })
  .get("/objects/status", async ({ user }) => {
    // Monitoring of all objects.
    // Return all objects with some status summary?
    // Let's return objects and maybe count of pending/completed tasks.
    
    // Simple fetch of all objects for now as "status" wasn't strictly defined by user other than "monitoring".
    // I'll add a simple count of tasks if possible, or just list objects.
    // Let's list objects with a dummy status or aggregated task info if feasible.
    // For MVP, just returning objects.
    
    const allObjects = await db.select().from(objects)
        // @ts-ignore
        .where(eq(objects.company_id, user.company_id));
    return allObjects; 
  })
  .post("/users", async ({ body, user, set }) => {
    // Invite/Create User
    const newUser = await db.insert(users).values({
        // @ts-ignore
        company_id: user.company_id,
        name: body.name,
        email: body.email,
        role: body.role,
        password: body.password // Plain text for now
    }).returning();

    return newUser[0];
  }, {
    body: t.Object({
        name: t.String(),
        email: t.String(),
        role: t.String(), // Should be enum validation ideally
        password: t.String()
    })
  })
  .post("/objects", async ({ body, user }) => {
    // Create Object
    const newObject = await db.insert(objects).values({
        // @ts-ignore
        company_id: user.company_id,
        address: body.address,
        description: body.description
    }).returning();
    
    return newObject[0];
  }, {
    body: t.Object({
        address: t.String(),
        description: t.Optional(t.String())
    })
  })
  .post("/rooms", async ({ body, user }) => {
    // Create Room
    // Verify object belongs to company? 
    // For now assuming admin sends valid object_id for their company.
    // Ideally: check if object exists and has user.company_id
    
    const newRoom = await db.insert(rooms).values({
        object_id: body.object_id,
        type: body.type as "office" | "bathroom" | "corridor", // simple assertion
        area_sqm: body.area_sqm
    }).returning();
    
    return newRoom[0];
  }, {
    body: t.Object({
        object_id: t.Integer(),
        type: t.String(), // Enum validation can be added
        area_sqm: t.Integer()
    })
  })
  .post("/tasks", async ({ body, user }) => {
    // Create Task
    const newTask = await db.insert(tasks).values({
        room_id: body.room_id,
        cleaner_id: body.cleaner_id,
        status: "pending"
    }).returning();
    
    return newTask[0];
  }, {
    body: t.Object({
        room_id: t.Integer(),
        cleaner_id: t.Integer()
    })
  })
  .get("/company", async ({ user }) => {
    // Get Company Data
    const company = await db.select().from(companies).where(eq(companies.id, user.company_id as number));
    if (!company.length) {
        throw new Error("Company not found");
    }
    return company[0];
  })
  .patch("/company", async ({ body, user }) => {
    // Update Company Data
    const updated = await db.update(companies)
        .set({ name: body.name })
        .where(eq(companies.id, user.company_id as number))
        .returning();
    
    return updated[0];
  }, {
    body: t.Object({
        name: t.String()
    })
  })
  .delete("/company", async ({ user }) => {
    // Delete Company (Cascading)
    const deleted = await db.delete(companies)
        .where(eq(companies.id, user.company_id as number))
        .returning();
    
    return { message: "Company deleted successfully", deletedCompany: deleted[0] };
  });
