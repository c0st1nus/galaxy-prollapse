import {Elysia, t} from "elysia";
import {db} from "../database";
import {
  checklistTemplates,
  checklists,
  companies,
  objects,
  rooms,
  syncOperations,
  taskEvents,
  tasks,
  users,
} from "../database/schema";
import {and, desc, eq, sql} from "drizzle-orm";
import {jwt} from "@elysiajs/jwt";
import {config} from "../utils/config";
import type {JwtPayload} from "../utils/types";
import {buildDefaultChecklistItems} from "../services/task-checklists";

function toDbNumeric(value: number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Number.isFinite(value)) {
    return null;
  }
  return String(value);
}

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

    const byObject = await db.select({
      objectId: objects.id,
      address: objects.address,
      ratedTasks: sql<number>`count(case when ${tasks.ai_score} is not null then 1 end)`.mapWith(Number),
      avgAiScore: sql<number>`coalesce(avg(${tasks.ai_score}), 0)`.mapWith(Number),
      avgInspectionScore: sql<number>`coalesce(avg(${checklists.score}), 0)`.mapWith(Number),
      avgScoreDelta: sql<number>`coalesce(avg(abs(${tasks.ai_score} - ${checklists.score})), 0)`.mapWith(Number),
    })
      .from(objects)
      .leftJoin(rooms, eq(rooms.object_id, objects.id))
      .leftJoin(tasks, eq(tasks.room_id, rooms.id))
      .leftJoin(checklists, eq(checklists.task_id, tasks.id))
      .where(eq(objects.company_id, user.company_id))
      .groupBy(objects.id, objects.address);

    return {
      summary: summary[0] ?? null,
      by_object: byObject,
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
  .get("/analytics/ai-cost", async ({user}) => {
    const rows = await db.select({
      model: tasks.ai_model,
      calls: sql<number>`count(${tasks.id})`.mapWith(Number),
    })
      .from(tasks)
      .innerJoin(rooms, eq(tasks.room_id, rooms.id))
      .innerJoin(objects, eq(rooms.object_id, objects.id))
      .where(and(
        eq(objects.company_id, user.company_id),
        eq(tasks.ai_status, "succeeded"),
      ))
      .groupBy(tasks.ai_model);

    const estimatedInputTokensPerCall: Record<string, number> = {
      "gpt-5-nano": 900,
      "gpt-5-mini": 900,
      "gpt-5.2": 900,
    };
    const estimatedOutputTokensPerCall: Record<string, number> = {
      "gpt-5-nano": 140,
      "gpt-5-mini": 140,
      "gpt-5.2": 140,
    };
    const estimatedCostPerCallUsd: Record<string, number> = {
      "gpt-5-nano": 0.0002,
      "gpt-5-mini": 0.0008,
      "gpt-5.2": 0.003,
    };

    const byModel = rows.map((row) => {
      const model = row.model ?? "unknown";
      const calls = row.calls;
      const estimatedInputTokens = calls * (estimatedInputTokensPerCall[model] ?? 900);
      const estimatedOutputTokens = calls * (estimatedOutputTokensPerCall[model] ?? 140);
      const estimatedCostUsd = calls * (estimatedCostPerCallUsd[model] ?? 0.0008);
      return {
        model,
        calls,
        estimatedInputTokens,
        estimatedOutputTokens,
        estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
      };
    });

    return {
      summary: {
        totalCalls: byModel.reduce((acc, item) => acc + item.calls, 0),
        estimatedInputTokens: byModel.reduce((acc, item) => acc + item.estimatedInputTokens, 0),
        estimatedOutputTokens: byModel.reduce((acc, item) => acc + item.estimatedOutputTokens, 0),
        estimatedCostUsd: Number(
          byModel.reduce((acc, item) => acc + item.estimatedCostUsd, 0).toFixed(6),
        ),
      },
      by_model: byModel,
    };
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
  .post("/users", async ({ body, user }) => {
    const hashedPassword = await Bun.password.hash(body.password);
    const newUser = await db.insert(users).values({
      company_id: user.company_id,
      name: body.name,
      email: body.email,
      role: body.role as "admin" | "supervisor" | "cleaner" | "client",
      password: hashedPassword
    }).returning();

    // never leak password hashes to clients.
    const {password, ...safeUser} = newUser[0];
    return safeUser;
  }, {
    body: t.Object({
      name: t.String(),
      email: t.String(),
      role: t.Union([
        t.Literal("admin"),
        t.Literal("supervisor"),
        t.Literal("cleaner"),
        t.Literal("client"),
      ]),
      password: t.String()
    })
  })
  .post("/objects", async ({ body, user }) => {
    const newObject = await db.insert(objects).values({
      company_id: user.company_id,
      address: body.address,
      description: body.description,
      latitude: toDbNumeric(body.latitude),
      longitude: toDbNumeric(body.longitude),
      geofence_radius_meters: body.geofence_radius_meters ?? 100,
      cleaning_standard: body.cleaning_standard ?? "appa_2",
    }).returning();

    return newObject[0];
  }, {
    body: t.Object({
      address: t.String(),
      description: t.Optional(t.String()),
      latitude: t.Optional(t.Number()),
      longitude: t.Optional(t.Number()),
      geofence_radius_meters: t.Optional(t.Integer({minimum: 1})),
      cleaning_standard: t.Optional(t.String()),
    })
  })
  .patch("/objects/:id/location", async ({params, body, user, set}) => {
    const objectId = parseInt(params.id);
    const objectRow = await db.query.objects.findFirst({
      where: and(
        eq(objects.id, objectId),
        eq(objects.company_id, user.company_id),
      ),
    });
    if (!objectRow) {
      set.status = 404;
      return {message: "Object not found"};
    }

    const updated = await db.update(objects)
      .set({
        latitude: toDbNumeric(body.latitude),
        longitude: toDbNumeric(body.longitude),
        geofence_radius_meters: body.geofence_radius_meters,
      })
      .where(eq(objects.id, objectId))
      .returning();

    return updated[0];
  }, {
    body: t.Object({
      latitude: t.Number(),
      longitude: t.Number(),
      geofence_radius_meters: t.Optional(t.Integer({minimum: 1})),
    }),
  })
  .patch("/objects/:id/cleaning-standard", async ({params, body, user, set}) => {
    const objectId = parseInt(params.id);
    const objectRow = await db.query.objects.findFirst({
      where: and(
        eq(objects.id, objectId),
        eq(objects.company_id, user.company_id),
      ),
    });
    if (!objectRow) {
      set.status = 404;
      return {message: "Object not found"};
    }

    const updated = await db.update(objects)
      .set({
        cleaning_standard: body.cleaning_standard,
      })
      .where(eq(objects.id, objectId))
      .returning();

    return updated[0];
  }, {
    body: t.Object({
      cleaning_standard: t.String(),
    }),
  })
  .get("/checklist-templates", async ({query, user}) => {
    const conditions = [eq(checklistTemplates.company_id, user.company_id)];
    if (query.room_type) {
      conditions.push(eq(checklistTemplates.room_type, query.room_type));
    }
    if (query.cleaning_standard) {
      conditions.push(eq(checklistTemplates.cleaning_standard, query.cleaning_standard));
    }

    return await db.select()
      .from(checklistTemplates)
      .where(and(...conditions))
      .orderBy(desc(checklistTemplates.updated_at), desc(checklistTemplates.version));
  }, {
    query: t.Object({
      room_type: t.Optional(t.Union([
        t.Literal("office"),
        t.Literal("bathroom"),
        t.Literal("corridor"),
      ])),
      cleaning_standard: t.Optional(t.String()),
    }),
  })
  .post("/checklist-templates", async ({body, user}) => {
    const latest = await db.select()
      .from(checklistTemplates)
      .where(and(
        eq(checklistTemplates.company_id, user.company_id),
        eq(checklistTemplates.room_type, body.room_type),
        eq(checklistTemplates.cleaning_standard, body.cleaning_standard),
      ))
      .orderBy(desc(checklistTemplates.version))
      .limit(1);

    const version = body.version ?? ((latest[0]?.version ?? 0) + 1);
    const items = body.items.length
      ? body.items
      : buildDefaultChecklistItems(body.room_type, body.cleaning_standard);

    const created = await db.insert(checklistTemplates).values({
      company_id: user.company_id,
      room_type: body.room_type,
      cleaning_standard: body.cleaning_standard,
      version,
      items,
      created_at: new Date(),
      updated_at: new Date(),
    }).returning();

    return created[0];
  }, {
    body: t.Object({
      room_type: t.Union([
        t.Literal("office"),
        t.Literal("bathroom"),
        t.Literal("corridor"),
      ]),
      cleaning_standard: t.String(),
      version: t.Optional(t.Integer({minimum: 1})),
      items: t.Array(t.Object({
        id: t.Optional(t.String()),
        label: t.String(),
        required: t.Optional(t.Boolean()),
        done: t.Optional(t.Boolean()),
        note: t.Optional(t.String()),
      })),
    }),
  })
  .patch("/checklist-templates/:id", async ({params, body, user, set}) => {
    const templateId = parseInt(params.id);
    const template = await db.query.checklistTemplates.findFirst({
      where: and(
        eq(checklistTemplates.id, templateId),
        eq(checklistTemplates.company_id, user.company_id),
      ),
    });
    if (!template) {
      set.status = 404;
      return {message: "Template not found"};
    }

    const updated = await db.update(checklistTemplates)
      .set({
        items: body.items ?? template.items,
        room_type: body.room_type ?? template.room_type,
        cleaning_standard: body.cleaning_standard ?? template.cleaning_standard,
        version: body.version ?? template.version,
        updated_at: new Date(),
      })
      .where(eq(checklistTemplates.id, templateId))
      .returning();

    return updated[0];
  }, {
    body: t.Object({
      room_type: t.Optional(t.Union([
        t.Literal("office"),
        t.Literal("bathroom"),
        t.Literal("corridor"),
      ])),
      cleaning_standard: t.Optional(t.String()),
      version: t.Optional(t.Integer({minimum: 1})),
      items: t.Optional(t.Array(t.Object({
        id: t.Optional(t.String()),
        label: t.String(),
        required: t.Optional(t.Boolean()),
        done: t.Optional(t.Boolean()),
        note: t.Optional(t.String()),
      }))),
    }),
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
