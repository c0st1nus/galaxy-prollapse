import {Elysia, t} from "elysia";
import {db} from "../database";
import {checklists, objects, rooms, tasks} from "../database/schema";
import {and, eq, isNull} from "drizzle-orm";
import {jwt} from "@elysiajs/jwt";
import {config} from "../utils/config";
import type {JwtPayload} from "../utils/types";

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
