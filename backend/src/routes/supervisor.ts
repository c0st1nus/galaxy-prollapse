import { Elysia, t } from "elysia";
import { db } from "../database";
import { tasks, checklists, users, rooms, objects } from "../database/schema";
import { eq, and } from "drizzle-orm";
import { jwt } from "@elysiajs/jwt";
import { config } from "../utils/config";

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
    // Check if role is supervisor or admin
    // @ts-ignore
    if (profile.role !== "supervisor" && profile.role !== "admin") {
        set.status = 403;
        throw new Error("Forbidden");
    }
    return { user: profile };
  })
  .get("/pending", async ({ user }) => {
    // Tasks that are completed but not yet inspected?
    // or tasks that are completed and don't have a checklist?
    // User request: "GET /inspections/pending — Список завершенных работ, требующих проверки."
    
    // In SQL: select tasks where status = 'completed' and not exists (select 1 from checklists where task_id = tasks.id)
    // Drizzle doesn't support NOT EXISTS easily in query builder, let's just fetch completed tasks and maybe checklists, or use left join.
    
    // For simplicity: fetch all completed tasks and filter in js if needed, or assumming we just show all completed tasks to be potentially re-inspected.
    // Better: Left join checklists, filter where checklist.id is null.
    
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
        // @ts-ignore
        eq(objects.company_id, user.company_id)
        // checking for null checklist
        // null check depends on how we structure the query result 
    ));
    
    // Filtering manually for simplicity as Drizzle's isNull with joins can be tricky without alias
    // @ts-ignore
    return pendingInspections.filter(row => !row.checklists); 
  })
  .post("/:task_id", async ({ params, body, user, set }) => {
    // Create checklist
    const taskId = parseInt(params.task_id);
    const existing = await db.select().from(checklists).where(eq(checklists.task_id, taskId));
    if (existing.length > 0) {
        set.status = 400;
        return { message: "Inspection already exists" };
    }
    
    const newTask = await db.insert(checklists).values({
        task_id: taskId,
        inspector_id: user.id as number,
        score: body.score,
        comment: body.comment
    }).returning();
    
    return newTask[0];
  }, {
    body: t.Object({
        score: t.Integer({ minimum: 1, maximum: 5 }),
        comment: t.Optional(t.String())
    })
  });
