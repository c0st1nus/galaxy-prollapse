import {Elysia, t} from "elysia";
import {db} from "../database";
import {syncOperations, tasks, taskChecklists} from "../database/schema";
import {and, eq, sql} from "drizzle-orm";
import {jwt} from "@elysiajs/jwt";
import {config} from "../utils/config";
import {uploadFile} from "../services/storage";
import type {JwtPayload} from "../utils/types";
import {normalizeUserRole} from "../utils/roles";

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
                    await db.update(tasks).set({
                        status: "in_progress",
                        timestamp_start: new Date(),
                    }).where(and(eq(tasks.id, op.task_id), eq(tasks.cleaner_id, user.id)));
                    break;
                }
                case "update_checklist": {
                    const items = (op.payload as any).items || [];
                    const total = items.length;
                    const done = items.filter((i: any) => i.done).length;
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
                    await db.update(tasks).set({
                        status: "completed",
                        timestamp_end: new Date(),
                    }).where(and(eq(tasks.id, op.task_id), eq(tasks.cleaner_id, user.id)));
                    break;
                }
                default: {
                    results.push({
                        client_operation_id: op.client_operation_id,
                        status: "rejected" as const,
                        error_code: "unknown_operation",
                        error_message: `Unknown operation type: ${op.operation_type}`,
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
        } catch (err: any) {
            // record failure
            await db.insert(syncOperations).values({
                client_operation_id: op.client_operation_id,
                cleaner_id: user.id,
                task_id: op.task_id,
                operation_type: op.operation_type,
                status: "retryable_error",
                error_message: err?.message || "Unknown error",
                processed_at: new Date(),
            }).onConflictDoNothing();

            results.push({
                client_operation_id: op.client_operation_id,
                status: "retryable_error" as const,
                error_code: "server_error",
                error_message: err?.message || "Unknown error",
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
