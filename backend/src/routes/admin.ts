import {Elysia, t} from "elysia";
import {db} from "../database";
import {checklistTemplates, checklists, clientServiceRequests, companies, geofenceViolations, objects, rooms, syncOperations, taskEvents, tasks, users} from "../database/schema";
import {and, desc, eq, sql} from "drizzle-orm";
import {jwt} from "@elysiajs/jwt";
import {config} from "../utils/config";
import type {JwtPayload} from "../utils/types";
import {isCleanerRole, normalizeUserRole} from "../utils/roles";
import {isPredefinedTaskEventType, ROOM_TYPE_OPTIONS, TASK_EVENT_TYPE_OPTIONS} from "../utils/catalogs";

const roleEnum = t.Union([
    t.Literal("admin"),
    t.Literal("admins"),
    t.Literal("supervisor"),
    t.Literal("supervisors"),
    t.Literal("superviser"),
    t.Literal("supervisers"),
    t.Literal("cleaner"),
    t.Literal("cleaners"),
    t.Literal("client"),
    t.Literal("clients"),
]);

type RequestedTask = {
    room_type: string;
    area_sqm: number;
    note?: string;
};

function isSupervisorRole(rawRole: unknown): boolean {
    return normalizeUserRole(rawRole) === "supervisor";
}

function toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const next = Number(value);
    return Number.isFinite(next) ? next : null;
}

function normalizeRequestedTasks(value: unknown): RequestedTask[] {
    if (!Array.isArray(value)) return [];
    const normalized: RequestedTask[] = [];
    for (const raw of value) {
        if (!raw || typeof raw !== "object") continue;
        const row = raw as Record<string, unknown>;
        const roomType = typeof row.room_type === "string" ? row.room_type.trim() : "";
        const area = Number(row.area_sqm);
        const note = typeof row.note === "string" ? row.note.trim() : "";
        if (!roomType || !Number.isInteger(area) || area <= 0) continue;
        normalized.push({
            room_type: roomType,
            area_sqm: area,
            note: note || undefined,
        });
    }
    return normalized;
}

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
      if (user.role !== "admin") {
        set.status = 403;
        throw new Error("Forbidden");
    }
      return {user};
  })
  .get("/catalogs/room-types", () => {
      return {
          options: ROOM_TYPE_OPTIONS,
          allow_custom: true,
      };
  })
  .get("/catalogs/task-event-types", () => {
      return {
          options: TASK_EVENT_TYPE_OPTIONS,
          allow_custom: true,
      };
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
          latitude: objects.latitude,
          longitude: objects.longitude,
          geofence_radius_meters: objects.geofence_radius_meters,
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
          .groupBy(
              objects.id,
              objects.address,
              objects.description,
              objects.latitude,
              objects.longitude,
              objects.geofence_radius_meters
          );

      return result.map((row) => ({
          ...row,
          latitude: row.latitude !== null ? Number(row.latitude) : null,
          longitude: row.longitude !== null ? Number(row.longitude) : null,
      }));
  })
  // list company users (for dropdowns)
  .get("/users", async ({ user }) => {
    const result = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
    }).from(users).where(eq(users.company_id, user.company_id));
    return result.map((u) => ({
        ...u,
        role: normalizeUserRole(u.role) ?? "client",
    }));
  })
  // list company rooms with object info (for dropdowns)
  .get("/rooms", async ({ user }) => {
    const result = await db.select({
        id: rooms.id,
        object_id: rooms.object_id,
        type: rooms.type,
        area_sqm: rooms.area_sqm,
        objectAddress: objects.address,
    })
    .from(rooms)
    .innerJoin(objects, eq(rooms.object_id, objects.id))
    .where(eq(objects.company_id, user.company_id));
    return result;
  })
  // list company tasks with room/object/cleaner context
  .get("/tasks", async ({ user }) => {
    const result = await db
        .select({
            id: tasks.id,
            room_id: tasks.room_id,
            cleaner_id: tasks.cleaner_id,
            status: tasks.status,
            timestamp_start: tasks.timestamp_start,
            timestamp_end: tasks.timestamp_end,
            room_type: rooms.type,
            room_area_sqm: rooms.area_sqm,
            object_id: objects.id,
            object_address: objects.address,
            cleaner_name: users.name,
            cleaner_email: users.email,
        })
        .from(tasks)
        .innerJoin(rooms, eq(tasks.room_id, rooms.id))
        .innerJoin(objects, eq(rooms.object_id, objects.id))
        .innerJoin(users, eq(tasks.cleaner_id, users.id))
        .where(eq(objects.company_id, user.company_id))
        .orderBy(tasks.id);
    return result;
  })
  .get("/client-requests", async ({ user }) => {
      const result = await db.select({
          request: clientServiceRequests,
          client: {
              id: users.id,
              name: users.name,
              email: users.email,
          },
          createdObject: {
              id: objects.id,
              address: objects.address,
          },
      })
          .from(clientServiceRequests)
          .innerJoin(users, eq(clientServiceRequests.client_id, users.id))
          .leftJoin(objects, eq(clientServiceRequests.created_object_id, objects.id))
          .where(eq(clientServiceRequests.company_id, user.company_id))
          .orderBy(desc(clientServiceRequests.created_at), desc(clientServiceRequests.id));

      return result.map((row) => ({
          ...row.request,
          requested_tasks: normalizeRequestedTasks(row.request.requested_tasks),
          latitude: toNumberOrNull(row.request.latitude),
          longitude: toNumberOrNull(row.request.longitude),
          location_accuracy_meters: toNumberOrNull(row.request.location_accuracy_meters),
          client: row.client,
          created_object: row.createdObject && row.createdObject.id ? row.createdObject : null,
      }));
  })
  .post("/client-requests/:id/accept", async ({ params, body, user, set }) => {
      const requestId = parseInt(params.id);
      if (!Number.isInteger(requestId)) {
          set.status = 400;
          return {message: "Invalid request id"};
      }

      const existingRows = await db.select().from(clientServiceRequests).where(and(
          eq(clientServiceRequests.id, requestId),
          eq(clientServiceRequests.company_id, user.company_id),
      )).limit(1);
      if (!existingRows.length) {
          set.status = 404;
          return {message: "Client request not found"};
      }
      const existing = existingRows[0];
      if (existing.status !== "pending") {
          set.status = 400;
          return {message: "Client request has already been processed"};
      }

      const requestedTasks = normalizeRequestedTasks(existing.requested_tasks);
      if (!requestedTasks.length) {
          set.status = 400;
          return {message: "Client request has no valid tasks"};
      }

      const companyAssignees = await db.select({
          id: users.id,
          role: users.role,
      }).from(users).where(eq(users.company_id, user.company_id));

      const supervisors = companyAssignees
          .filter((row) => isSupervisorRole(row.role))
          .sort((a, b) => a.id - b.id);
      const cleaners = companyAssignees
          .filter((row) => isCleanerRole(row.role))
          .sort((a, b) => a.id - b.id);

      if (!supervisors.length) {
          set.status = 400;
          return {message: "No supervisor is available for auto-assignment"};
      }
      if (!cleaners.length) {
          set.status = 400;
          return {message: "No cleaner is available for auto-assignment"};
      }

      const autoSupervisorId = supervisors[0].id;
      const autoCleanerId = cleaners[0].id;

      try {
          const txResult = await db.transaction(async (tx) => {
              const createdObjectRows = await tx.insert(objects).values({
                  company_id: user.company_id,
                  address: existing.object_address,
                  description: existing.object_description,
                  latitude: existing.latitude,
                  longitude: existing.longitude,
                  geofence_radius_meters: existing.geofence_radius_meters,
                  cleaning_standard: existing.recommended_cleaning_standard || "appa_3",
              }).returning();
              const createdObject = createdObjectRows[0];

              const createdRooms = await tx.insert(rooms).values(
                  requestedTasks.map((task) => ({
                      object_id: createdObject.id,
                      type: task.room_type,
                      area_sqm: task.area_sqm,
                  }))
              ).returning({
                  id: rooms.id,
              });

              const createdTasks = createdRooms.length
                  ? await tx.insert(tasks).values(
                      createdRooms.map((room) => ({
                          room_id: room.id,
                          cleaner_id: autoCleanerId,
                          status: "pending" as const,
                      }))
                  ).returning({
                      id: tasks.id,
                  })
                  : [];

              const updatedRows = await tx.update(clientServiceRequests)
                  .set({
                      status: "accepted",
                      decision_note: body.decision_note?.trim() || null,
                      reviewed_by: user.id,
                      reviewed_at: new Date(),
                      assigned_supervisor_id: autoSupervisorId,
                      assigned_cleaner_id: autoCleanerId,
                      created_object_id: createdObject.id,
                  })
                  .where(and(
                      eq(clientServiceRequests.id, requestId),
                      eq(clientServiceRequests.company_id, user.company_id),
                      eq(clientServiceRequests.status, "pending"),
                  ))
                  .returning();

              if (!updatedRows.length) {
                  throw new Error("request_already_processed");
              }

              return {
                  request: updatedRows[0],
                  createdObject,
                  createdRoomCount: createdRooms.length,
                  createdTaskCount: createdTasks.length,
              };
          });

          return {
              request: {
                  ...txResult.request,
                  requested_tasks: normalizeRequestedTasks(txResult.request.requested_tasks),
                  latitude: toNumberOrNull(txResult.request.latitude),
                  longitude: toNumberOrNull(txResult.request.longitude),
                  location_accuracy_meters: toNumberOrNull(txResult.request.location_accuracy_meters),
              },
              created_object: txResult.createdObject,
              created_rooms: txResult.createdRoomCount,
              created_tasks: txResult.createdTaskCount,
          };
      } catch (err) {
          if (err instanceof Error && err.message === "request_already_processed") {
              set.status = 409;
              return {message: "Client request has already been processed"};
          }
          throw err;
      }
  }, {
      body: t.Object({
          decision_note: t.Optional(t.String()),
      }),
  })
  .post("/users", async ({ body, user, set }) => {
      const normalizedRole = normalizeUserRole(body.role);
      if (!normalizedRole) {
          set.status = 400;
          return {message: "Invalid role"};
      }
      const hashedPassword = await Bun.password.hash(body.password);
    const newUser = await db.insert(users).values({
        company_id: user.company_id,
        name: body.name,
        email: body.email,
        role: normalizedRole,
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
  .patch("/users/:id", async ({ params, body, user, set }) => {
      const targetId = parseInt(params.id);
      const existing = await db.select().from(users).where(
          and(eq(users.id, targetId), eq(users.company_id, user.company_id))
      );
      if (!existing.length) {
          set.status = 404;
          return {message: "User not found"};
      }

      const updateData: Record<string, unknown> = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.email !== undefined) updateData.email = body.email;
      if (body.role !== undefined) {
          const normalizedRole = normalizeUserRole(body.role);
          if (!normalizedRole) {
              set.status = 400;
              return {message: "Invalid role"};
          }
          if (targetId === user.id && normalizedRole !== "admin") {
              set.status = 400;
              return {message: "You cannot change your own role from admin"};
          }
          updateData.role = normalizedRole;
      }
      if (body.password !== undefined && body.password.trim()) {
          updateData.password = await Bun.password.hash(body.password);
      }

      if (!Object.keys(updateData).length) {
          const {password, ...safeExisting} = existing[0];
          return safeExisting;
      }

      const updated = await db.update(users)
          .set(updateData)
          .where(eq(users.id, targetId))
          .returning();
      const {password, ...safeUpdated} = updated[0];
      return safeUpdated;
  }, {
      body: t.Object({
          name: t.Optional(t.String()),
          email: t.Optional(t.String()),
          role: t.Optional(roleEnum),
          password: t.Optional(t.String()),
      })
  })
  .delete("/users/:id", async ({ params, user, set }) => {
      const targetId = parseInt(params.id);
      const existing = await db.select().from(users).where(
          and(eq(users.id, targetId), eq(users.company_id, user.company_id))
      );
      if (!existing.length) {
          set.status = 404;
          return {message: "User not found"};
      }
      if (targetId === user.id) {
          set.status = 400;
          return {message: "You cannot delete your own account"};
      }

      const deleted = await db.delete(users).where(eq(users.id, targetId)).returning();
      return {message: "User deleted successfully", deletedUserId: deleted[0]?.id ?? targetId};
  })
  .post("/objects", async ({ body, user }) => {
    const newObject = await db.insert(objects).values({
        company_id: user.company_id,
        address: body.address,
        description: body.description,
        latitude: body.latitude != null ? String(body.latitude) : undefined,
        longitude: body.longitude != null ? String(body.longitude) : undefined,
        geofence_radius_meters: body.geofence_radius_meters ?? 100,
        cleaning_standard: body.cleaning_standard ?? "appa_2"
    }).returning();
    
    return newObject[0];
  }, {
    body: t.Object({
        address: t.String(),
        description: t.Optional(t.String()),
        latitude: t.Optional(t.Number()),
        longitude: t.Optional(t.Number()),
        geofence_radius_meters: t.Optional(t.Integer()),
        cleaning_standard: t.Optional(t.String())
    })
  })
  .patch("/objects/:id", async ({ params, body, user, set }) => {
      const objectId = parseInt(params.id);
      const existing = await db.select().from(objects).where(
          and(eq(objects.id, objectId), eq(objects.company_id, user.company_id))
      );
      if (!existing.length) {
          set.status = 404;
          return {message: "Object not found"};
      }

      const updateData: Record<string, unknown> = {};
      if (body.address !== undefined) updateData.address = body.address;
      if (body.description !== undefined) updateData.description = body.description;
      if (!Object.keys(updateData).length) return existing[0];

      const updated = await db.update(objects)
          .set(updateData)
          .where(eq(objects.id, objectId))
          .returning();
      return updated[0];
  }, {
      body: t.Object({
          address: t.Optional(t.String()),
          description: t.Optional(t.String()),
      })
  })
  .delete("/objects/:id", async ({ params, user, set }) => {
      const objectId = parseInt(params.id);
      const existing = await db.select().from(objects).where(
          and(eq(objects.id, objectId), eq(objects.company_id, user.company_id))
      );
      if (!existing.length) {
          set.status = 404;
          return {message: "Object not found"};
      }

      const deleted = await db.delete(objects).where(eq(objects.id, objectId)).returning();
      return {message: "Object deleted successfully", deletedObjectId: deleted[0]?.id ?? objectId};
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
        type: body.type,
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
    .patch("/rooms/:id", async ({ params, body, user, set }) => {
        const roomId = parseInt(params.id);
        const existing = await db.select({
            room_id: rooms.id,
        })
            .from(rooms)
            .innerJoin(objects, eq(rooms.object_id, objects.id))
            .where(and(eq(rooms.id, roomId), eq(objects.company_id, user.company_id)));
        if (!existing.length) {
            set.status = 404;
            return {message: "Room not found"};
        }

        if (body.object_id !== undefined) {
            const targetObject = await db.select().from(objects).where(
                and(eq(objects.id, body.object_id), eq(objects.company_id, user.company_id))
            );
            if (!targetObject.length) {
                set.status = 403;
                return {message: "Object does not belong to your company"};
            }
        }

        const updateData: Record<string, unknown> = {};
        if (body.object_id !== undefined) updateData.object_id = body.object_id;
        if (body.type !== undefined) updateData.type = body.type;
        if (body.area_sqm !== undefined) updateData.area_sqm = body.area_sqm;
        if (!Object.keys(updateData).length) {
            return (await db.select().from(rooms).where(eq(rooms.id, roomId)))[0];
        }

        const updated = await db.update(rooms)
            .set(updateData)
            .where(eq(rooms.id, roomId))
            .returning();
        return updated[0];
    }, {
        body: t.Object({
            object_id: t.Optional(t.Integer()),
            type: t.Optional(t.String()),
            area_sqm: t.Optional(t.Integer()),
        })
    })
    .delete("/rooms/:id", async ({ params, user, set }) => {
        const roomId = parseInt(params.id);
        const existing = await db.select({
            room_id: rooms.id,
        })
            .from(rooms)
            .innerJoin(objects, eq(rooms.object_id, objects.id))
            .where(and(eq(rooms.id, roomId), eq(objects.company_id, user.company_id)));
        if (!existing.length) {
            set.status = 404;
            return {message: "Room not found"};
        }

        const deleted = await db.delete(rooms).where(eq(rooms.id, roomId)).returning();
        return {message: "Room deleted successfully", deletedRoomId: deleted[0]?.id ?? roomId};
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
                eq(users.company_id, user.company_id)
            ));
        if (!cleaner.length || !isCleanerRole(cleaner[0].role)) {
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
    .patch("/tasks/:id", async ({ params, body, user, set }) => {
        const taskId = parseInt(params.id);
        const existing = await db.select({
            task_id: tasks.id,
        })
            .from(tasks)
            .innerJoin(rooms, eq(tasks.room_id, rooms.id))
            .innerJoin(objects, eq(rooms.object_id, objects.id))
            .where(and(eq(tasks.id, taskId), eq(objects.company_id, user.company_id)));
        if (!existing.length) {
            set.status = 404;
            return {message: "Task not found"};
        }

        if (body.room_id !== undefined) {
            const room = await db.select().from(rooms)
                .innerJoin(objects, eq(rooms.object_id, objects.id))
                .where(and(eq(rooms.id, body.room_id), eq(objects.company_id, user.company_id)));
            if (!room.length) {
                set.status = 403;
                return {message: "Room does not belong to your company"};
            }
        }

        if (body.cleaner_id !== undefined) {
            const cleaner = await db.select().from(users).where(and(
                eq(users.id, body.cleaner_id),
                eq(users.company_id, user.company_id)
            ));
            if (!cleaner.length || !isCleanerRole(cleaner[0].role)) {
                set.status = 403;
                return {message: "Cleaner does not belong to your company"};
            }
        }

        const updateData: Record<string, unknown> = {};
        if (body.room_id !== undefined) updateData.room_id = body.room_id;
        if (body.cleaner_id !== undefined) updateData.cleaner_id = body.cleaner_id;
        if (body.status !== undefined) updateData.status = body.status;
        if (!Object.keys(updateData).length) {
            return (await db.select().from(tasks).where(eq(tasks.id, taskId)))[0];
        }

        const updated = await db.update(tasks)
            .set(updateData)
            .where(eq(tasks.id, taskId))
            .returning();
        return updated[0];
    }, {
        body: t.Object({
            room_id: t.Optional(t.Integer()),
            cleaner_id: t.Optional(t.Integer()),
            status: t.Optional(t.Union([
                t.Literal("pending"),
                t.Literal("in_progress"),
                t.Literal("completed"),
            ])),
        })
    })
    .delete("/tasks/:id", async ({ params, user, set }) => {
        const taskId = parseInt(params.id);
        const existing = await db.select({
            task_id: tasks.id,
        })
            .from(tasks)
            .innerJoin(rooms, eq(tasks.room_id, rooms.id))
            .innerJoin(objects, eq(rooms.object_id, objects.id))
            .where(and(eq(tasks.id, taskId), eq(objects.company_id, user.company_id)));
        if (!existing.length) {
            set.status = 404;
            return {message: "Task not found"};
        }

        const deleted = await db.delete(tasks).where(eq(tasks.id, taskId)).returning();
        return {message: "Task deleted successfully", deletedTaskId: deleted[0]?.id ?? taskId};
    })
  .get("/tasks/:id/events", async ({ params, user, set }) => {
      const taskId = parseInt(params.id);
      const existing = await db.select({
          task_id: tasks.id,
      })
          .from(tasks)
          .innerJoin(rooms, eq(tasks.room_id, rooms.id))
          .innerJoin(objects, eq(rooms.object_id, objects.id))
          .where(and(eq(tasks.id, taskId), eq(objects.company_id, user.company_id)));
      if (!existing.length) {
          set.status = 404;
          return { message: "Task not found" };
      }

      const rows = await db.select().from(taskEvents)
          .where(eq(taskEvents.task_id, taskId))
          .orderBy(taskEvents.event_time, taskEvents.id);

      return rows.map((row) => ({
          ...row,
          is_predefined: isPredefinedTaskEventType(row.event_type),
      }));
  })
  .post("/tasks/:id/events", async ({ params, body, user, set }) => {
      const taskId = parseInt(params.id);
      const existing = await db.select({
          task_id: tasks.id,
      })
          .from(tasks)
          .innerJoin(rooms, eq(tasks.room_id, rooms.id))
          .innerJoin(objects, eq(rooms.object_id, objects.id))
          .where(and(eq(tasks.id, taskId), eq(objects.company_id, user.company_id)));
      if (!existing.length) {
          set.status = 404;
          return { message: "Task not found" };
      }

      const eventType = body.event_type.trim();
      if (!eventType) {
          set.status = 400;
          return { message: "event_type is required" };
      }

      const metadata: Record<string, unknown> = { ...(body.metadata || {}) };
      if (body.note !== undefined && body.note.trim()) {
          metadata.note = body.note.trim();
      }

      const inserted = await db.insert(taskEvents).values({
          task_id: taskId,
          actor_id: user.id,
          event_type: eventType,
          metadata: Object.keys(metadata).length ? metadata : null,
      }).returning();

      return {
          ...inserted[0],
          is_predefined: isPredefinedTaskEventType(inserted[0].event_type),
      };
  }, {
      body: t.Object({
          event_type: t.String(),
          note: t.Optional(t.String()),
          metadata: t.Optional(t.Record(t.String(), t.Unknown())),
      }),
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
  })
  // object location: set gps + geofence
  .patch("/objects/:id/location", async ({ params, body, user, set }) => {
    const objectId = parseInt(params.id);
    const obj = await db.select().from(objects).where(
        and(eq(objects.id, objectId), eq(objects.company_id, user.company_id))
    );
    if (!obj.length) {
        set.status = 404;
        return { message: "Object not found" };
    }

    const updateData: Record<string, unknown> = {
        latitude: String(body.latitude),
        longitude: String(body.longitude),
    };
    if (body.geofence_radius_meters !== undefined) {
        updateData.geofence_radius_meters = body.geofence_radius_meters;
    }

    const updated = await db.update(objects)
        .set(updateData)
        .where(eq(objects.id, objectId))
        .returning();

    return {
        id: updated[0].id,
        latitude: Number(updated[0].latitude),
        longitude: Number(updated[0].longitude),
        geofence_radius_meters: updated[0].geofence_radius_meters,
    };
  }, {
    body: t.Object({
        latitude: t.Number(),
        longitude: t.Number(),
        geofence_radius_meters: t.Optional(t.Integer()),
    })
  })
  // object cleaning standard
  .patch("/objects/:id/cleaning-standard", async ({ params, body, user, set }) => {
    const objectId = parseInt(params.id);
    const obj = await db.select().from(objects).where(
        and(eq(objects.id, objectId), eq(objects.company_id, user.company_id))
    );
    if (!obj.length) {
        set.status = 404;
        return { message: "Object not found" };
    }

    const updated = await db.update(objects)
        .set({ cleaning_standard: body.cleaning_standard })
        .where(eq(objects.id, objectId))
        .returning();

    return {
        id: updated[0].id,
        cleaning_standard: updated[0].cleaning_standard,
    };
  }, {
    body: t.Object({
        cleaning_standard: t.String(),
    })
  })
  // checklist templates: list
  .get("/checklist-templates", async ({ user }) => {
    const result = await db.select().from(checklistTemplates)
        .where(eq(checklistTemplates.company_id, user.company_id))
        .orderBy(checklistTemplates.room_type, checklistTemplates.cleaning_standard, checklistTemplates.version);
    return result;
  })
  // checklist templates: create
  .post("/checklist-templates", async ({ body, user }) => {
    const inserted = await db.insert(checklistTemplates).values({
        company_id: user.company_id,
        room_type: body.room_type,
        cleaning_standard: body.cleaning_standard,
        version: body.version || 1,
        items: body.items,
    }).returning();
    return inserted[0];
  }, {
    body: t.Object({
        room_type: t.String(),
        cleaning_standard: t.String(),
        version: t.Optional(t.Integer()),
        items: t.Array(t.Object({
            id: t.String(),
            title: t.String(),
            done: t.Boolean(),
            note: t.Optional(t.String()),
        })),
    })
  })
  // checklist templates: update
  .patch("/checklist-templates/:id", async ({ params, body, user, set }) => {
    const templateId = parseInt(params.id);
    const existing = await db.select().from(checklistTemplates).where(
        and(eq(checklistTemplates.id, templateId), eq(checklistTemplates.company_id, user.company_id))
    );
    if (!existing.length) {
        set.status = 404;
        return { message: "Template not found" };
    }

    const updateData: Record<string, unknown> = { updated_at: new Date() };
    if (body.items) updateData.items = body.items;
    if (body.version !== undefined) updateData.version = body.version;

    const updated = await db.update(checklistTemplates)
        .set(updateData)
        .where(eq(checklistTemplates.id, templateId))
        .returning();
    return updated[0];
  }, {
    body: t.Object({
        items: t.Optional(t.Array(t.Object({
            id: t.String(),
            title: t.String(),
            done: t.Boolean(),
            note: t.Optional(t.String()),
        }))),
        version: t.Optional(t.Integer()),
    })
  })
  // analytics: quality (same as supervisor, for admin scope)
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
  })
  // analytics: ai cost estimation
  .get("/analytics/ai-cost", async ({ user }) => {
    const result = await db.select({
        model: sql<string>`coalesce(${tasks.ai_model}, 'unknown')`,
        request_count: sql<number>`count(*)`.mapWith(Number),
        estimated_input_tokens: sql<number>`count(*) * 200`.mapWith(Number),
        estimated_output_tokens: sql<number>`count(*) * 100`.mapWith(Number),
        estimated_cost_usd: sql<number>`count(*) * 0.0003`.mapWith(Number),
    })
    .from(tasks)
    .innerJoin(rooms, eq(tasks.room_id, rooms.id))
    .innerJoin(objects, eq(rooms.object_id, objects.id))
    .where(and(
        eq(objects.company_id, user.company_id),
        sql`${tasks.ai_status} in ('succeeded', 'failed')`,
    ))
    .groupBy(tasks.ai_model);

    return result;
  });
