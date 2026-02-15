export type UserRole = 'admin' | 'supervisor' | 'cleaner' | 'client';

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

export type CleanerTaskRow = {
	task: {
		id: number;
		room_id: number;
		cleaner_id: number;
		status: 'pending' | 'in_progress' | 'completed';
		photo_before: string | null;
		photo_after: string | null;
		timestamp_start: string | null;
		timestamp_end: string | null;
	};
	room: {
		id: number;
		object_id: number;
		type: 'office' | 'bathroom' | 'corridor';
		area_sqm: number;
	};
	object: {
		id: number;
		company_id: number;
		address: string;
		description: string | null;
	};
};

export type PendingInspectionRow = {
	task: {
		id: number;
		room_id: number;
		cleaner_id: number;
		status: 'pending' | 'in_progress' | 'completed';
	};
	room: {
		id: number;
		object_id: number;
		type: 'office' | 'bathroom' | 'corridor';
		area_sqm: number;
	};
	object: {
		id: number;
		company_id: number;
		address: string;
		description: string | null;
	};
};

export type CleanerTaskFilters = {
	status?: 'pending' | 'in_progress' | 'completed';
	date_from?: string;
	date_to?: string;
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
	return request<{ message: string }>('/admin/company', { method: 'DELETE', token });
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
	return request<{ id: number }>('/admin/rooms', { method: 'POST', token, body: input });
}

export function adminCreateTask(token: string, input: { room_id: number; cleaner_id: number }) {
	return request<{ id: number }>('/admin/tasks', { method: 'POST', token, body: input });
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

export function cleanerStartTask(token: string, taskId: number, photoBefore?: File | null) {
	const formData = new FormData();
	if (photoBefore) {
		formData.append('photo_before', photoBefore);
	}
	return request<{ id: number; status: string }>(`/tasks/${taskId}/start`, {
		method: 'PATCH',
		token,
		formData
	});
}

export function cleanerCompleteTask(token: string, taskId: number, photoAfter?: File | null) {
	const formData = new FormData();
	if (photoAfter) {
		formData.append('photo_after', photoAfter);
	}
	return request<{ id: number; status: string }>(`/tasks/${taskId}/complete`, {
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
	return request<{ id: number }>('/inspections/' + input.taskId, {
		method: 'POST',
		token,
		body: {
			score: input.score,
			comment: input.comment || undefined
		}
	});
}

export function feedbackGetMy(token: string) {
	return request<ClientFeedbackRow[]>('/feedback/my', { token });
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
