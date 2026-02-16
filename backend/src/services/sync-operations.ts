import {createHash} from "node:crypto";
import {db} from "../database";
import {syncOperations} from "../database/schema";
import {eq} from "drizzle-orm";

export type SyncOperationStatus = "applied" | "duplicate" | "rejected" | "retryable_error";

export interface SyncOperationInsert {
  clientOperationId: string;
  cleanerId: number;
  taskId: number;
  operationType: string;
  payload: unknown;
  status: SyncOperationStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export function buildPayloadHash(payload: unknown): string {
  const serialized = JSON.stringify(payload ?? {});
  return createHash("sha256").update(serialized).digest("hex");
}

export async function findSyncOperation(clientOperationId: string) {
  const existing = await db.query.syncOperations.findFirst({
    where: eq(syncOperations.client_operation_id, clientOperationId),
  });
  return existing ?? null;
}

export async function storeSyncOperation(record: SyncOperationInsert) {
  const inserted = await db.insert(syncOperations).values({
    client_operation_id: record.clientOperationId,
    cleaner_id: record.cleanerId,
    task_id: record.taskId,
    operation_type: record.operationType,
    payload_hash: buildPayloadHash(record.payload),
    status: record.status,
    error_code: record.errorCode ?? null,
    error_message: record.errorMessage ?? null,
    processed_at: new Date(),
  }).returning();

  return inserted[0];
}

export async function storeSyncOperationSafe(record: SyncOperationInsert) {
  try {
    return await storeSyncOperation(record);
  } catch (error: any) {
    // unique violation means another request already recorded this operation id.
    if (error?.code === "23505") {
      return await findSyncOperation(record.clientOperationId);
    }
    // FK violation (e.g. invalid task_id) — swallow silently in safe mode
    if (error?.code === "23503") {
      return null;
    }
    throw error;
  }
}
