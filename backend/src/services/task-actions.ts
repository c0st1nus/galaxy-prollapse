import {and, eq} from "drizzle-orm";
import {db} from "../database";
import {
  geofenceViolations,
  objects,
  rooms,
  taskChecklists,
  taskEvents,
  tasks,
} from "../database/schema";
import {evaluateGeofence} from "./geofencing";
import {uploadFile} from "./storage";
import {findSyncOperation, storeSyncOperationSafe, SyncOperationStatus} from "./sync-operations";
import {
  getOrCreateTaskChecklist,
  updateTaskChecklist,
} from "./task-checklists";
import {isAiRatingEnabled, rateCleaningTask, AiRatingMode} from "./ai-rating";

export class TaskActionError extends Error {
  status: number;
  code: string;
  retryable: boolean;

  constructor(status: number, code: string, message: string, retryable = false) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

interface CleanerIdentity {
  id: number;
  companyId: number;
}

interface StartTaskInput {
  cleaner: CleanerIdentity;
  taskId: number;
  photoBefore?: File | null;
  photoBeforeUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  clientOperationId?: string | null;
}

interface CompleteTaskInput {
  cleaner: CleanerIdentity;
  taskId: number;
  photoAfter?: File | null;
  photoAfterUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  clientOperationId?: string | null;
  aiMode?: AiRatingMode;
}

interface UpdateChecklistInput {
  cleaner: CleanerIdentity;
  taskId: number;
  items: unknown;
  clientOperationId?: string | null;
}

interface TaskActionResult {
  applied: boolean;
  status: SyncOperationStatus;
  task: typeof tasks.$inferSelect | null;
  message?: string;
}

interface TaskContext {
  task: typeof tasks.$inferSelect;
  room: typeof rooms.$inferSelect;
  object: typeof objects.$inferSelect;
}

function normalizeError(error: unknown): TaskActionError {
  if (error instanceof TaskActionError) {
    return error;
  }

  return new TaskActionError(
    500,
    "internal_error",
    error instanceof Error ? error.message : "Unexpected error",
    true,
  );
}

function sanitizeOperationId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function toDbNumeric(value: number | string | null | undefined, fractionDigits?: number): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  if (typeof fractionDigits === "number") {
    return numericValue.toFixed(fractionDigits);
  }
  return String(numericValue);
}

async function getTaskContextForCleaner(taskId: number, cleaner: CleanerIdentity): Promise<TaskContext> {
  const rows = await db.select({
    task: tasks,
    room: rooms,
    object: objects,
  })
    .from(tasks)
    .innerJoin(rooms, eq(tasks.room_id, rooms.id))
    .innerJoin(objects, eq(rooms.object_id, objects.id))
    .where(and(
      eq(tasks.id, taskId),
      eq(tasks.cleaner_id, cleaner.id),
      eq(objects.company_id, cleaner.companyId),
    ))
    .limit(1);

  if (!rows.length) {
    throw new TaskActionError(404, "task_not_found", "Task not found or not assigned to you");
  }

  return rows[0];
}

async function getTaskSnapshot(taskId: number) {
  return await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });
}

async function appendTaskEvent(taskId: number, actorId: number, eventType: string, metadata: unknown) {
  await db.insert(taskEvents).values({
    task_id: taskId,
    actor_id: actorId,
    event_type: eventType,
    metadata: metadata as Record<string, unknown>,
    event_time: new Date(),
  });
}

async function resolveDuplicateOperation(
  clientOperationId: string | null,
  cleaner: CleanerIdentity,
  taskId: number,
): Promise<TaskActionResult | null> {
  if (!clientOperationId) {
    return null;
  }

  const existing = await findSyncOperation(clientOperationId);
  if (!existing) {
    return null;
  }

  if (existing.cleaner_id !== cleaner.id) {
    throw new TaskActionError(409, "operation_id_conflict", "client_operation_id is already used");
  }

  if (existing.task_id !== taskId) {
    throw new TaskActionError(409, "operation_task_conflict", "Operation is linked to a different task");
  }

  if (existing.status === "applied" || existing.status === "duplicate") {
    await appendTaskEvent(taskId, cleaner.id, "sync_operation_duplicate", {
      client_operation_id: clientOperationId,
      existing_status: existing.status,
    });

    const snapshot = await getTaskSnapshot(taskId);
    return {
      applied: false,
      status: "duplicate",
      task: snapshot ?? null,
      message: "Operation already processed",
    };
  }

  if (existing.status === "retryable_error") {
    throw new TaskActionError(
      503,
      existing.error_code ?? "retryable_error",
      existing.error_message ?? "Operation failed with retryable error",
      true,
    );
  }

  throw new TaskActionError(
    409,
    existing.error_code ?? "operation_rejected",
    existing.error_message ?? "Operation was rejected previously",
  );
}

async function recordFailureOperation(
  clientOperationId: string | null,
  cleanerId: number,
  taskId: number,
  operationType: string,
  payload: unknown,
  error: TaskActionError,
) {
  if (!clientOperationId) {
    return;
  }

  await storeSyncOperationSafe({
    clientOperationId,
    cleanerId,
    taskId,
    operationType,
    payload,
    status: error.retryable ? "retryable_error" : "rejected",
    errorCode: error.code,
    errorMessage: error.message,
  });
}

function geofenceBlockMessage(reason?: "missing_coordinates" | "outside_geofence"): string {
  if (reason === "missing_coordinates") {
    return "Coordinates are required because this object enforces geofence";
  }
  return "Action blocked by geofence policy";
}

async function enforceGeofence(
  context: TaskContext,
  cleanerId: number,
  phase: "start" | "complete",
  latitude: number | null | undefined,
  longitude: number | null | undefined,
) {
  const check = evaluateGeofence({
    objectLatitude: context.object.latitude,
    objectLongitude: context.object.longitude,
    allowedRadiusMeters: context.object.geofence_radius_meters,
    latitude,
    longitude,
  });

  if (!check.allowed) {
    await db.insert(geofenceViolations).values({
      task_id: context.task.id,
      cleaner_id: cleanerId,
      phase,
      distance_meters: toDbNumeric(check.distanceMeters ?? 0, 2) ?? "0.00",
      allowed_radius_meters: check.allowedRadiusMeters,
      latitude: toDbNumeric(latitude) ?? null,
      longitude: toDbNumeric(longitude) ?? null,
      created_at: new Date(),
    });

    await appendTaskEvent(context.task.id, cleanerId, "geofence_violation", {
      phase,
      reason: check.reason,
      distance_meters: check.distanceMeters,
      allowed_radius_meters: check.allowedRadiusMeters,
      latitude,
      longitude,
    });

    throw new TaskActionError(403, "geofence_blocked", geofenceBlockMessage(check.reason));
  }

  return check;
}

function roomTypeFromContext(context: TaskContext): "office" | "bathroom" | "corridor" {
  const roomType = context.room.type;
  if (roomType !== "office" && roomType !== "bathroom" && roomType !== "corridor") {
    return "office";
  }
  return roomType;
}

export async function getTaskChecklistForCleaner(cleaner: CleanerIdentity, taskId: number) {
  const context = await getTaskContextForCleaner(taskId, cleaner);
  const checklist = await getOrCreateTaskChecklist({
    taskId: context.task.id,
    companyId: cleaner.companyId,
    roomType: roomTypeFromContext(context),
    cleaningStandard: context.object.cleaning_standard,
  });

  return checklist;
}

export async function getTaskAiRatingForCleaner(cleaner: CleanerIdentity, taskId: number) {
  const context = await getTaskContextForCleaner(taskId, cleaner);
  return {
    task_id: context.task.id,
    ai_status: context.task.ai_status,
    ai_model: context.task.ai_model,
    ai_score: context.task.ai_score,
    ai_feedback: context.task.ai_feedback,
    ai_raw: context.task.ai_raw,
    ai_rated_at: context.task.ai_rated_at,
  };
}

export async function startTaskAction(input: StartTaskInput): Promise<TaskActionResult> {
  const clientOperationId = sanitizeOperationId(input.clientOperationId);
  const payloadForSync = {
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    has_photo_before: Boolean(input.photoBefore || input.photoBeforeUrl),
  };

  const duplicate = await resolveDuplicateOperation(clientOperationId, input.cleaner, input.taskId);
  if (duplicate) {
    return duplicate;
  }

  try {
    const context = await getTaskContextForCleaner(input.taskId, input.cleaner);
    if (context.task.status === "completed") {
      throw new TaskActionError(409, "task_completed", "Task is already completed");
    }

    const geofence = await enforceGeofence(
      context,
      input.cleaner.id,
      "start",
      input.latitude,
      input.longitude,
    );

    let photoBeforePath = context.task.photo_before;
    if (input.photoBefore) {
      photoBeforePath = await uploadFile(input.photoBefore);
    } else if (input.photoBeforeUrl) {
      photoBeforePath = input.photoBeforeUrl;
    }

    const updatedRows = await db.update(tasks)
      .set({
        status: "in_progress",
        timestamp_start: context.task.timestamp_start ?? new Date(),
        photo_before: photoBeforePath ?? null,
        checkin_latitude: toDbNumeric(input.latitude) ?? context.task.checkin_latitude ?? null,
        checkin_longitude: toDbNumeric(input.longitude) ?? context.task.checkin_longitude ?? null,
      })
      .where(eq(tasks.id, context.task.id))
      .returning();

    const updatedTask = updatedRows[0] ?? null;
    if (!updatedTask) {
      throw new TaskActionError(500, "task_update_failed", "Failed to update task");
    }

    await getOrCreateTaskChecklist({
      taskId: context.task.id,
      companyId: input.cleaner.companyId,
      roomType: roomTypeFromContext(context),
      cleaningStandard: context.object.cleaning_standard,
    });

    await appendTaskEvent(context.task.id, input.cleaner.id, "task_started", {
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      geofence_distance_meters: geofence.distanceMeters,
      geofence_enforced: geofence.enforced,
    });

    if (clientOperationId) {
      await storeSyncOperationSafe({
        clientOperationId,
        cleanerId: input.cleaner.id,
        taskId: input.taskId,
        operationType: "task_start",
        payload: payloadForSync,
        status: "applied",
      });
    }

    return {
      applied: true,
      status: "applied",
      task: updatedTask,
    };
  } catch (error: unknown) {
    const normalized = normalizeError(error);
    await recordFailureOperation(
      clientOperationId,
      input.cleaner.id,
      input.taskId,
      "task_start",
      payloadForSync,
      normalized,
    );
    throw normalized;
  }
}

export async function completeTaskAction(input: CompleteTaskInput): Promise<TaskActionResult> {
  const clientOperationId = sanitizeOperationId(input.clientOperationId);
  const payloadForSync = {
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    has_photo_after: Boolean(input.photoAfter || input.photoAfterUrl),
    ai_mode: input.aiMode ?? "auto",
  };

  const duplicate = await resolveDuplicateOperation(clientOperationId, input.cleaner, input.taskId);
  if (duplicate) {
    return duplicate;
  }

  try {
    const context = await getTaskContextForCleaner(input.taskId, input.cleaner);
    if (context.task.status === "pending") {
      throw new TaskActionError(409, "task_not_started", "Task must be started before completion");
    }

    const geofence = await enforceGeofence(
      context,
      input.cleaner.id,
      "complete",
      input.latitude,
      input.longitude,
    );

    let photoAfterPath = context.task.photo_after;
    if (input.photoAfter) {
      photoAfterPath = await uploadFile(input.photoAfter);
    } else if (input.photoAfterUrl) {
      photoAfterPath = input.photoAfterUrl;
    }

    const shouldRunAi = Boolean(context.task.photo_before) && Boolean(photoAfterPath);
    const aiStatus = shouldRunAi ? (isAiRatingEnabled() ? "pending" : "failed") : "not_requested";

    const completedRows = await db.update(tasks)
      .set({
        status: "completed",
        timestamp_end: context.task.timestamp_end ?? new Date(),
        photo_after: photoAfterPath ?? null,
        checkout_latitude: toDbNumeric(input.latitude) ?? context.task.checkout_latitude ?? null,
        checkout_longitude: toDbNumeric(input.longitude) ?? context.task.checkout_longitude ?? null,
        ai_status: aiStatus,
      })
      .where(eq(tasks.id, context.task.id))
      .returning();

    let completedTask = completedRows[0] ?? null;
    if (!completedTask) {
      throw new TaskActionError(500, "task_update_failed", "Failed to complete task");
    }

    await appendTaskEvent(context.task.id, input.cleaner.id, "task_completed", {
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      geofence_distance_meters: geofence.distanceMeters,
      geofence_enforced: geofence.enforced,
    });

    if (shouldRunAi && isAiRatingEnabled()) {
      try {
        const aiResult = await rateCleaningTask({
          photoBefore: completedTask.photo_before,
          photoAfter: completedTask.photo_after,
          roomType: context.room.type,
          cleaningStandard: context.object.cleaning_standard,
          mode: input.aiMode ?? "auto",
        });

        const aiRows = await db.update(tasks)
          .set({
            ai_status: "succeeded",
            ai_model: aiResult.model,
            ai_score: aiResult.score,
            ai_feedback: aiResult.feedback,
            ai_raw: aiResult.raw,
            ai_rated_at: new Date(),
          })
          .where(eq(tasks.id, context.task.id))
          .returning();
        completedTask = aiRows[0] ?? completedTask;

        await appendTaskEvent(context.task.id, input.cleaner.id, "ai_rated", {
          model: aiResult.model,
          confidence: aiResult.confidence,
          escalated: aiResult.escalated,
          usage: aiResult.usage,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI rating failed";
        const aiFailureRows = await db.update(tasks)
          .set({
            ai_status: "failed",
            ai_raw: {
              error: message,
            },
            ai_rated_at: new Date(),
          })
          .where(eq(tasks.id, context.task.id))
          .returning();
        completedTask = aiFailureRows[0] ?? completedTask;

        await appendTaskEvent(context.task.id, input.cleaner.id, "ai_rating_failed", {
          error: message,
        });
      }
    } else if (shouldRunAi && !isAiRatingEnabled()) {
      await appendTaskEvent(context.task.id, input.cleaner.id, "ai_rating_skipped", {
        reason: "OPENAI_API_KEY is not configured",
      });
    }

    if (clientOperationId) {
      await storeSyncOperationSafe({
        clientOperationId,
        cleanerId: input.cleaner.id,
        taskId: input.taskId,
        operationType: "task_complete",
        payload: payloadForSync,
        status: "applied",
      });
    }

    return {
      applied: true,
      status: "applied",
      task: completedTask,
    };
  } catch (error: unknown) {
    const normalized = normalizeError(error);
    await recordFailureOperation(
      clientOperationId,
      input.cleaner.id,
      input.taskId,
      "task_complete",
      payloadForSync,
      normalized,
    );
    throw normalized;
  }
}

export async function updateTaskChecklistAction(input: UpdateChecklistInput) {
  const clientOperationId = sanitizeOperationId(input.clientOperationId);
  const payloadForSync = {
    items: input.items,
  };

  const duplicate = await resolveDuplicateOperation(clientOperationId, input.cleaner, input.taskId);
  if (duplicate) {
    const checklist = await db.query.taskChecklists.findFirst({
      where: eq(taskChecklists.task_id, input.taskId),
    });
    return {
      ...duplicate,
      checklist,
    };
  }

  try {
    const context = await getTaskContextForCleaner(input.taskId, input.cleaner);
    if (context.task.status === "completed") {
      throw new TaskActionError(409, "task_completed", "Cannot update checklist after completion");
    }

    await getOrCreateTaskChecklist({
      taskId: context.task.id,
      companyId: input.cleaner.companyId,
      roomType: roomTypeFromContext(context),
      cleaningStandard: context.object.cleaning_standard,
    });

    const updatedChecklist = await updateTaskChecklist(context.task.id, input.items);
    if (!updatedChecklist) {
      throw new TaskActionError(500, "checklist_update_failed", "Failed to update task checklist");
    }

    await appendTaskEvent(context.task.id, input.cleaner.id, "task_checklist_updated", {
      completion_percent: updatedChecklist.completion_percent,
    });

    if (clientOperationId) {
      await storeSyncOperationSafe({
        clientOperationId,
        cleanerId: input.cleaner.id,
        taskId: input.taskId,
        operationType: "checklist_update",
        payload: payloadForSync,
        status: "applied",
      });
    }

    return {
      applied: true,
      status: "applied" as const,
      task: context.task,
      checklist: updatedChecklist,
    };
  } catch (error) {
    const normalized = normalizeError(error);
    await recordFailureOperation(
      clientOperationId,
      input.cleaner.id,
      input.taskId,
      "checklist_update",
      payloadForSync,
      normalized,
    );
    throw normalized;
  }
}

export function toCleanerIdentity(cleanerId: number, companyId: number): CleanerIdentity {
  return {
    id: cleanerId,
    companyId,
  };
}
