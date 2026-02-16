export type UserRole = 'admin' | 'supervisor' | 'cleaner' | 'client';
export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export type AuthUser = {
	id: number;
	name: string;
	role: UserRole;
	company_id: number;
};

export type Company = {
	id: number;
	name: string;
	created_at?: string;
};

export type AuthResult = {
	token: string;
	user: AuthUser;
	company: Company;
};

export type AdminEfficiencyRow = {
	cleanerName: string;
	totalArea: number;
};

export type ObjectStatusRow = {
	objectId: number;
	address: string;
	description: string | null;
	totalTasks: number;
	pendingTasks: number;
	inProgressTasks: number;
	completedTasks: number;
};

export type AdminObjectRow = {
	id: number;
	company_id: number;
	address: string;
	description: string | null;
};

export type AdminRoomRow = {
	id: number;
	object_id: number;
	type: 'office' | 'bathroom' | 'corridor';
	area_sqm: number;
};

export type TaskRow = {
	id: number;
	room_id: number;
	cleaner_id: number;
	status: TaskStatus;
	photo_before: string | null;
	photo_after: string | null;
	timestamp_start: string | null;
	timestamp_end: string | null;
};

export type TaskAiStatus = 'not_requested' | 'pending' | 'succeeded' | 'failed';

export type TaskAiRating = {
	task_id: number;
	ai_status: TaskAiStatus;
	ai_model?: string | null;
	ai_score?: number | null;
	ai_feedback?: string | null;
	ai_raw?: Record<string, unknown> | null;
	ai_rated_at?: string | null;
};

export type TaskChecklistItem = {
	id: string;
	title: string;
	done: boolean;
	note?: string;
};

export type TaskChecklist = {
	task_id: number;
	template_id?: number | null;
	room_type?: 'office' | 'bathroom' | 'corridor' | null;
	cleaning_standard?: string | null;
	items: TaskChecklistItem[];
	completion_percent: number;
	updated_at?: string | null;
};

export type SyncOperationStatus = 'applied' | 'duplicate' | 'rejected' | 'retryable_error';

export type SyncOperationType = 'start_task' | 'update_checklist' | 'complete_task';

export type SyncBatchOperation = {
	client_operation_id: string;
	task_id: number;
	operation_type: SyncOperationType;
	payload: Record<string, unknown>;
};

export type SyncBatchOperationResult = {
	client_operation_id: string;
	status: SyncOperationStatus;
	applied?: boolean;
	error_code?: string | null;
	error_message?: string | null;
};

export type SyncBatchResult = {
	results: SyncBatchOperationResult[];
};

export type SyncStatus = {
	last_processed_operation_id?: string | null;
	pending_count?: number;
	failed_count?: number;
	oldest_pending_age_seconds?: number;
};

export type QualityAnalyticsRow = {
	label: string;
	value: number;
	aux?: number;
};

export type GeofenceAnalyticsRow = {
	label: string;
	violations: number;
	rate: number;
	median_distance_meters?: number;
};

export type SyncAnalyticsRow = {
	label: string;
	success_rate: number;
	retry_rate: number;
	duplicate_rate: number;
	failed_backlog?: number;
};

export type AICostAnalyticsRow = {
	model: string;
	request_count: number;
	estimated_input_tokens: number;
	estimated_output_tokens: number;
	estimated_cost_usd: number;
};

export type ChecklistTemplateRow = {
	id: number;
	room_type: 'office' | 'bathroom' | 'corridor';
	cleaning_standard: string;
	version: number;
	items: TaskChecklistItem[];
	created_at?: string;
	updated_at?: string;
};

export type CleanerTaskRow = {
	task: TaskRow;
	room: AdminRoomRow;
	object: {
		id: number;
		company_id: number;
		address: string;
		description: string | null;
	};
};

export type PendingInspectionRow = {
	task: TaskRow;
	room: AdminRoomRow;
	object: {
		id: number;
		company_id: number;
		address: string;
		description: string | null;
	};
};

export type CleanerTaskFilters = {
	status?: TaskStatus;
	date_from?: string;
	date_to?: string;
};

export type ChecklistRow = {
	id: number;
	task_id: number;
	inspector_id: number;
	score: number;
	comment: string | null;
};

export type ClientFeedbackObject = {
	id: number;
	address: string;
	description: string | null;
};

export type AdminDeleteCompanyResult = {
	message: string;
	deletedCompany?: Company;
};

export type ClientFeedback = {
	id: number;
	object_id: number;
	client_id: number;
	rating: number;
	text: string | null;
};

export type ClientFeedbackRow = {
	feedback: ClientFeedback;
	object: {
		id: number;
		company_id: number;
		address: string;
		description: string | null;
	};
};

const API_BASE = (
	import.meta.env.PUBLIC_API_BASE_URL ||
	import.meta.env.VITE_API_BASE_URL ||
	'http://localhost:3000'
).replace(/\/$/, '');

type RequestOptions = {
	method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
	token?: string;
	body?: unknown;
	formData?: FormData;
};

function normalizeError(payload: unknown, fallback: string) {
	if (typeof payload === 'string' && payload.trim()) return payload;
	if (payload && typeof payload === 'object' && 'message' in payload) {
		const message = (payload as { message?: unknown }).message;
		if (typeof message === 'string' && message.trim()) return message;
	}
	return fallback;
}

async function request<T>(path: string, options: RequestOptions = {}) {
	const headers: Record<string, string> = {};
	if (options.token) headers.Authorization = `Bearer ${options.token}`;

	let payloadBody: BodyInit | undefined;
	if (options.formData) {
		payloadBody = options.formData;
	} else if (options.body !== undefined) {
		headers['Content-Type'] = 'application/json';
		payloadBody = JSON.stringify(options.body);
	}

	const response = await fetch(`${API_BASE}${path}`, {
		method: options.method || 'GET',
		headers,
		body: payloadBody
	});

	const contentType = response.headers.get('content-type') || '';
	const isJson = contentType.includes('application/json');
	const payload = isJson ? await response.json() : await response.text();

	if (!response.ok) {
		throw new Error(normalizeError(payload, `request failed (${response.status})`));
	}

	return payload as T;
}

export function registerCompany(input: {
	companyName: string;
	adminName: string;
	email: string;
	password: string;
}) {
	return request<AuthResult>('/auth/register-company', { method: 'POST', body: input });
}

export function registerClient(input: {
	companyName: string;
	firstName: string;
	lastName: string;
	phone?: string;
	email: string;
	password: string;
}) {
	return request<AuthResult>('/auth/register-client', { method: 'POST', body: input });
}

export function login(input: { email: string; password: string }) {
	return request<AuthResult>('/auth/login', { method: 'POST', body: input });
}

export function adminGetCompany(token: string) {
	return request<Company>('/admin/company', { token });
}

export function adminPatchCompany(token: string, name: string) {
	return request<Company>('/admin/company', { method: 'PATCH', token, body: { name } });
}

export function adminDeleteCompany(token: string) {
	return request<AdminDeleteCompanyResult>('/admin/company', { method: 'DELETE', token });
}

export function adminCreateUser(
	token: string,
	input: { name: string; email: string; role: UserRole; password: string }
) {
	return request<AuthUser>('/admin/users', { method: 'POST', token, body: input });
}

export function adminCreateObject(token: string, input: { address: string; description?: string }) {
	return request<AdminObjectRow>('/admin/objects', { method: 'POST', token, body: input });
}

export function adminCreateRoom(
	token: string,
	input: { object_id: number; type: 'office' | 'bathroom' | 'corridor'; area_sqm: number }
) {
	return request<AdminRoomRow>('/admin/rooms', { method: 'POST', token, body: input });
}

export function adminCreateTask(token: string, input: { room_id: number; cleaner_id: number }) {
	return request<TaskRow>('/admin/tasks', { method: 'POST', token, body: input });
}

export function adminGetObjectsStatus(token: string) {
	return request<ObjectStatusRow[]>('/admin/objects/status', { token });
}

export function adminGetEfficiency(token: string) {
	return request<AdminEfficiencyRow[]>('/admin/analytics/efficiency', { token });
}

export function cleanerGetTasks(token: string, filters: CleanerTaskFilters = {}) {
	const params = new URLSearchParams();
	if (filters.status) params.set('status', filters.status);
	if (filters.date_from) params.set('date_from', filters.date_from);
	if (filters.date_to) params.set('date_to', filters.date_to);
	const query = params.toString();
	return request<CleanerTaskRow[]>(`/tasks/my${query ? `?${query}` : ''}`, { token });
}

export function cleanerStartTask(
	token: string,
	taskId: number,
	input?:
		| File
		| null
		| {
				photoBefore?: File | null;
				latitude?: number;
				longitude?: number;
				client_operation_id?: string;
		  }
) {
	const payload =
		input instanceof File || input === null || input === undefined ? { photoBefore: input } : input;
	const formData = new FormData();
	if (payload.photoBefore) {
		formData.append('photo_before', payload.photoBefore);
	}
	if (typeof payload.latitude === 'number') {
		formData.append('latitude', String(payload.latitude));
	}
	if (typeof payload.longitude === 'number') {
		formData.append('longitude', String(payload.longitude));
	}
	if (payload.client_operation_id) {
		formData.append('client_operation_id', payload.client_operation_id);
	}
	return request<TaskRow>(`/tasks/${taskId}/start`, {
		method: 'PATCH',
		token,
		formData
	});
}

export function cleanerCompleteTask(
	token: string,
	taskId: number,
	input?:
		| File
		| null
		| {
				photoAfter?: File | null;
				latitude?: number;
				longitude?: number;
				client_operation_id?: string;
		  }
) {
	const payload =
		input instanceof File || input === null || input === undefined ? { photoAfter: input } : input;
	const formData = new FormData();
	if (payload.photoAfter) {
		formData.append('photo_after', payload.photoAfter);
	}
	if (typeof payload.latitude === 'number') {
		formData.append('latitude', String(payload.latitude));
	}
	if (typeof payload.longitude === 'number') {
		formData.append('longitude', String(payload.longitude));
	}
	if (payload.client_operation_id) {
		formData.append('client_operation_id', payload.client_operation_id);
	}
	return request<TaskRow>(`/tasks/${taskId}/complete`, {
		method: 'PATCH',
		token,
		formData
	});
}

export function inspectionsGetPending(token: string) {
	return request<PendingInspectionRow[]>('/inspections/pending', { token });
}

export function inspectionsCreate(
	token: string,
	input: { taskId: number; score: number; comment?: string }
) {
	return request<ChecklistRow>('/inspections/' + input.taskId, {
		method: 'POST',
		token,
		body: {
			score: input.score,
			comment: input.comment || undefined
		}
	});
}

export function cleanerGetTaskChecklist(token: string, taskId: number) {
	return request<TaskChecklist>(`/tasks/${taskId}/checklist`, { token });
}

export function cleanerPatchTaskChecklist(
	token: string,
	taskId: number,
	input: {
		items: TaskChecklistItem[];
		client_operation_id?: string;
	}
) {
	return request<TaskChecklist>(`/tasks/${taskId}/checklist`, {
		method: 'PATCH',
		token,
		body: input
	});
}

export function cleanerGetTaskAiRating(token: string, taskId: number) {
	return request<TaskAiRating>(`/tasks/${taskId}/ai-rating`, { token });
}

export function syncBatchOperations(token: string, operations: SyncBatchOperation[]) {
	return request<SyncBatchResult>('/sync/operations/batch', {
		method: 'POST',
		token,
		body: { operations }
	});
}

export function syncGetStatus(token: string) {
	return request<SyncStatus>('/sync/status', { token });
}

export function inspectionsGetTaskAiRating(token: string, taskId: number) {
	return request<TaskAiRating>(`/inspections/${taskId}/ai-rating`, { token });
}

export function inspectionsRunTaskAiRating(token: string, taskId: number) {
	return request<TaskAiRating>(`/inspections/${taskId}/ai-rate`, {
		method: 'POST',
		token
	});
}

export function inspectionsGetAnalyticsQuality(token: string) {
	return request<QualityAnalyticsRow[]>('/inspections/analytics/quality', { token });
}

export function inspectionsGetAnalyticsGeofence(token: string) {
	return request<GeofenceAnalyticsRow[]>('/inspections/analytics/geofence', { token });
}

export function inspectionsGetAnalyticsSync(token: string) {
	return request<SyncAnalyticsRow[]>('/inspections/analytics/sync', { token });
}

export function adminPatchObjectLocation(
	token: string,
	objectId: number,
	input: { latitude: number; longitude: number; geofence_radius_meters?: number }
) {
	return request<{
		id: number;
		latitude: number;
		longitude: number;
		geofence_radius_meters: number;
	}>(`/admin/objects/${objectId}/location`, {
		method: 'PATCH',
		token,
		body: input
	});
}

export function adminPatchObjectCleaningStandard(
	token: string,
	objectId: number,
	cleaning_standard: string
) {
	return request<{ id: number; cleaning_standard: string }>(
		`/admin/objects/${objectId}/cleaning-standard`,
		{
			method: 'PATCH',
			token,
			body: { cleaning_standard }
		}
	);
}

export function adminGetChecklistTemplates(token: string) {
	return request<ChecklistTemplateRow[]>('/admin/checklist-templates', { token });
}

export function adminCreateChecklistTemplate(
	token: string,
	input: {
		room_type: 'office' | 'bathroom' | 'corridor';
		cleaning_standard: string;
		version?: number;
		items: TaskChecklistItem[];
	}
) {
	return request<ChecklistTemplateRow>('/admin/checklist-templates', {
		method: 'POST',
		token,
		body: input
	});
}

export function adminPatchChecklistTemplate(
	token: string,
	templateId: number,
	input: {
		items?: TaskChecklistItem[];
		version?: number;
	}
) {
	return request<ChecklistTemplateRow>(`/admin/checklist-templates/${templateId}`, {
		method: 'PATCH',
		token,
		body: input
	});
}

export function adminGetAnalyticsQuality(token: string) {
	return request<QualityAnalyticsRow[]>('/admin/analytics/quality', { token });
}

export function adminGetAnalyticsSync(token: string) {
	return request<SyncAnalyticsRow[]>('/admin/analytics/sync', { token });
}

export function adminGetAnalyticsAICost(token: string) {
	return request<AICostAnalyticsRow[]>('/admin/analytics/ai-cost', { token });
}

export function feedbackGetMy(token: string) {
	return request<ClientFeedbackRow[]>('/feedback/my', { token });
}

export function feedbackGetObjects(token: string) {
	return request<ClientFeedbackObject[]>('/feedback/objects', { token });
}

export function feedbackCreate(
	token: string,
	input: { object_id: number; rating: number; text?: string }
) {
	return request<ClientFeedback>('/feedback', {
		method: 'POST',
		token,
		body: {
			object_id: input.object_id,
			rating: input.rating,
			text: input.text || undefined
		}
	});
}

export function feedbackUpdate(
	token: string,
	feedbackId: number,
	input: { rating?: number; text?: string }
) {
	return request<ClientFeedback>(`/feedback/${feedbackId}`, {
		method: 'PATCH',
		token,
		body: {
			rating: input.rating,
			text: input.text
		}
	});
}

export function feedbackDelete(token: string, feedbackId: number) {
	return request<{ message: string }>(`/feedback/${feedbackId}`, { method: 'DELETE', token });
}

export function getApiBaseUrl() {
	return API_BASE;
}
