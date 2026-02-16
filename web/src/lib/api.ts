export type UserRole = 'admin' | 'supervisor' | 'cleaner' | 'client';
export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type RoomType = string;

export type AuthUser = {
	id: number;
	name: string;
	role: UserRole;
	company_id: number | null;
};

export type Company = {
	id: number;
	name: string;
	created_at?: string;
};

export type AuthResult = {
	token: string;
	user: AuthUser;
	company: Company | null;
};

export type AdminEfficiencyRow = {
	cleanerName: string;
	totalArea: number;
};

export type ObjectStatusRow = {
	objectId: number;
	address: string;
	description: string | null;
	latitude: number | null;
	longitude: number | null;
	geofence_radius_meters: number;
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
	type: RoomType;
	area_sqm: number;
	objectAddress?: string;
};

export type AdminUserRow = {
	id: number;
	name: string;
	email: string;
	role: UserRole;
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

export type AdminTaskRow = {
	id: number;
	room_id: number;
	cleaner_id: number;
	status: TaskStatus;
	timestamp_start: string | null;
	timestamp_end: string | null;
	room_type: RoomType;
	room_area_sqm: number;
	object_id: number;
	object_address: string;
	cleaner_name: string;
	cleaner_email: string;
};

export type TaskAiStatus = 'not_requested' | 'pending' | 'succeeded' | 'failed';

export type TaskAiRating = {
	task_id: number;
	ai_status: TaskAiStatus;
	ai_model?: string | null;
	ai_score?: number | null;
	ai_feedback?: string | null;
	ai_feedback_cleaner?: string | null;
	ai_feedback_supervisor?: string | null;
	ai_review?: {
		score: number;
		summary: string;
		feedback_cleaner: string;
		feedback_supervisor: string;
		strengths: string[];
		improvements: string[];
		supervisor_actions: string[];
		issues: Array<{
			area: string;
			problem: string;
			severity: 'low' | 'medium' | 'high';
			evidence: string;
			recommendation: string;
		}>;
		photo_quality: {
			before: string[];
			after: string[];
			retake_required: boolean;
		};
		confidence: number;
	} | null;
	ai_raw?: Record<string, unknown> | null;
	ai_rated_at?: string | null;
};

export type TaskChecklistItem = {
	id: string;
	title: string;
	done: boolean;
	note?: string;
	photo_required?: boolean;
	photo_url?: string;
};

export type TaskChecklist = {
	task_id: number;
	template_id?: number | null;
	room_type?: RoomType | null;
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

export type CleanerFlowTiming = {
	elapsed_seconds: number;
	on_site_seconds: number;
	off_site_seconds: number;
};

export type CleanerFlowTask = {
	task: TaskRow;
	timing: CleanerFlowTiming;
	instructions: string[];
	checklist: {
		items: TaskChecklistItem[];
		completion_percent: number;
	} | null;
};

export type CleanerFlowRoom = {
	room: AdminRoomRow;
	timing: CleanerFlowTiming;
	tasks: CleanerFlowTask[];
};

export type CleanerFlowObject = {
	object: {
		id: number;
		company_id: number;
		address: string;
		description: string | null;
		latitude?: string | null;
		longitude?: string | null;
		geofence_radius_meters?: number;
		cleaning_standard?: string;
	};
	timing: CleanerFlowTiming;
	active_session: {
		id: number;
		status: 'active' | 'closed' | string;
		checkin_at: string;
		checkout_at: string | null;
		current_inside_geofence: boolean;
		last_presence_at: string;
		last_distance_meters: string | null;
		last_latitude: string | null;
		last_longitude: string | null;
		timing: CleanerFlowTiming;
	} | null;
	rooms: CleanerFlowRoom[];
};

export type CleanerFlowTodayResponse = {
	date: string;
	objects: CleanerFlowObject[];
};

export type CleanerFlowSessionResponse = {
	object_id: number;
	session_id: number;
	status: string;
	inside_geofence: boolean;
	distance_meters: number;
	timing: CleanerFlowTiming;
	checkin_at: string;
	checkout_at?: string | null;
};

export type SupervisorTimeAnalytics = {
	window: {
		date_from: string;
		date_to: string;
	};
	summary: {
		on_site_seconds: number;
		off_site_seconds: number;
		total_elapsed_seconds: number;
		on_site_ratio: number;
		task_elapsed_seconds: number;
	};
	cleaners: Array<{
		cleaner_id: number;
		cleaner_name: string;
		on_site_seconds: number;
		off_site_seconds: number;
		total_elapsed_seconds: number;
		on_site_ratio: number;
		object_count: number;
		room_count: number;
		task_count: number;
		task_elapsed_seconds: number;
	}>;
	objects: Array<{
		object_id: number;
		object_address: string;
		on_site_seconds: number;
		off_site_seconds: number;
		total_elapsed_seconds: number;
		on_site_ratio: number;
	}>;
	today_tracking?: {
		date: string;
		summary: {
			object_count: number;
			active_object_count: number;
			active_cleaner_count: number;
		};
		objects: Array<{
			object_id: number;
			object_address: string;
			on_site_seconds: number;
			off_site_seconds: number;
			total_elapsed_seconds: number;
			on_site_ratio: number;
			task_count: number;
			pending_tasks: number;
			in_progress_tasks: number;
			completed_tasks: number;
			active_cleaner_count: number;
			last_presence_at: string | null;
			cleaners: Array<{
				cleaner_id: number;
				cleaner_name: string;
				on_site_seconds: number;
				off_site_seconds: number;
				total_elapsed_seconds: number;
				on_site_ratio: number;
				task_count: number;
				pending_tasks: number;
				in_progress_tasks: number;
				completed_tasks: number;
				has_active_session: boolean;
				last_presence_at: string | null;
			}>;
			tasks: Array<{
				task_id: number;
				status: TaskStatus;
				timestamp_start: string | null;
				timestamp_end: string | null;
				room_id: number;
				room_type: RoomType;
				room_area_sqm: number;
				cleaner_id: number;
				cleaner_name: string;
				cleaner_email: string;
			}>;
		}>;
	};
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
	room_type: RoomType;
	cleaning_standard: string;
	version: number;
	items: TaskChecklistItem[];
	created_at?: string;
	updated_at?: string;
};

export type CatalogOption = {
	value: string;
	label: string;
};

export type RoomTypeCatalog = {
	options: CatalogOption[];
	allow_custom: boolean;
};

export type CleanerTaskRow = {
	task: TaskRow;
	room: AdminRoomRow;
	object: {
		id: number;
		company_id: number;
		address: string;
		description: string | null;
		latitude?: string | null;
		longitude?: string | null;
		geofence_radius_meters?: number;
		cleaning_standard?: string;
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

export type ClientServiceRequestStatus = 'pending' | 'accepted' | 'rejected';
export type ClientEasySetupUsage = 'quiet' | 'normal' | 'busy';

export type ClientServiceRequestTask = {
	room_type: RoomType;
	area_sqm: number;
	note?: string;
};

export type ClientServiceRequestRow = {
	id: number;
	client_id: number;
	company_id: number;
	status: ClientServiceRequestStatus;
	object_address: string;
	object_description: string | null;
	latitude: number | null;
	longitude: number | null;
	location_accuracy_meters: number | null;
	geofence_radius_meters: number;
	easy_setup_usage: ClientEasySetupUsage;
	recommended_cleaning_standard: string;
	requested_tasks: ClientServiceRequestTask[];
	client_note: string | null;
	decision_note: string | null;
	created_object_id: number | null;
	assigned_supervisor_id: number | null;
	assigned_cleaner_id: number | null;
	reviewed_by: number | null;
	created_at: string;
	reviewed_at: string | null;
	company?: {
		id: number;
		name: string;
	};
	created_object?: {
		id: number;
		address: string;
	} | null;
};

export type AdminClientServiceRequestRow = ClientServiceRequestRow & {
	client: {
		id: number;
		name: string;
		email: string;
	};
};

export type AdminAcceptClientServiceRequestResult = {
	request: ClientServiceRequestRow;
	created_object: {
		id: number;
		company_id: number;
		address: string;
		description: string | null;
		latitude: string | null;
		longitude: string | null;
		geofence_radius_meters: number;
		cleaning_standard: string;
	};
	created_rooms: number;
	created_tasks: number;
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

export function authGetCompanies() {
	return request<Company[]>('/auth/companies');
}

export function registerClient(input: {
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

export function adminCreateObject(
	token: string,
	input: {
		address: string;
		description?: string;
		latitude?: number;
		longitude?: number;
		geofence_radius_meters?: number;
		cleaning_standard?: string;
	}
) {
	return request<AdminObjectRow>('/admin/objects', { method: 'POST', token, body: input });
}

export function adminCreateRoom(
	token: string,
	input: { object_id: number; type: string; area_sqm: number }
) {
	return request<AdminRoomRow>('/admin/rooms', { method: 'POST', token, body: input });
}

export function adminCreateTask(token: string, input: { room_id: number; cleaner_id: number }) {
	return request<TaskRow>('/admin/tasks', { method: 'POST', token, body: input });
}

export function adminGetTasks(token: string) {
	return request<AdminTaskRow[]>('/admin/tasks', { token });
}

export function adminGetClientServiceRequests(token: string) {
	return request<AdminClientServiceRequestRow[]>('/admin/client-requests', { token });
}

export function adminAcceptClientServiceRequest(
	token: string,
	requestId: number,
	input: {
		decision_note?: string;
	}
) {
	return request<AdminAcceptClientServiceRequestResult>(
		`/admin/client-requests/${requestId}/accept`,
		{
			method: 'POST',
			token,
			body: input
		}
	);
}

export function adminGetObjectsStatus(token: string) {
	return request<ObjectStatusRow[]>('/admin/objects/status', { token });
}

export function adminGetUsers(token: string) {
	return request<AdminUserRow[]>('/admin/users', { token });
}

export function adminPatchUser(
	token: string,
	userId: number,
	input: {
		name?: string;
		email?: string;
		role?: UserRole;
		password?: string;
	}
) {
	return request<AdminUserRow>(`/admin/users/${userId}`, { method: 'PATCH', token, body: input });
}

export function adminDeleteUser(token: string, userId: number) {
	return request<{ message: string; deletedUserId?: number }>(`/admin/users/${userId}`, {
		method: 'DELETE',
		token
	});
}

export function adminGetRooms(token: string) {
	return request<AdminRoomRow[]>('/admin/rooms', { token });
}

export function adminPatchObject(
	token: string,
	objectId: number,
	input: { address?: string; description?: string }
) {
	return request<AdminObjectRow>(`/admin/objects/${objectId}`, {
		method: 'PATCH',
		token,
		body: input
	});
}

export function adminDeleteObject(token: string, objectId: number) {
	return request<{ message: string; deletedObjectId?: number }>(`/admin/objects/${objectId}`, {
		method: 'DELETE',
		token
	});
}

export function adminPatchRoom(
	token: string,
	roomId: number,
	input: {
		object_id?: number;
		type?: string;
		area_sqm?: number;
	}
) {
	return request<AdminRoomRow>(`/admin/rooms/${roomId}`, {
		method: 'PATCH',
		token,
		body: input
	});
}

export function adminDeleteRoom(token: string, roomId: number) {
	return request<{ message: string; deletedRoomId?: number }>(`/admin/rooms/${roomId}`, {
		method: 'DELETE',
		token
	});
}

export function adminPatchTask(
	token: string,
	taskId: number,
	input: {
		room_id?: number;
		cleaner_id?: number;
		status?: TaskStatus;
	}
) {
	return request<TaskRow>(`/admin/tasks/${taskId}`, {
		method: 'PATCH',
		token,
		body: input
	});
}

export function adminDeleteTask(token: string, taskId: number) {
	return request<{ message: string; deletedTaskId?: number }>(`/admin/tasks/${taskId}`, {
		method: 'DELETE',
		token
	});
}

export function adminGetEfficiency(token: string) {
	return request<AdminEfficiencyRow[]>('/admin/analytics/efficiency', { token });
}

export function adminGetRoomTypeCatalog(token: string) {
	return request<RoomTypeCatalog>('/admin/catalogs/room-types', { token });
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

export function cleanerUploadChecklistPhoto(
	token: string,
	taskId: number,
	itemId: string,
	photo: File
) {
	const formData = new FormData();
	formData.append('photo', photo);
	formData.append('item_id', itemId);
	return request<{ item_id: string; photo_url: string }>(`/tasks/${taskId}/checklist/upload`, {
		method: 'POST',
		token,
		formData
	});
}

export function cleanerGetTaskAiRating(token: string, taskId: number) {
	return request<TaskAiRating>(`/tasks/${taskId}/ai-rating`, { token });
}

export function cleanerRunTaskAiRating(token: string, taskId: number) {
	return request<TaskAiRating>(`/tasks/${taskId}/ai-rate`, {
		method: 'POST',
		token
	});
}

export function cleanerFlowGetToday(token: string, input?: { date?: string }) {
	const params = new URLSearchParams();
	if (input?.date) params.set('date', input.date);
	const query = params.toString();
	return request<CleanerFlowTodayResponse>(`/cleaner-flow/today${query ? `?${query}` : ''}`, {
		token
	});
}

export function cleanerFlowCheckInObject(
	token: string,
	objectId: number,
	input: { latitude: number; longitude: number }
) {
	return request<CleanerFlowSessionResponse>(`/cleaner-flow/objects/${objectId}/check-in`, {
		method: 'POST',
		token,
		body: input
	});
}

export function cleanerFlowUpdateObjectPresence(
	token: string,
	objectId: number,
	input: { latitude: number; longitude: number }
) {
	return request<CleanerFlowSessionResponse>(`/cleaner-flow/objects/${objectId}/presence`, {
		method: 'POST',
		token,
		body: input
	});
}

export function cleanerFlowCheckOutObject(
	token: string,
	objectId: number,
	input?: { latitude?: number; longitude?: number }
) {
	return request<CleanerFlowSessionResponse>(`/cleaner-flow/objects/${objectId}/check-out`, {
		method: 'POST',
		token,
		body: input || {}
	});
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

export function inspectionsGetAnalyticsQuality(
	token: string,
	input: { date_from?: string; date_to?: string } = {}
) {
	const params = new URLSearchParams();
	if (input.date_from) params.set('date_from', input.date_from);
	if (input.date_to) params.set('date_to', input.date_to);
	const query = params.toString();
	return request<QualityAnalyticsRow[]>(
		`/inspections/analytics/quality${query ? `?${query}` : ''}`,
		{
			token
		}
	);
}

export function inspectionsGetAnalyticsGeofence(
	token: string,
	input: { date_from?: string; date_to?: string } = {}
) {
	const params = new URLSearchParams();
	if (input.date_from) params.set('date_from', input.date_from);
	if (input.date_to) params.set('date_to', input.date_to);
	const query = params.toString();
	return request<GeofenceAnalyticsRow[]>(
		`/inspections/analytics/geofence${query ? `?${query}` : ''}`,
		{ token }
	);
}

export function inspectionsGetAnalyticsSync(
	token: string,
	input: { date_from?: string; date_to?: string } = {}
) {
	const params = new URLSearchParams();
	if (input.date_from) params.set('date_from', input.date_from);
	if (input.date_to) params.set('date_to', input.date_to);
	const query = params.toString();
	return request<SyncAnalyticsRow[]>(`/inspections/analytics/sync${query ? `?${query}` : ''}`, {
		token
	});
}

export function inspectionsGetAnalyticsTime(
	token: string,
	input: { date_from?: string; date_to?: string } = {}
) {
	const params = new URLSearchParams();
	if (input.date_from) params.set('date_from', input.date_from);
	if (input.date_to) params.set('date_to', input.date_to);
	const query = params.toString();
	return request<SupervisorTimeAnalytics>(
		`/inspections/analytics/time${query ? `?${query}` : ''}`,
		{ token }
	);
}

export function inspectionsGetManageRooms(token: string) {
	return request<AdminRoomRow[]>('/inspections/manage/rooms', { token });
}

export function inspectionsGetManageCleaners(token: string) {
	return request<AdminUserRow[]>('/inspections/manage/cleaners', { token });
}

export function inspectionsCreateTask(
	token: string,
	input: { room_id: number; cleaner_id: number }
) {
	return request<TaskRow>('/inspections/tasks', { method: 'POST', token, body: input });
}

export function inspectionsPatchTask(
	token: string,
	taskId: number,
	input: {
		room_id?: number;
		cleaner_id?: number;
		status?: TaskStatus;
	}
) {
	return request<TaskRow>(`/inspections/tasks/${taskId}`, {
		method: 'PATCH',
		token,
		body: input
	});
}

export function inspectionsDeleteTask(token: string, taskId: number) {
	return request<{ message: string; deletedTaskId?: number }>(`/inspections/tasks/${taskId}`, {
		method: 'DELETE',
		token
	});
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
		room_type: RoomType;
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

export function clientServiceRequestsGetMy(
	token: string,
	input: {
		company_id?: number;
	} = {}
) {
	const params = new URLSearchParams();
	if (typeof input.company_id === 'number') params.set('company_id', String(input.company_id));
	const query = params.toString();
	return request<ClientServiceRequestRow[]>(`/client-requests/my${query ? `?${query}` : ''}`, {
		token
	});
}

export function clientServiceRequestsCreate(
	token: string,
	input: {
		company_id: number;
		object_address: string;
		object_description?: string;
		latitude?: number;
		longitude?: number;
		location_accuracy_meters?: number;
		easy_setup_usage?: ClientEasySetupUsage;
		tasks: ClientServiceRequestTask[];
		client_note?: string;
	}
) {
	return request<ClientServiceRequestRow>('/client-requests', {
		method: 'POST',
		token,
		body: input
	});
}

export function feedbackGetMy(
	token: string,
	input: {
		company_id?: number;
	} = {}
) {
	const params = new URLSearchParams();
	if (typeof input.company_id === 'number') params.set('company_id', String(input.company_id));
	const query = params.toString();
	return request<ClientFeedbackRow[]>(`/feedback/my${query ? `?${query}` : ''}`, { token });
}

export function feedbackGetObjects(token: string, company_id: number) {
	const query = new URLSearchParams({
		company_id: String(company_id)
	}).toString();
	return request<ClientFeedbackObject[]>(`/feedback/objects?${query}`, { token });
}

export function feedbackCreate(
	token: string,
	input: { company_id: number; object_id: number; rating: number; text?: string }
) {
	return request<ClientFeedback>('/feedback', {
		method: 'POST',
		token,
		body: {
			company_id: input.company_id,
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

export type QuestionOption = {
	value: string;
	label: string;
};

export type Question = {
	id: string;
	text: string;
	type: 'single' | 'multi' | 'boolean';
	options?: QuestionOption[];
	condition?: {
		question_id: string;
		values: string[];
	};
};

export type QuestionnaireAnswer = {
	question_id: string;
	answer: string | string[];
};

export type QuestionnaireChecklistItem = {
	id: string;
	title: string;
	done: boolean;
	photo_required: boolean;
	note?: string;
};

export type QuestionnaireState = {
	task_id: number;
	room_type: string;
	cleaning_standard: string;
	current_answers: QuestionnaireAnswer[];
	next_questions: Question[];
	is_complete: boolean;
	determined_appa_level: number | null;
	appa_label: string | null;
	generated_checklist: QuestionnaireChecklistItem[] | null;
};

export function cleanerGetQuestionnaire(token: string, taskId: number) {
	return request<QuestionnaireState>(`/tasks/${taskId}/questionnaire`, { token });
}

export function cleanerSubmitQuestionnaire(
	token: string,
	taskId: number,
	answers: QuestionnaireAnswer[]
) {
	return request<QuestionnaireState>(`/tasks/${taskId}/questionnaire`, {
		method: 'POST',
		token,
		body: { answers }
	});
}

export function getApiBaseUrl() {
	return API_BASE;
}
