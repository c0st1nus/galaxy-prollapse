import {Elysia, t} from "elysia";
import {db} from "../database";
import {objectSessions, rooms, syncOperations, tasks, taskChecklists} from "../database/schema";
import {and, eq, sql} from "drizzle-orm";
import {jwt} from "@elysiajs/jwt";
import {config} from "../utils/config";
import {uploadFile} from "../services/storage";
import {imageDataUrlToFile} from "../services/photo";
import type {JwtPayload} from "../utils/types";
import {normalizeUserRole} from "../utils/roles";

function parseOptionalNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
}

function parseRequiredItems(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
        throw new Error("Checklist payload items must be an array");
    }
    return value.map((item) => (item && typeof item === "object" ? item as Record<string, unknown> : {}));
}

function getDoneCount(items: Array<Record<string, unknown>>): number {
    return items.reduce((acc, item) => (item.done ? acc + 1 : acc), 0);
}

function parsePhotoDataUrl(payload: Record<string, unknown>): string | null {
    const value = payload.photo_data_url;
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

export const syncRoutes = new Elysia({ prefix: "/sync" })
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
          throw new Error("Forbidden: only cleaners can use sync");
      }
      const user: JwtPayload = {
          id: Number(profile.id),
          role,
          company_id: Number(profile.company_id),
      };
      if (user.role !== "cleaner") {
          set.status = 403;
          throw new Error("Forbidden: only cleaners can use sync");
      }
      return {user};
  })
  // batch operations: replay offline queue
  .post("/operations/batch", async ({ body, user }) => {
    const results = [];

    for (const op of body.operations) {
        const payload = op.payload as Record<string, unknown>;

        // check for duplicate
        const existing = await db.select().from(syncOperations)
            .where(eq(syncOperations.client_operation_id, op.client_operation_id));

        if (existing.length) {
            results.push({
                client_operation_id: op.client_operation_id,
                status: "duplicate" as const,
                applied: false,
            });
            continue;
        }

        try {
            // apply operation based on type
            switch (op.operation_type) {
                case "start_task": {
                    const taskContext = await db.select({
                        task_id: tasks.id,
                        object_id: rooms.object_id,
                    })
                        .from(tasks)
                        .innerJoin(rooms, eq(tasks.room_id, rooms.id))
                        .where(and(eq(tasks.id, op.task_id), eq(tasks.cleaner_id, user.id)))
                        .limit(1);
                    if (!taskContext.length) {
                        throw new Error("Task not found or not assigned to cleaner");
                    }

                    const activeSession = await db.select({id: objectSessions.id})
                        .from(objectSessions)
                        .where(and(
                            eq(objectSessions.object_id, taskContext[0].object_id),
                            eq(objectSessions.cleaner_id, user.id),
                            eq(objectSessions.status, "active"),
                            eq(objectSessions.current_inside_geofence, true),
                        ))
                        .limit(1);
                    if (!activeSession.length) {
                        throw new Error("Active object check-in inside geofence is required before start_task");
                    }

                    const updateData: Record<string, unknown> = {
                        status: "in_progress",
                        timestamp_start: new Date(),
                    };

                    const latitude = parseOptionalNumber(payload.latitude);
                    const longitude = parseOptionalNumber(payload.longitude);
                    if (latitude !== undefined) updateData.checkin_latitude = String(latitude);
                    if (longitude !== undefined) updateData.checkin_longitude = String(longitude);

                    const photoDataUrl = parsePhotoDataUrl(payload);
                    if (photoDataUrl) {
                        const photoFile = imageDataUrlToFile(photoDataUrl, "photo_before");
                        updateData.photo_before = await uploadFile(photoFile);
                    }

                    const updated = await db.update(tasks).set(updateData)
                        .where(and(eq(tasks.id, op.task_id), eq(tasks.cleaner_id, user.id)))
                        .returning({id: tasks.id});
                    if (!updated.length) {
                        throw new Error("Task not found or not assigned to cleaner");
                    }
                    break;
                }
                case "update_checklist": {
                    const owner = await db.select({id: tasks.id}).from(tasks)
                        .where(and(eq(tasks.id, op.task_id), eq(tasks.cleaner_id, user.id)))
                        .limit(1);
                    if (!owner.length) {
                        throw new Error("Task not found or not assigned to cleaner");
                    }

                    const items = parseRequiredItems(payload.items);
                    const total = items.length;
                    const done = getDoneCount(items);
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

                    const existingCl = await db.select().from(taskChecklists).where(eq(taskChecklists.task_id, op.task_id));
                    if (existingCl.length) {
                        await db.update(taskChecklists).set({
                            items, completion_percent: pct, updated_at: new Date(),
                        }).where(eq(taskChecklists.task_id, op.task_id));
                    } else {
                        await db.insert(taskChecklists).values({
                            task_id: op.task_id, items, completion_percent: pct,
                        });
                    }
                    break;
                }
                case "complete_task": {
                    const taskContext = await db.select({
                        task_id: tasks.id,
                        object_id: rooms.object_id,
                        photo_before: tasks.photo_before,
                        photo_after: tasks.photo_after,
                    })
                        .from(tasks)
                        .innerJoin(rooms, eq(tasks.room_id, rooms.id))
                        .where(and(eq(tasks.id, op.task_id), eq(tasks.cleaner_id, user.id)))
                        .limit(1);
                    if (!taskContext.length) {
                        throw new Error("Task not found or not assigned to cleaner");
                    }

                    const activeSession = await db.select({id: objectSessions.id})
                        .from(objectSessions)
                        .where(and(
                            eq(objectSessions.object_id, taskContext[0].object_id),
                            eq(objectSessions.cleaner_id, user.id),
                            eq(objectSessions.status, "active"),
                            eq(objectSessions.current_inside_geofence, true),
                        ))
                        .limit(1);
                    if (!activeSession.length) {
                        throw new Error("Active object check-in inside geofence is required before complete_task");
                    }

                    const updateData: Record<string, unknown> = {
                        status: "completed",
                        timestamp_end: new Date(),
                    };

                    const latitude = parseOptionalNumber(payload.latitude);
                    const longitude = parseOptionalNumber(payload.longitude);
                    if (latitude !== undefined) updateData.checkout_latitude = String(latitude);
                    if (longitude !== undefined) updateData.checkout_longitude = String(longitude);

                    const photoDataUrl = parsePhotoDataUrl(payload);
                    if (photoDataUrl) {
                        const photoFile = imageDataUrlToFile(photoDataUrl, "photo_after");
                        updateData.photo_after = await uploadFile(photoFile);
                    }
                    const hasAnyTaskPhoto = Boolean(
                        taskContext[0].photo_before ||
                        taskContext[0].photo_after ||
                        updateData.photo_after
                    );
                    if (!hasAnyTaskPhoto) {
                        throw new Error("At least one task photo is required before completion");
                    }

                    const updated = await db.update(tasks).set(updateData)
                        .where(and(eq(tasks.id, op.task_id), eq(tasks.cleaner_id, user.id)))
                        .returning({id: tasks.id});
                    if (!updated.length) {
                        throw new Error("Task not found or not assigned to cleaner");
                    }
                    break;
                }
                default: {
                    const message = `Unknown operation type: ${op.operation_type}`;
                    await db.insert(syncOperations).values({
                        client_operation_id: op.client_operation_id,
                        cleaner_id: user.id,
                        task_id: op.task_id,
                        operation_type: op.operation_type,
                        status: "rejected",
                        error_code: "unknown_operation",
                        error_message: message,
                        processed_at: new Date(),
                    });
                    results.push({
                        client_operation_id: op.client_operation_id,
                        status: "rejected" as const,
                        error_code: "unknown_operation",
                        error_message: message,
                    });
                    continue;
                }
            }

            // record sync operation
            await db.insert(syncOperations).values({
                client_operation_id: op.client_operation_id,
                cleaner_id: user.id,
                task_id: op.task_id,
                operation_type: op.operation_type,
                status: "applied",
                processed_at: new Date(),
            });

            results.push({
                client_operation_id: op.client_operation_id,
                status: "applied" as const,
                applied: true,
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Unknown error";
            // record failure
            await db.insert(syncOperations).values({
                client_operation_id: op.client_operation_id,
                cleaner_id: user.id,
                task_id: op.task_id,
                operation_type: op.operation_type,
                status: "retryable_error",
                error_message: message,
                processed_at: new Date(),
            }).onConflictDoNothing();

            results.push({
                client_operation_id: op.client_operation_id,
                status: "retryable_error" as const,
                error_code: "server_error",
                error_message: message,
            });
        }
    }

    return { results };
  }, {
    body: t.Object({
        operations: t.Array(t.Object({
            client_operation_id: t.String(),
            task_id: t.Integer(),
            operation_type: t.String(),
            payload: t.Record(t.String(), t.Unknown()),
        })),
    })
  })
  // sync status: overview of pending/failed operations
  .get("/status", async ({ user }) => {
    const stats = await db.select({
        pending_count: sql<number>`count(case when ${syncOperations.status} = 'retryable_error' then 1 end)`.mapWith(Number),
        failed_count: sql<number>`count(case when ${syncOperations.status} = 'rejected' then 1 end)`.mapWith(Number),
    })
    .from(syncOperations)
    .where(eq(syncOperations.cleaner_id, user.id));

    const lastOp = await db.select({
        last_processed_operation_id: syncOperations.client_operation_id,
    })
    .from(syncOperations)
    .where(eq(syncOperations.cleaner_id, user.id))
    .orderBy(sql`${syncOperations.processed_at} desc nulls last`)
    .limit(1);

    return {
        last_processed_operation_id: lastOp.length ? lastOp[0].last_processed_operation_id : null,
        pending_count: stats[0]?.pending_count || 0,
        failed_count: stats[0]?.failed_count || 0,
    };
  });
