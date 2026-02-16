import {Elysia, t} from "elysia";
import {jwt} from "@elysiajs/jwt";
import {and, eq, sql} from "drizzle-orm";
import {config} from "../utils/config";
import type {JwtPayload} from "../utils/types";
import {
  completeTaskAction,
  startTaskAction,
  TaskActionError,
  toCleanerIdentity,
  updateTaskChecklistAction,
} from "../services/task-actions";
import {parseCoordinate} from "../services/geofencing";
import {db} from "../database";
import {syncOperations, taskEvents} from "../database/schema";

type BatchOperationType = "task_start" | "task_complete" | "checklist_update";

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  return value as Record<string, unknown>;
}

function operationTypeFromValue(value: unknown): BatchOperationType | null {
  if (value === "task_start" || value === "task_complete" || value === "checklist_update") {
    return value;
  }
  return null;
}

export const syncRoutes = new Elysia({prefix: "/sync"})
  .use(
    jwt({
      name: "jwt",
      secret: config.JWT_SECRET,
    }),
  )
  .derive(async ({headers, jwt, set}) => {
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
    if (user.role !== "cleaner") {
      set.status = 403;
      throw new Error("Forbidden: only cleaners can access sync routes");
    }

    return {user};
  })
  .post("/operations/batch", async ({user, body}) => {
    const cleaner = toCleanerIdentity(user.id, user.company_id);
    const results: Array<Record<string, unknown>> = [];

    for (const operation of body.operations) {
      const operationType = operationTypeFromValue(operation.operation_type);
      if (!operationType) {
        results.push({
          client_operation_id: operation.client_operation_id,
          task_id: operation.task_id,
          operation_type: operation.operation_type,
          status: "rejected",
          applied: false,
          error_code: "unsupported_operation",
          error_message: "Unsupported operation type",
        });
        continue;
      }

      const payload = asRecord(operation.payload);

      try {
        if (operationType === "task_start") {
          const startResult = await startTaskAction({
            cleaner,
            taskId: operation.task_id,
            latitude: parseCoordinate(payload.latitude),
            longitude: parseCoordinate(payload.longitude),
            photoBeforeUrl: typeof payload.photo_before_url === "string" ? payload.photo_before_url : null,
            clientOperationId: operation.client_operation_id,
          });
          results.push({
            client_operation_id: operation.client_operation_id,
            task_id: operation.task_id,
            operation_type: operationType,
            status: startResult.status,
            applied: startResult.applied,
          });
          continue;
        }

        if (operationType === "task_complete") {
          const completeResult = await completeTaskAction({
            cleaner,
            taskId: operation.task_id,
            latitude: parseCoordinate(payload.latitude),
            longitude: parseCoordinate(payload.longitude),
            photoAfterUrl: typeof payload.photo_after_url === "string" ? payload.photo_after_url : null,
            clientOperationId: operation.client_operation_id,
          });
          results.push({
            client_operation_id: operation.client_operation_id,
            task_id: operation.task_id,
            operation_type: operationType,
            status: completeResult.status,
            applied: completeResult.applied,
          });
          continue;
        }

        const checklistResult = await updateTaskChecklistAction({
          cleaner,
          taskId: operation.task_id,
          items: payload.items ?? [],
          clientOperationId: operation.client_operation_id,
        });
        results.push({
          client_operation_id: operation.client_operation_id,
          task_id: operation.task_id,
          operation_type: operationType,
          status: checklistResult.status,
          applied: checklistResult.applied,
          completion_percent: checklistResult.checklist?.completion_percent ?? null,
        });
      } catch (error: unknown) {
        if (error instanceof TaskActionError) {
          results.push({
            client_operation_id: operation.client_operation_id,
            task_id: operation.task_id,
            operation_type: operationType,
            status: error.retryable ? "retryable_error" : "rejected",
            applied: false,
            error_code: error.code,
            error_message: error.message,
          });
          continue;
        }

        results.push({
          client_operation_id: operation.client_operation_id,
          task_id: operation.task_id,
          operation_type: operationType,
          status: "retryable_error",
          applied: false,
          error_code: "internal_error",
          error_message: error instanceof Error ? error.message : "Unexpected error",
        });
      }
    }

    return {
      operations: results,
    };
  }, {
    body: t.Object({
      operations: t.Array(
        t.Object({
          client_operation_id: t.String(),
          task_id: t.Integer(),
          operation_type: t.String(),
          payload: t.Optional(t.Object({}, {additionalProperties: true})),
        }),
      ),
    }),
  })
  .get("/status", async ({user}) => {
    const latest = await db.select()
      .from(syncOperations)
      .where(eq(syncOperations.cleaner_id, user.id))
      .orderBy(sql`${syncOperations.processed_at} DESC NULLS LAST`)
      .limit(1);

    const aggregates = await db.select({
      applied: sql<number>`count(case when ${syncOperations.status} = 'applied' then 1 end)`.mapWith(Number),
      rejected: sql<number>`count(case when ${syncOperations.status} = 'rejected' then 1 end)`.mapWith(Number),
      retryable: sql<number>`count(case when ${syncOperations.status} = 'retryable_error' then 1 end)`.mapWith(Number),
      oldestRetryableAt: sql<Date | null>`min(case when ${syncOperations.status} = 'retryable_error' then ${syncOperations.created_at} else null end)`,
    })
      .from(syncOperations)
      .where(eq(syncOperations.cleaner_id, user.id))
      .limit(1);

    const duplicateAgg = await db.select({
      duplicate: sql<number>`count(${taskEvents.id})`.mapWith(Number),
    })
      .from(taskEvents)
      .where(and(
        eq(taskEvents.actor_id, user.id),
        eq(taskEvents.event_type, "sync_operation_duplicate"),
      ))
      .limit(1);

    const baseMetrics = aggregates[0] ?? {
      applied: 0,
      rejected: 0,
      retryable: 0,
      oldestRetryableAt: null,
    };

    return {
      latest_operation: latest[0] ?? null,
      metrics: {
        ...baseMetrics,
        duplicate: duplicateAgg[0]?.duplicate ?? 0,
      },
    };
  });
