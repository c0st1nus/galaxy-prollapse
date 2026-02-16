export type OfflineOperationType = 'start_task' | 'update_checklist' | 'complete_task';

export type OfflineOperationStatus = 'pending' | 'syncing' | 'failed' | 'done';

export type OfflineOperation = {
	client_operation_id: string;
	task_id: number;
	operation_type: OfflineOperationType;
	payload: Record<string, unknown>;
	status: OfflineOperationStatus;
	attempt_count: number;
	next_retry_at: number;
	last_error?: string;
	created_at: number;
	updated_at: number;
};

const DB_NAME = 'tinytidy-offline';
const DB_VERSION = 1;
const STORE_NAME = 'operations';
const FALLBACK_KEY = 'tt-offline-ops';

let dbPromise: Promise<IDBDatabase> | null = null;

function hasIndexedDb() {
	return typeof window !== 'undefined' && 'indexedDB' in window;
}

function readFallback(): OfflineOperation[] {
	if (typeof window === 'undefined') return [];
	try {
		const raw = window.localStorage.getItem(FALLBACK_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as OfflineOperation[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function writeFallback(items: OfflineOperation[]) {
	if (typeof window === 'undefined') return;
	window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(items));
}

function openDatabase() {
	if (!hasIndexedDb()) {
		return Promise.reject(new Error('indexeddb is not available'));
	}
	if (dbPromise) return dbPromise;
	dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
		const request = window.indexedDB.open(DB_NAME, DB_VERSION);
		request.onerror = () => reject(request.error || new Error('failed to open indexeddb'));
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				const store = db.createObjectStore(STORE_NAME, { keyPath: 'client_operation_id' });
				store.createIndex('status', 'status', { unique: false });
				store.createIndex('task_id', 'task_id', { unique: false });
				store.createIndex('created_at', 'created_at', { unique: false });
			}
		};
		request.onsuccess = () => resolve(request.result);
	});
	return dbPromise;
}

async function withStore<T>(
	mode: IDBTransactionMode,
	runner: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await openDatabase();
	return new Promise<T>((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, mode);
		const store = tx.objectStore(STORE_NAME);
		const request = runner(store);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error || new Error('indexeddb store request failed'));
	});
}

export async function listOfflineOperations() {
	if (!hasIndexedDb()) return readFallback();
	const db = await openDatabase();
	return new Promise<OfflineOperation[]>((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const store = tx.objectStore(STORE_NAME);
		const request = store.getAll();
		request.onsuccess = () => {
			const rows = (request.result as OfflineOperation[]).sort(
				(a, b) => a.created_at - b.created_at
			);
			resolve(rows);
		};
		request.onerror = () => reject(request.error || new Error('failed to list offline operations'));
	});
}

export async function upsertOfflineOperation(operation: OfflineOperation) {
	if (!hasIndexedDb()) {
		const rows = readFallback();
		const idx = rows.findIndex(
			(item) => item.client_operation_id === operation.client_operation_id
		);
		if (idx === -1) rows.push(operation);
		else rows[idx] = operation;
		writeFallback(rows);
		return operation;
	}
	await withStore('readwrite', (store) => store.put(operation));
	return operation;
}

export async function enqueueOfflineOperation(input: {
	task_id: number;
	operation_type: OfflineOperationType;
	payload: Record<string, unknown>;
	client_operation_id?: string;
}) {
	const now = Date.now();
	const operation: OfflineOperation = {
		client_operation_id: input.client_operation_id || crypto.randomUUID(),
		task_id: input.task_id,
		operation_type: input.operation_type,
		payload: input.payload,
		status: 'pending',
		attempt_count: 0,
		next_retry_at: now,
		created_at: now,
		updated_at: now
	};
	await upsertOfflineOperation(operation);
	return operation;
}

export async function updateOfflineOperation(
	client_operation_id: string,
	patch: Partial<OfflineOperation>
) {
	const rows = await listOfflineOperations();
	const current = rows.find((item) => item.client_operation_id === client_operation_id);
	if (!current) return null;
	const next: OfflineOperation = {
		...current,
		...patch,
		updated_at: Date.now()
	};
	await upsertOfflineOperation(next);
	return next;
}

export async function deleteOfflineOperation(client_operation_id: string) {
	if (!hasIndexedDb()) {
		writeFallback(readFallback().filter((row) => row.client_operation_id !== client_operation_id));
		return;
	}
	await withStore('readwrite', (store) => store.delete(client_operation_id));
}

export async function clearDoneOfflineOperations() {
	const rows = await listOfflineOperations();
	const doneIds = rows
		.filter((item) => item.status === 'done')
		.map((item) => item.client_operation_id);
	await Promise.all(doneIds.map((id) => deleteOfflineOperation(id)));
}

export function nextRetryTimestamp(attempt: number) {
	const safeAttempt = Math.max(1, attempt);
	const delayMs = Math.min(60_000, 1_500 * 2 ** (safeAttempt - 1));
	return Date.now() + delayMs;
}

export function shouldRetryOperation(operation: OfflineOperation) {
	if (operation.status === 'done') return false;
	if (operation.status === 'failed' && operation.attempt_count >= 8) return false;
	return operation.next_retry_at <= Date.now();
}

export function offlineQueueStats(rows: OfflineOperation[]) {
	let pending = 0;
	let failed = 0;
	let done = 0;
	for (const row of rows) {
		if (row.status === 'done') done += 1;
		else if (row.status === 'failed') failed += 1;
		else pending += 1;
	}
	return { pending, failed, done, total: rows.length };
}
