import {Elysia, t} from "elysia";
import {db} from "../database";
import {companies, objects, rooms, tasks, users} from "../database/schema";
import {and, eq, sql} from "drizzle-orm";
import {jwt} from "@elysiajs/jwt";
import {config} from "../utils/config";
import type {JwtPayload} from "../utils/types";

const roleEnum = t.Union([
    t.Literal("admin"),
    t.Literal("supervisor"),
    t.Literal("cleaner"),
    t.Literal("client"),
]);

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
      const user: JwtPayload = {
          id: Number(profile.id),
          role: profile.role as JwtPayload["role"],
          company_id: Number(profile.company_id),
      };
      if (user.role !== "admin") {
        set.status = 403;
        throw new Error("Forbidden");
    }
      return {user};
  })
  .get("/analytics/efficiency", async ({ user }) => {
      // stats: sqm cleaned by each employee
    const result = await db.select({
        cleanerName: users.name,
        totalArea: sql<number>`sum(${rooms.area_sqm})`.mapWith(Number)
    })
    .from(tasks)
    .innerJoin(users, eq(tasks.cleaner_id, users.id))
    .innerJoin(rooms, eq(tasks.room_id, rooms.id))
    .where(and(
        eq(tasks.status, "completed"),
        eq(users.company_id, user.company_id)
    ))
    .groupBy(users.name);
    
    return result;
  })
  .get("/objects/status", async ({ user }) => {
      // aggregated status per object: total/pending/in_progress/completed task counts
      const result = await db.select({
          objectId: objects.id,
          address: objects.address,
          description: objects.description,
          totalTasks: sql<number>`count(
          ${tasks.id}
          )`.mapWith(Number),
          pendingTasks: sql<number>`count(case when
          ${tasks.status}
          =
          'pending'
          then
          1
          end
          )`.mapWith(Number),
          inProgressTasks: sql<number>`count(case when
          ${tasks.status}
          =
          'in_progress'
          then
          1
          end
          )`.mapWith(Number),
          completedTasks: sql<number>`count(case when
          ${tasks.status}
          =
          'completed'
          then
          1
          end
          )`.mapWith(Number),
      })
          .from(objects)
          .leftJoin(rooms, eq(rooms.object_id, objects.id))
          .leftJoin(tasks, eq(tasks.room_id, rooms.id))
          .where(eq(objects.company_id, user.company_id))
          .groupBy(objects.id, objects.address, objects.description);

      return result;
  })
  .post("/users", async ({ body, user, set }) => {
      const hashedPassword = await Bun.password.hash(body.password);
    const newUser = await db.insert(users).values({
        company_id: user.company_id,
        name: body.name,
        email: body.email,
        role: body.role,
        password: hashedPassword
    }).returning();

    // never leak password hashes to clients.
    const {password, ...safeUser} = newUser[0];
    return safeUser;
  }, {
    body: t.Object({
        name: t.String(),
        email: t.String(),
        role: roleEnum,
        password: t.String()
    })
  })
  .post("/objects", async ({ body, user }) => {
    const newObject = await db.insert(objects).values({
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
    .post("/rooms", async ({body, user, set}) => {
        // verify object belongs to this company
        const obj = await db.select().from(objects).where(
            and(eq(objects.id, body.object_id), eq(objects.company_id, user.company_id))
        );
        if (!obj.length) {
            set.status = 403;
            return {message: "Object does not belong to your company"};
        }

    const newRoom = await db.insert(rooms).values({
        object_id: body.object_id,
        type: body.type as "office" | "bathroom" | "corridor",
        area_sqm: body.area_sqm
    }).returning();
    
    return newRoom[0];
  }, {
    body: t.Object({
        object_id: t.Integer(),
        type: t.String(),
        area_sqm: t.Integer()
    })
  })
    .post("/tasks", async ({body, user, set}) => {
        // verify room belongs to this company (room -> object -> company)
        const room = await db.select().from(rooms)
            .innerJoin(objects, eq(rooms.object_id, objects.id))
            .where(and(eq(rooms.id, body.room_id), eq(objects.company_id, user.company_id)));
        if (!room.length) {
            set.status = 403;
            return {message: "Room does not belong to your company"};
        }

        // verify cleaner belongs to this company
        const cleaner = await db.select().from(users)
            .where(and(
                eq(users.id, body.cleaner_id),
                eq(users.company_id, user.company_id),
                eq(users.role, "cleaner")
            ));
        if (!cleaner.length) {
            set.status = 403;
            return {message: "Cleaner does not belong to your company"};
        }

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
      const company = await db.select().from(companies).where(eq(companies.id, user.company_id));
    if (!company.length) {
        throw new Error("Company not found");
    }
    return company[0];
  })
  .patch("/company", async ({ body, user }) => {
    const updated = await db.update(companies)
        .set({ name: body.name })
        .where(eq(companies.id, user.company_id))
        .returning();
    
    return updated[0];
  }, {
    body: t.Object({
        name: t.String()
    })
  })
  .delete("/company", async ({ user }) => {
    const deleted = await db.delete(companies)
        .where(eq(companies.id, user.company_id))
        .returning();
    
    return { message: "Company deleted successfully", deletedCompany: deleted[0] };
  });
