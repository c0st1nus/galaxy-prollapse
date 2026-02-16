<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onDestroy, onMount } from 'svelte';
	import AppIcon from '$lib/components/ui/AppIcon.svelte';
	import FlashMessage from '$lib/components/ui/FlashMessage.svelte';
	import LocationPicker from '$lib/components/ui/LocationPicker.svelte';
	import MetricCard from '$lib/components/ui/MetricCard.svelte';
	import SparklineChart from '$lib/components/ui/SparklineChart.svelte';
	import TaskQuestionnaire from '$lib/components/ui/TaskQuestionnaire.svelte';
	import { ROUTES, routeHref } from '$lib/constants/routes';
	import { ui } from '$lib/constants/ui';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import {
		adminCreateObject,
		adminCreateRoom,
		adminCreateTask,
		adminCreateUser,
		adminDeleteObject,
		adminDeleteRoom,
		adminDeleteTask,
		adminDeleteUser,
		adminGetAnalyticsAICost,
		adminGetAnalyticsQuality,
		adminGetAnalyticsSync,
		adminGetEfficiency,
		adminGetObjectsStatus,
		adminGetRooms,
		adminGetTasks,
		adminGetUsers,
		adminPatchObject,
		adminPatchObjectCleaningStandard,
		adminPatchObjectLocation,
		adminPatchRoom,
		adminPatchTask,
		adminPatchUser,
		cleanerGetTaskAiRating,
		cleanerGetTaskChecklist,
		cleanerCompleteTask,
		cleanerGetTasks,
		cleanerPatchTaskChecklist,
		cleanerStartTask,
		cleanerUploadChecklistPhoto,
		feedbackCreate,
		feedbackDelete,
		feedbackGetObjects,
		feedbackGetMy,
		feedbackUpdate,
		inspectionsGetAnalyticsGeofence,
		inspectionsGetAnalyticsQuality,
		inspectionsGetAnalyticsSync,
		inspectionsGetTaskAiRating,
		inspectionsRunTaskAiRating,
		inspectionsCreate,
		inspectionsGetPending,
		syncBatchOperations,
		syncGetStatus,
		type AICostAnalyticsRow,
		type AdminRoomRow,
		type AdminTaskRow,
		type AdminUserRow,
		type AdminEfficiencyRow,
		type CleanerTaskFilters,
		type CleanerTaskRow,
		type ClientFeedbackObject,
		type ClientFeedbackRow,
		type GeofenceAnalyticsRow,
		type ObjectStatusRow,
		type PendingInspectionRow,
		type QualityAnalyticsRow,
		type SyncAnalyticsRow,
		type SyncBatchOperation,
		type SyncBatchOperationResult,
		type SyncStatus,
		type TaskAiRating,
		type TaskChecklist,
		type TaskChecklistItem,
		type UserRole
	} from '$lib/api';
	import {
		clearDoneOfflineOperations,
		deleteOfflineOperation,
		enqueueOfflineOperation,
		listOfflineOperations,
		nextRetryTimestamp,
		offlineQueueStats,
		shouldRetryOperation,
		updateOfflineOperation,
		type OfflineOperation
	} from '$lib/offline-queue';
	import { dataUrlToFile, fileToDataUrl, readCurrentPosition } from '$lib/native';
	import { clearSession, initSession, session, type SessionState } from '$lib/session';

	let currentSession = $state<SessionState | null>(null);

	let loading = $state(false);
	let error = $state('');
	let success = $state('');

	let objectsStatus = $state<ObjectStatusRow[]>([]);
	let efficiency = $state<AdminEfficiencyRow[]>([]);
	let cleanerTasks = $state<CleanerTaskRow[]>([]);
	let inspectionsPending = $state<PendingInspectionRow[]>([]);
	let checklistsByTask = $state<Record<number, TaskChecklist>>({});
	let aiRatingsByTask = $state<Record<number, TaskAiRating>>({});
	let offlineOps = $state<OfflineOperation[]>([]);
	let syncStatusSnapshot = $state<SyncStatus | null>(null);
	let syncingQueue = $state(false);

	let supervisorQualityAnalytics = $state<QualityAnalyticsRow[]>([]);
	let supervisorGeofenceAnalytics = $state<GeofenceAnalyticsRow[]>([]);
	let supervisorSyncAnalytics = $state<SyncAnalyticsRow[]>([]);

	let adminQualityAnalytics = $state<QualityAnalyticsRow[]>([]);
	let adminSyncAnalytics = $state<SyncAnalyticsRow[]>([]);
	let adminAICostAnalytics = $state<AICostAnalyticsRow[]>([]);


	let companyUsers = $state<AdminUserRow[]>([]);
	let companyRooms = $state<AdminRoomRow[]>([]);
	let adminTasks = $state<AdminTaskRow[]>([]);

	let wizardStep = $state(0);
	let wizardObjectId = $state('');
	let wizardRoomId = $state('');
	let wizardCleanerId = $state('');
	let wizardRoomType = $state<'office' | 'bathroom' | 'corridor'>('office');
	let wizardRoomArea = $state('');
	type WizardUsage = 'quiet' | 'normal' | 'busy';
	type WizardRecommendation = {
		level: number;
		standard: string;
		roomType: 'office' | 'bathroom' | 'corridor';
		reason: string;
	};
	let wizardUsage = $state<WizardUsage>('normal');
	let wizardApplyRecommendedStandard = $state(true);

	let userForm = $state({
		name: '',
		email: '',
		role: 'cleaner' as UserRole,
		password: ''
	});

	let objectForm = $state({
		city: '',
		street: '',
		houseNumber: '',
		apartmentNumber: '',
		floor: '',
		isPrivateHouse: false,
		description: ''
	});

	type ObjectAddressSuggestion = {
		display_name: string;
		lat: string;
		lon: string;
		address?: {
			city?: string;
			town?: string;
			village?: string;
			municipality?: string;
			county?: string;
			road?: string;
			pedestrian?: string;
			footway?: string;
			neighbourhood?: string;
			suburb?: string;
			house_number?: string;
		};
	};

	let objectAddressQuery = $state('');
	let objectAddressSuggestions = $state<ObjectAddressSuggestion[]>([]);
	let objectAddressSearching = $state(false);
	let objectAddressShowSuggestions = $state(false);
	let objectAddressDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let objectAddressSearchController = $state<AbortController | null>(null);
	let objectAddressSearchSequence = $state(0);

	const OBJECT_ADDRESS_LOCAL_LIMIT = 12;
	const OBJECT_ADDRESS_GLOBAL_LIMIT = 24;
	const OBJECT_ADDRESS_MAX_RESULTS = 20;

	let roomForm = $state({
		objectId: '',
		type: 'office' as 'office' | 'bathroom' | 'corridor',
		areaSqm: ''
	});

	let taskForm = $state({
		roomId: '',
		cleanerId: ''
	});

	let editingUserId = $state<number | null>(null);
	let userEditForm = $state({
		name: '',
		email: '',
		role: 'cleaner' as UserRole,
		password: ''
	});

	let editingObjectId = $state<number | null>(null);
	let objectEditForm = $state({
		address: '',
		description: ''
	});

	let editingRoomId = $state<number | null>(null);
	let roomEditForm = $state({
		objectId: '',
		type: 'office' as 'office' | 'bathroom' | 'corridor',
		areaSqm: ''
	});

	let editingTaskId = $state<number | null>(null);
	let taskEditForm = $state({
		roomId: '',
		cleanerId: '',
		status: 'pending' as 'pending' | 'in_progress' | 'completed'
	});

	let inspectionForm = $state({
		taskId: '',
		score: '5',
		comment: ''
	});

	let cleanerFilters = $state({
		status: '',
		date_from: '',
		date_to: ''
	});

	let feedbackForm = $state({
		objectId: '',
		rating: '5',
		text: ''
	});

	let objectSettingsForm = $state({
		objectId: '',
		latitude: '',
		longitude: '',
		geofenceRadiusMeters: '100'
	});

	let clientFeedbackObjects = $state<ClientFeedbackObject[]>([]);
	let clientFeedbackRows = $state<ClientFeedbackRow[]>([]);
	const feedbackDrafts: Record<number, { rating: string; text: string }> = $state({});

	const beforeFiles: Record<number, File | null> = $state({});
	const afterFiles: Record<number, File | null> = $state({});
	const taskCoords: Record<number, { latitude?: number; longitude?: number; accuracy?: number }> =
		$state({});

	let unsubscribe: (() => void) | null = null;
	let syncInterval: ReturnType<typeof setInterval> | null = null;
	let onlineListener: (() => void) | null = null;
	let visibilityListener: (() => void) | null = null;

	function tokenOrThrow() {
		if (!currentSession?.token) throw new Error(m.app_error_not_authenticated());
		return currentSession.token;
	}

	function resetMessages() {
		error = '';
		success = '';
	}

	function setError(err: unknown) {
		error = err instanceof Error ? err.message : m.app_error_generic();
	}

	function roleLabel(role: UserRole) {
		if (role === 'admin') return m.role_admin();
		if (role === 'supervisor') return m.role_supervisor();
		if (role === 'cleaner') return m.role_cleaner();
		return m.role_client();
	}

	function nominatimLang(): string {
		const loc = getLocale();
		if (loc === 'ru') return 'ru,en';
		if (loc === 'kz') return 'kk,ru,en';
		return 'en,ru';
	}

	function parseObjectAddressSuggestions(payload: unknown): ObjectAddressSuggestion[] {
		if (!Array.isArray(payload)) return [];
		const list: ObjectAddressSuggestion[] = [];
		for (const raw of payload) {
			if (!raw || typeof raw !== 'object') continue;
			const row = raw as Record<string, unknown>;
			if (
				typeof row.display_name !== 'string' ||
				typeof row.lat !== 'string' ||
				typeof row.lon !== 'string'
			) {
				continue;
			}
			const next: ObjectAddressSuggestion = {
				display_name: row.display_name,
				lat: row.lat,
				lon: row.lon
			};
			if (row.address && typeof row.address === 'object') {
				const addr = row.address as Record<string, unknown>;
				const picked: NonNullable<ObjectAddressSuggestion['address']> = {};
				const keys: Array<keyof NonNullable<ObjectAddressSuggestion['address']>> = [
					'city',
					'town',
					'village',
					'municipality',
					'county',
					'road',
					'pedestrian',
					'footway',
					'neighbourhood',
					'suburb',
					'house_number'
				];
				for (const key of keys) {
					const value = addr[key];
					if (typeof value === 'string') picked[key] = value;
				}
				if (Object.keys(picked).length > 0) next.address = picked;
			}
			list.push(next);
		}
		return list;
	}

	function objectAddressSuggestionKey(item: ObjectAddressSuggestion): string {
		const lat = Number(item.lat);
		const lon = Number(item.lon);
		const latPart = Number.isFinite(lat) ? lat.toFixed(5) : item.lat;
		const lonPart = Number.isFinite(lon) ? lon.toFixed(5) : item.lon;
		return `${latPart}|${lonPart}|${item.display_name.toLowerCase()}`;
	}

	function mergeObjectAddressSuggestions(
		local: ObjectAddressSuggestion[],
		global: ObjectAddressSuggestion[]
	): ObjectAddressSuggestion[] {
		const merged: ObjectAddressSuggestion[] = [];
		const seen = new Set<string>();
		const append = (rows: ObjectAddressSuggestion[]) => {
			for (const row of rows) {
				const key = objectAddressSuggestionKey(row);
				if (seen.has(key)) continue;
				seen.add(key);
				merged.push(row);
				if (merged.length >= OBJECT_ADDRESS_MAX_RESULTS) return;
			}
		};
		append(local);
		append(global);
		return merged;
	}

	function objectAddressSearchParams(q: string, limit: number, countrycodes?: string): URLSearchParams {
		const params = new URLSearchParams({
			format: 'jsonv2',
			q,
			limit: String(limit),
			addressdetails: '1',
			dedupe: '0'
		});
		if (countrycodes) params.set('countrycodes', countrycodes);
		return params;
	}

	async function fetchObjectAddressSuggestions(
		params: URLSearchParams,
		controller: AbortController
	): Promise<ObjectAddressSuggestion[]> {
		const url = `https://nominatim.openstreetmap.org/search?${params}`;
		const res = await fetch(url, {
			headers: { 'Accept-Language': nominatimLang() },
			signal: controller.signal
		});
		if (!res.ok) return [];
		return parseObjectAddressSuggestions(await res.json());
	}

	function splitStreetAndHouse(raw: string): { street: string; houseNumber: string } {
		const value = raw.trim();
		if (!value) return { street: '', houseNumber: '' };
		const match = value.match(/^(.*?)(?:[\s,]+(\d[\dA-Za-zА-Яа-я/-]*))$/u);
		if (!match) return { street: value, houseNumber: '' };
		return { street: match[1].trim(), houseNumber: match[2].trim() };
	}

	function applyObjectAddressSuggestion(item: ObjectAddressSuggestion) {
		const addr = item.address || {};
		const city =
			addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
		const streetRaw =
			addr.road || addr.pedestrian || addr.footway || addr.neighbourhood || addr.suburb || '';
		const split = splitStreetAndHouse(streetRaw);
		const houseNumber = addr.house_number || split.houseNumber || '';

		if (city.trim()) objectForm.city = city.trim();
		if (split.street.trim()) objectForm.street = split.street.trim();
		else if (streetRaw.trim()) objectForm.street = streetRaw.trim();
		if (houseNumber.trim()) objectForm.houseNumber = houseNumber.trim();

		const parts = item.display_name
			.split(',')
			.map((part) => part.trim())
			.filter(Boolean);
		if (!objectForm.street && parts.length > 0) {
			const fallback = splitStreetAndHouse(parts[0]);
			objectForm.street = fallback.street || parts[0];
			if (!objectForm.houseNumber && fallback.houseNumber) {
				objectForm.houseNumber = fallback.houseNumber;
			}
		}
		if (!objectForm.city && parts.length > 1) objectForm.city = parts[1];
	}

	async function searchObjectAddress(query: string) {
		const trimmed = query.trim();
		if (trimmed.length < 2) {
			objectAddressSuggestions = [];
			objectAddressShowSuggestions = false;
			objectAddressSearching = false;
			objectAddressSearchController?.abort();
			objectAddressSearchController = null;
			return;
		}
		objectAddressSearchController?.abort();
		const controller = new AbortController();
		objectAddressSearchController = controller;
		const currentSearch = ++objectAddressSearchSequence;
		objectAddressSearching = true;
		try {
			const [localResult, globalResult] = await Promise.allSettled([
				fetchObjectAddressSuggestions(
					objectAddressSearchParams(trimmed, OBJECT_ADDRESS_LOCAL_LIMIT, 'kz'),
					controller
				),
				fetchObjectAddressSuggestions(
					objectAddressSearchParams(trimmed, OBJECT_ADDRESS_GLOBAL_LIMIT),
					controller
				)
			]);
			if (currentSearch !== objectAddressSearchSequence) return;
			const local = localResult.status === 'fulfilled' ? localResult.value : [];
			const global = globalResult.status === 'fulfilled' ? globalResult.value : [];
			objectAddressSuggestions = mergeObjectAddressSuggestions(local, global);
			objectAddressShowSuggestions = objectAddressSuggestions.length > 0;
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			if (currentSearch === objectAddressSearchSequence) {
				objectAddressSuggestions = [];
				objectAddressShowSuggestions = false;
			}
		} finally {
			if (currentSearch === objectAddressSearchSequence) objectAddressSearching = false;
			if (objectAddressSearchController === controller) objectAddressSearchController = null;
		}
	}

	function onObjectAddressInput(value: string) {
		objectAddressQuery = value;
		if (objectAddressDebounceTimer) clearTimeout(objectAddressDebounceTimer);
		if (value.trim().length < 2) {
			objectAddressSearchController?.abort();
			objectAddressSearchController = null;
			objectAddressSearching = false;
			objectAddressSuggestions = [];
			objectAddressShowSuggestions = false;
			return;
		}
		objectAddressShowSuggestions = true;
		objectAddressDebounceTimer = setTimeout(() => searchObjectAddress(value), 300);
	}

	function onSelectObjectAddressSuggestion(item: ObjectAddressSuggestion) {
		objectAddressQuery = item.display_name;
		objectAddressShowSuggestions = false;
		objectAddressSuggestions = [];
		applyObjectAddressSuggestion(item);
	}

	function composeObjectAddress() {
		const city = objectForm.city.trim();
		const street = objectForm.street.trim();
		const houseNumber = objectForm.houseNumber.trim();
		const apartmentNumber = objectForm.apartmentNumber.trim();
		const floor = objectForm.floor.trim();

		const parts = [city, [street, houseNumber].filter(Boolean).join(' ')].filter(Boolean);
		if (!objectForm.isPrivateHouse) {
			if (apartmentNumber) parts.push(`${m.app_admin_object_apartment_prefix()} ${apartmentNumber}`);
			if (floor) parts.push(`${m.app_admin_object_floor_prefix()} ${floor}`);
		}
		return parts.join(', ');
	}

	function activeCleanerFilters(): CleanerTaskFilters {
		return {
			status: cleanerFilters.status
				? (cleanerFilters.status as CleanerTaskFilters['status'])
				: undefined,
			date_from: cleanerFilters.date_from || undefined,
			date_to: cleanerFilters.date_to || undefined
		};
	}

	const queueStats = $derived(offlineQueueStats(offlineOps));

	function asPercent(value: number) {
		return `${Math.round(value * 100) / 100}%`;
	}

	function analyticsLabels(rows: Array<{ label: string }>) {
		return rows.map((row) => row.label);
	}

	function analyticsValues(rows: Array<{ value: number }>) {
		return rows.map((row) => Number(row.value || 0));
	}

	function taskStatusLabel(status: string) {
		if (status === 'pending') return m.app_status_pending();
		if (status === 'in_progress') return m.app_status_in_progress();
		if (status === 'completed') return m.app_status_completed();
		return status;
	}

	function aiStatusLabel(status: string | null | undefined) {
		if (!status || status === 'not_requested') return m.app_cleaner_ai_status_not_requested();
		if (status === 'pending') return m.app_cleaner_ai_status_pending();
		if (status === 'succeeded') return m.app_cleaner_ai_status_succeeded();
		if (status === 'failed') return m.app_cleaner_ai_status_failed();
		return status;
	}

	function roomTypeLabel(type: string | null | undefined) {
		if (type === 'office') return m.room_type_office();
		if (type === 'bathroom') return m.room_type_bathroom();
		if (type === 'corridor') return m.room_type_corridor();
		return type || '';
	}

	function ensureAdminSelections() {
		const objectIds = new Set(objectsStatus.map((row) => String(row.objectId)));
		const roomIds = new Set(companyRooms.map((row) => String(row.id)));
		const cleanerIds = new Set(
			companyUsers.filter((row) => row.role === 'cleaner').map((row) => String(row.id))
		);
		const userIds = new Set(companyUsers.map((row) => String(row.id)));
		const taskIds = new Set(adminTasks.map((row) => String(row.id)));

		if (objectSettingsForm.objectId && !objectIds.has(objectSettingsForm.objectId)) {
			objectSettingsForm.objectId = '';
		}
		if (!objectSettingsForm.objectId && objectsStatus.length) {
			objectSettingsForm.objectId = String(objectsStatus[0].objectId);
		}

		if (roomForm.objectId && !objectIds.has(roomForm.objectId)) roomForm.objectId = '';
		if (taskForm.roomId && !roomIds.has(taskForm.roomId)) taskForm.roomId = '';
		if (taskForm.cleanerId && !cleanerIds.has(taskForm.cleanerId)) taskForm.cleanerId = '';

		if (wizardObjectId && !objectIds.has(wizardObjectId)) wizardObjectId = '';
		if (wizardRoomId && !roomIds.has(wizardRoomId)) wizardRoomId = '';
		if (wizardCleanerId && !cleanerIds.has(wizardCleanerId)) wizardCleanerId = '';

		if (editingObjectId !== null && !objectIds.has(String(editingObjectId))) editingObjectId = null;
		if (editingRoomId !== null && !roomIds.has(String(editingRoomId))) editingRoomId = null;
		if (editingUserId !== null && !userIds.has(String(editingUserId))) editingUserId = null;
		if (editingTaskId !== null && !taskIds.has(String(editingTaskId))) editingTaskId = null;
	}

	function parseChecklistItems(raw: string): TaskChecklistItem[] {
		try {
			const parsed = JSON.parse(raw) as Array<Partial<TaskChecklistItem>>;
			if (!Array.isArray(parsed)) throw new Error(m.app_error_invalid_checklist_format());
			return parsed.map((item, index) => ({
				id: item.id || `item-${index + 1}`,
				title: item.title || m.app_checklist_item_default({ index: String(index + 1) }),
				done: Boolean(item.done),
				note: item.note || ''
			}));
		} catch {
			throw new Error(m.app_error_checklist_json_array());
		}
	}

	function syncRowsReadyForReplay(rows: OfflineOperation[]) {
		return rows.filter((row) => shouldRetryOperation(row));
	}

	// keep async actions consistent for loader + status messages.
	async function withAction(action: () => Promise<void>) {
		loading = true;
		resetMessages();
		try {
			await action();
		} catch (err) {
			setError(err);
		} finally {
			loading = false;
		}
	}

	async function loadAdminData() {
		const token = tokenOrThrow();
		const [efficiencyPayload, pendingPayload, objectsPayload, usersPayload, roomsPayload, tasksPayload] =
			await Promise.all([
				adminGetEfficiency(token),
				inspectionsGetPending(token),
				adminGetObjectsStatus(token),
				adminGetUsers(token),
				adminGetRooms(token),
				adminGetTasks(token)
			]);
		efficiency = efficiencyPayload;
		inspectionsPending = pendingPayload;
		objectsStatus = objectsPayload;
		companyUsers = usersPayload;
		companyRooms = roomsPayload;
		adminTasks = tasksPayload;
		if (!inspectionForm.taskId && pendingPayload.length) {
			inspectionForm.taskId = String(pendingPayload[0].task.id);
		}
		ensureAdminSelections();

		const settled = await Promise.allSettled([
			adminGetAnalyticsQuality(token),
			adminGetAnalyticsSync(token),
			adminGetAnalyticsAICost(token),
			inspectionsGetAnalyticsQuality(token),
			inspectionsGetAnalyticsGeofence(token),
			inspectionsGetAnalyticsSync(token)
		]);
		if (settled[0].status === 'fulfilled') adminQualityAnalytics = settled[0].value;
		if (settled[1].status === 'fulfilled') adminSyncAnalytics = settled[1].value;
		if (settled[2].status === 'fulfilled') adminAICostAnalytics = settled[2].value;
		if (settled[3].status === 'fulfilled') supervisorQualityAnalytics = settled[3].value;
		if (settled[4].status === 'fulfilled') supervisorGeofenceAnalytics = settled[4].value;
		if (settled[5].status === 'fulfilled') supervisorSyncAnalytics = settled[5].value;
	}

	async function loadCleanerData() {
		const token = tokenOrThrow();
		cleanerTasks = await cleanerGetTasks(token, activeCleanerFilters());
		await loadCleanerTaskDetails(token);
		await loadSyncStatusSnapshot(token);
	}

	async function loadSupervisorData() {
		const token = tokenOrThrow();
		inspectionsPending = await inspectionsGetPending(token);
		if (!inspectionForm.taskId && inspectionsPending.length) {
			inspectionForm.taskId = String(inspectionsPending[0].task.id);
		}
		const settled = await Promise.allSettled([
			inspectionsGetAnalyticsQuality(token),
			inspectionsGetAnalyticsGeofence(token),
			inspectionsGetAnalyticsSync(token)
		]);
		if (settled[0].status === 'fulfilled') supervisorQualityAnalytics = settled[0].value;
		if (settled[1].status === 'fulfilled') supervisorGeofenceAnalytics = settled[1].value;
		if (settled[2].status === 'fulfilled') supervisorSyncAnalytics = settled[2].value;
		const aiSettled = await Promise.allSettled(
			inspectionsPending.map((row) => inspectionsGetTaskAiRating(token, row.task.id))
		);
		aiRatingsByTask = {};
		aiSettled.forEach((item, index) => {
			if (item.status === 'fulfilled') {
				aiRatingsByTask[inspectionsPending[index].task.id] = item.value;
			}
		});
	}

	async function loadClientData() {
		const token = tokenOrThrow();
		const [feedbackRows, feedbackObjects] = await Promise.all([
			feedbackGetMy(token),
			feedbackGetObjects(token)
		]);
		clientFeedbackRows = feedbackRows;
		clientFeedbackObjects = feedbackObjects;
		if (
			feedbackForm.objectId &&
			!feedbackObjects.some((item) => String(item.id) === feedbackForm.objectId)
		) {
			feedbackForm.objectId = '';
		}
		if (!feedbackForm.objectId && feedbackObjects.length) {
			feedbackForm.objectId = String(feedbackObjects[0].id);
		}
		for (const key in feedbackDrafts) {
			delete feedbackDrafts[Number(key)];
		}
		for (const row of clientFeedbackRows) {
			feedbackDrafts[row.feedback.id] = {
				rating: String(row.feedback.rating),
				text: row.feedback.text || ''
			};
		}
	}

	async function loadCleanerTaskDetails(token: string) {
		const checklistSettled = await Promise.allSettled(
			cleanerTasks.map((row) => cleanerGetTaskChecklist(token, row.task.id))
		);
		const aiSettled = await Promise.allSettled(
			cleanerTasks.map((row) => cleanerGetTaskAiRating(token, row.task.id))
		);

		checklistsByTask = {};
		aiRatingsByTask = {};
		checklistSettled.forEach((item, index) => {
			if (item.status === 'fulfilled') {
				checklistsByTask[cleanerTasks[index].task.id] = item.value;
			}
		});
		aiSettled.forEach((item, index) => {
			if (item.status === 'fulfilled') {
				aiRatingsByTask[cleanerTasks[index].task.id] = item.value;
			}
		});
	}

	async function loadSyncStatusSnapshot(token: string) {
		try {
			syncStatusSnapshot = await syncGetStatus(token);
		} catch {
			syncStatusSnapshot = null;
		}
	}

	async function hydrateOfflineQueue() {
		offlineOps = await listOfflineOperations();
	}

	async function refreshByRole() {
		if (!currentSession) return;
		if (currentSession.user.role === 'admin') {
			await loadAdminData();
			return;
		}
		if (currentSession.user.role === 'cleaner') {
			await loadCleanerData();
			return;
		}
		if (currentSession.user.role === 'supervisor') {
			await loadSupervisorData();
			return;
		}
		if (currentSession.user.role === 'client') {
			await loadClientData();
		}
	}

	async function refreshAll() {
		await withAction(async () => {
			await refreshByRole();
			success = m.app_success_refreshed();
		});
	}

	async function onCreateUser(event: SubmitEvent) {
		event.preventDefault();
		await withAction(async () => {
			const createdUser = await adminCreateUser(tokenOrThrow(), {
				name: userForm.name.trim(),
				email: userForm.email.trim(),
				role: userForm.role,
				password: userForm.password
			});
			await reloadAdminCrudData(tokenOrThrow());
			if (createdUser.role === 'cleaner' && !wizardCleanerId) {
				wizardCleanerId = String(createdUser.id);
			}
			userForm = { name: '', email: '', role: 'cleaner', password: '' };
			success = m.app_success_user_created();
		});
	}

	async function onCreateObject(event: SubmitEvent) {
		event.preventDefault();
		await withAction(async () => {
			const address = composeObjectAddress();
			if (!address) throw new Error(m.app_error_generic());
			await adminCreateObject(tokenOrThrow(), {
				address,
				description: objectForm.description.trim() || undefined
			});
			objectForm = {
				city: '',
				street: '',
				houseNumber: '',
				apartmentNumber: '',
				floor: '',
				isPrivateHouse: false,
				description: ''
			};
			objectAddressQuery = '';
			objectAddressSuggestions = [];
			objectAddressShowSuggestions = false;
			await reloadAdminCrudData(tokenOrThrow());
			success = m.app_success_object_created();
		});
	}

	async function onCreateRoom(event: SubmitEvent) {
		event.preventDefault();
		await withAction(async () => {
			await adminCreateRoom(tokenOrThrow(), {
				object_id: Number(roomForm.objectId),
				type: roomForm.type,
				area_sqm: Number(roomForm.areaSqm)
			});
			roomForm = { objectId: '', type: 'office', areaSqm: '' };
			await reloadAdminCrudData(tokenOrThrow());
			success = m.app_success_room_created();
		});
	}

	async function onCreateTask(event: SubmitEvent) {
		event.preventDefault();
		await withAction(async () => {
			await adminCreateTask(tokenOrThrow(), {
				room_id: Number(taskForm.roomId),
				cleaner_id: Number(taskForm.cleanerId)
			});
			taskForm = { roomId: '', cleanerId: '' };
			await reloadAdminCrudData(tokenOrThrow());
			success = m.app_success_task_created();
		});
	}

	function startUserEdit(user: AdminUserRow) {
		editingUserId = user.id;
		userEditForm = {
			name: user.name,
			email: user.email,
			role: user.role,
			password: ''
		};
	}

	function cancelUserEdit() {
		editingUserId = null;
		userEditForm = { name: '', email: '', role: 'cleaner', password: '' };
	}

	async function onSaveUserEdit(userId: number) {
		await withAction(async () => {
			if (!userEditForm.name.trim() || !userEditForm.email.trim()) {
				throw new Error(m.app_error_generic());
			}
			const payload: { name?: string; email?: string; role?: UserRole; password?: string } = {
				name: userEditForm.name.trim(),
				email: userEditForm.email.trim(),
				role: userEditForm.role
			};
			const password = userEditForm.password.trim();
			if (password) payload.password = password;
			await adminPatchUser(tokenOrThrow(), userId, payload);
			await reloadAdminCrudData(tokenOrThrow());
			cancelUserEdit();
			success = m.app_success_user_updated();
		});
	}

	async function onDeleteUser(userId: number) {
		if (!confirm(m.app_confirm_delete_user())) return;
		await withAction(async () => {
			await adminDeleteUser(tokenOrThrow(), userId);
			await reloadAdminCrudData(tokenOrThrow());
			cancelUserEdit();
			success = m.app_success_user_deleted();
		});
	}

	function startObjectEdit(item: ObjectStatusRow) {
		editingObjectId = item.objectId;
		objectEditForm = {
			address: item.address,
			description: item.description ?? ''
		};
	}

	function cancelObjectEdit() {
		editingObjectId = null;
		objectEditForm = { address: '', description: '' };
	}

	async function onSaveObjectEdit(objectId: number) {
		await withAction(async () => {
			if (!objectEditForm.address.trim()) {
				throw new Error(m.app_error_generic());
			}
			await adminPatchObject(tokenOrThrow(), objectId, {
				address: objectEditForm.address.trim(),
				description: objectEditForm.description.trim() || ''
			});
			await reloadAdminCrudData(tokenOrThrow());
			cancelObjectEdit();
			success = m.app_success_object_updated();
		});
	}

	async function onDeleteObject(objectId: number) {
		if (!confirm(m.app_confirm_delete_object())) return;
		await withAction(async () => {
			await adminDeleteObject(tokenOrThrow(), objectId);
			await reloadAdminCrudData(tokenOrThrow());
			cancelObjectEdit();
			success = m.app_success_object_deleted();
		});
	}

	function startRoomEdit(room: AdminRoomRow) {
		editingRoomId = room.id;
		roomEditForm = {
			objectId: String(room.object_id),
			type: room.type,
			areaSqm: String(room.area_sqm)
		};
	}

	function cancelRoomEdit() {
		editingRoomId = null;
		roomEditForm = { objectId: '', type: 'office', areaSqm: '' };
	}

	async function onSaveRoomEdit(roomId: number) {
		await withAction(async () => {
			if (!roomEditForm.objectId || !roomEditForm.areaSqm) {
				throw new Error(m.app_error_generic());
			}
			await adminPatchRoom(tokenOrThrow(), roomId, {
				object_id: Number(roomEditForm.objectId),
				type: roomEditForm.type,
				area_sqm: Number(roomEditForm.areaSqm)
			});
			await reloadAdminCrudData(tokenOrThrow());
			cancelRoomEdit();
			success = m.app_success_room_updated();
		});
	}

	async function onDeleteRoom(roomId: number) {
		if (!confirm(m.app_confirm_delete_room())) return;
		await withAction(async () => {
			await adminDeleteRoom(tokenOrThrow(), roomId);
			await reloadAdminCrudData(tokenOrThrow());
			cancelRoomEdit();
			success = m.app_success_room_deleted();
		});
	}

	function startTaskEdit(task: AdminTaskRow) {
		editingTaskId = task.id;
		taskEditForm = {
			roomId: String(task.room_id),
			cleanerId: String(task.cleaner_id),
			status: task.status
		};
	}

	function cancelTaskEdit() {
		editingTaskId = null;
		taskEditForm = { roomId: '', cleanerId: '', status: 'pending' };
	}

	async function onSaveTaskEdit(taskId: number) {
		await withAction(async () => {
			if (!taskEditForm.roomId || !taskEditForm.cleanerId) {
				throw new Error(m.app_error_generic());
			}
			await adminPatchTask(tokenOrThrow(), taskId, {
				room_id: Number(taskEditForm.roomId),
				cleaner_id: Number(taskEditForm.cleanerId),
				status: taskEditForm.status
			});
			await reloadAdminCrudData(tokenOrThrow());
			cancelTaskEdit();
			success = m.app_success_task_updated();
		});
	}

	async function onDeleteTask(taskId: number) {
		if (!confirm(m.app_confirm_delete_task())) return;
		await withAction(async () => {
			await adminDeleteTask(tokenOrThrow(), taskId);
			await reloadAdminCrudData(tokenOrThrow());
			cancelTaskEdit();
			success = m.app_success_task_deleted();
		});
	}

	function wizardSelectedRoom(): AdminRoomRow | null {
		if (!wizardRoomId) return null;
		return companyRooms.find((room) => String(room.id) === wizardRoomId) ?? null;
	}

	function wizardEffectiveRoomType(): 'office' | 'bathroom' | 'corridor' {
		return wizardSelectedRoom()?.type ?? wizardRoomType;
	}

	function wizardBaseLevelForRoom(roomType: 'office' | 'bathroom' | 'corridor'): number {
		if (roomType === 'bathroom') return 2;
		if (roomType === 'corridor') return 4;
		return 3;
	}

	function wizardLevelLabel(level: number): string {
		if (level === 1) return m.app_admin_wizard_level_1();
		if (level === 2) return m.app_admin_wizard_level_2();
		if (level === 3) return m.app_admin_wizard_level_3();
		if (level === 4) return m.app_admin_wizard_level_4();
		return m.app_admin_wizard_level_5();
	}

	function standardToLevel(standard: string | null | undefined): number | null {
		if (!standard) return null;
		const match = /^appa_(\d)$/i.exec(standard);
		if (!match) return null;
		const level = Number(match[1]);
		if (!Number.isInteger(level) || level < 1 || level > 5) return null;
		return level;
	}

	function cleaningStandardLabel(standard: string | null | undefined): string {
		const level = standardToLevel(standard);
		if (level) return wizardLevelLabel(level);
		return standard ?? '';
	}

	function wizardRoomReason(roomType: 'office' | 'bathroom' | 'corridor'): string {
		if (roomType === 'bathroom') return m.app_admin_wizard_reason_bathroom();
		if (roomType === 'corridor') return m.app_admin_wizard_reason_corridor();
		return m.app_admin_wizard_reason_office();
	}

	function wizardRecommendation(): WizardRecommendation {
		const roomType = wizardEffectiveRoomType();
		let level = wizardBaseLevelForRoom(roomType);

		if (wizardUsage === 'busy') level = Math.max(1, level - 1);
		if (wizardUsage === 'quiet') level = Math.min(5, level + 1);

		const reasons = [wizardRoomReason(roomType)];
		if (wizardUsage === 'busy') reasons.push(m.app_admin_wizard_reason_high_traffic());
		if (wizardUsage === 'quiet') reasons.push(m.app_admin_wizard_reason_low_traffic());

		return {
			level,
			standard: `appa_${level}`,
			roomType,
			reason: reasons.join(' ')
		};
	}

	function wizardCleaners() {
		return companyUsers.filter((u) => u.role === 'cleaner');
	}

	function wizardRoomsForObject() {
		if (!wizardObjectId) return companyRooms;
		return companyRooms.filter((r) => String(r.object_id) === wizardObjectId);
	}

	function onWizardObjectChange() {
		wizardRoomId = '';
		wizardCleanerId = '';
		wizardUsage = 'normal';
		wizardApplyRecommendedStandard = true;
	}

	function onWizardRoomChange() {
		wizardCleanerId = '';
		wizardUsage = 'normal';
		wizardApplyRecommendedStandard = true;
	}

	async function onWizardCreateRoom(event: SubmitEvent) {
		event.preventDefault();
		if (!wizardObjectId || !wizardRoomArea) return;
		await withAction(async () => {
			const created = await adminCreateRoom(tokenOrThrow(), {
				object_id: Number(wizardObjectId),
				type: wizardRoomType,
				area_sqm: Number(wizardRoomArea)
			});
			await reloadAdminCrudData(tokenOrThrow());
			wizardRoomId = String(created.id);
			wizardRoomArea = '';
			wizardStep = 2;
			success = m.app_success_room_created();
		});
	}

	async function onWizardCreateTask(event: SubmitEvent) {
		event.preventDefault();
		if (!wizardRoomId || !wizardCleanerId) return;
		const recommendation = wizardRecommendation();
		await withAction(async () => {
			const token = tokenOrThrow();
			await adminCreateTask(token, {
				room_id: Number(wizardRoomId),
				cleaner_id: Number(wizardCleanerId)
			});
			let recommendationApplied = false;
			if (wizardApplyRecommendedStandard && wizardObjectId) {
				try {
					await adminPatchObjectCleaningStandard(
						token,
						Number(wizardObjectId),
						recommendation.standard
					);
					recommendationApplied = true;
				} catch {
					recommendationApplied = false;
				}
			}
			await reloadAdminCrudData(tokenOrThrow());
			wizardStep = 3;
			wizardCleanerId = '';
			success = recommendationApplied
				? `${m.app_success_task_created()} ${m.app_admin_wizard_recommendation_applied({
						standard: cleaningStandardLabel(recommendation.standard)
					})}`
				: m.app_success_task_created();
		});
	}

	function resetWizard() {
		wizardStep = 0;
		wizardObjectId = '';
		wizardRoomId = '';
		wizardCleanerId = '';
		wizardRoomType = 'office';
		wizardRoomArea = '';
		wizardUsage = 'normal';
		wizardApplyRecommendedStandard = true;
	}

	async function reloadAdminCrudData(token: string) {
		const [objectsPayload, usersPayload, roomsPayload, tasksPayload] = await Promise.all([
			adminGetObjectsStatus(token),
			adminGetUsers(token),
			adminGetRooms(token),
			adminGetTasks(token)
		]);
		objectsStatus = objectsPayload;
		companyUsers = usersPayload;
		companyRooms = roomsPayload;
		adminTasks = tasksPayload;
		ensureAdminSelections();
	}

	async function onLoadObjects() {
		await withAction(async () => {
			objectsStatus = await adminGetObjectsStatus(tokenOrThrow());
			ensureAdminSelections();
			success = m.app_success_objects_loaded();
		});
	}

	async function onLoadUsers() {
		await withAction(async () => {
			companyUsers = await adminGetUsers(tokenOrThrow());
			ensureAdminSelections();
			success = m.app_success_users_loaded();
		});
	}

	async function onLoadRooms() {
		await withAction(async () => {
			companyRooms = await adminGetRooms(tokenOrThrow());
			ensureAdminSelections();
			success = m.app_success_rooms_loaded();
		});
	}

	async function onLoadAdminTasks() {
		await withAction(async () => {
			adminTasks = await adminGetTasks(tokenOrThrow());
			ensureAdminSelections();
			success = m.app_success_tasks_loaded();
		});
	}

	async function onLoadEfficiency() {
		await withAction(async () => {
			efficiency = await adminGetEfficiency(tokenOrThrow());
			success = m.app_success_efficiency_loaded();
		});
	}

	async function onLoadCleanerTasks() {
		await withAction(async () => {
			cleanerTasks = await cleanerGetTasks(tokenOrThrow(), activeCleanerFilters());
			await loadCleanerTaskDetails(tokenOrThrow());
			await loadSyncStatusSnapshot(tokenOrThrow());
			success = m.app_success_cleaner_tasks_loaded();
		});
	}

	async function captureTaskLocation(taskId: number) {
		await withAction(async () => {
			const coords = await readCurrentPosition();
			taskCoords[taskId] = coords;
			success = m.app_success_gps_updated({
				latitude: coords.latitude.toFixed(6),
				longitude: coords.longitude.toFixed(6)
			});
		});
	}

	async function queueOrRunCleanerOperation(input: {
		taskId: number;
		type: 'start_task' | 'complete_task';
		photo?: File | null;
	}) {
		const client_operation_id = crypto.randomUUID();
		const coords = taskCoords[input.taskId] || {};
		const payload: Record<string, unknown> = {
			latitude: coords.latitude,
			longitude: coords.longitude
		};

		if (input.photo) {
			payload.photo_data_url = await fileToDataUrl(input.photo);
			payload.photo_name = input.photo.name;
		}

		const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
		if (isOffline) {
			await enqueueOfflineOperation({
				task_id: input.taskId,
				operation_type: input.type,
				payload,
				client_operation_id
			});
			offlineOps = await listOfflineOperations();
			success = m.app_success_operation_queued_offline();
			return;
		}

		try {
			if (input.type === 'start_task') {
				await cleanerStartTask(tokenOrThrow(), input.taskId, {
					photoBefore: input.photo || undefined,
					latitude: typeof coords.latitude === 'number' ? coords.latitude : undefined,
					longitude: typeof coords.longitude === 'number' ? coords.longitude : undefined,
					client_operation_id
				});
			} else {
				await cleanerCompleteTask(tokenOrThrow(), input.taskId, {
					photoAfter: input.photo || undefined,
					latitude: typeof coords.latitude === 'number' ? coords.latitude : undefined,
					longitude: typeof coords.longitude === 'number' ? coords.longitude : undefined,
					client_operation_id
				});
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : '';
			const shouldQueue = /network|fetch|timeout|failed/i.test(message);
			if (!shouldQueue) throw err;
			await enqueueOfflineOperation({
				task_id: input.taskId,
				operation_type: input.type,
				payload,
				client_operation_id
			});
			offlineOps = await listOfflineOperations();
			success = m.app_success_operation_queued_connectivity();
		}
	}

	async function onStartCleanerTask(taskId: number) {
		await withAction(async () => {
			await queueOrRunCleanerOperation({
				taskId,
				type: 'start_task',
				photo: beforeFiles[taskId]
			});
			cleanerTasks = await cleanerGetTasks(tokenOrThrow(), activeCleanerFilters());
			await loadCleanerTaskDetails(tokenOrThrow());
			success = m.app_success_task_started();
		});
	}

	async function onCompleteCleanerTask(taskId: number) {
		await withAction(async () => {
			await queueOrRunCleanerOperation({
				taskId,
				type: 'complete_task',
				photo: afterFiles[taskId]
			});
			cleanerTasks = await cleanerGetTasks(tokenOrThrow(), activeCleanerFilters());
			await loadCleanerTaskDetails(tokenOrThrow());
			success = m.app_success_task_completed();
		});
	}

	async function onPatchChecklist(taskId: number) {
		const checklist = checklistsByTask[taskId];
		if (!checklist) return;
		await withAction(async () => {
			const client_operation_id = crypto.randomUUID();
			const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
			if (isOffline) {
				await enqueueOfflineOperation({
					task_id: taskId,
					operation_type: 'update_checklist',
					client_operation_id,
					payload: { items: checklist.items }
				});
				offlineOps = await listOfflineOperations();
				success = m.app_success_checklist_queued_offline();
				return;
			}
			const next = await cleanerPatchTaskChecklist(tokenOrThrow(), taskId, {
				items: checklist.items,
				client_operation_id
			});
			checklistsByTask[taskId] = next;
			success = m.app_success_checklist_saved();
		});
	}

	async function onUploadChecklistPhoto(taskId: number, itemId: string, file: File) {
		await withAction(async () => {
			const token = tokenOrThrow();
			const result = await cleanerUploadChecklistPhoto(token, taskId, itemId, file);
			const checklist = checklistsByTask[taskId];
			if (checklist) {
				const item = checklist.items.find((i) => i.id === result.item_id);
				if (item) item.photo_url = result.photo_url;
			}
			success = m.app_success_checklist_photo_uploaded();
		});
	}

	async function onRunTaskAiRating(taskId: number) {
		await withAction(async () => {
			const token = tokenOrThrow();
			const next = await inspectionsRunTaskAiRating(token, taskId);
			aiRatingsByTask[taskId] = next;
			success = m.app_success_ai_rating_requested();
		});
	}

	async function replayOperationFallback(operation: OfflineOperation) {
		const payload = operation.payload || {};
		if (operation.operation_type === 'update_checklist') {
			await cleanerPatchTaskChecklist(tokenOrThrow(), operation.task_id, {
				items: (payload.items as TaskChecklistItem[]) || [],
				client_operation_id: operation.client_operation_id
			});
			return;
		}
		const dataUrl = typeof payload.photo_data_url === 'string' ? payload.photo_data_url : undefined;
		const file = dataUrl
			? await dataUrlToFile(
					dataUrl,
					operation.operation_type === 'start_task' ? 'photo_before' : 'photo_after'
				)
			: undefined;
		if (operation.operation_type === 'start_task') {
			await cleanerStartTask(tokenOrThrow(), operation.task_id, {
				photoBefore: file,
				latitude: typeof payload.latitude === 'number' ? (payload.latitude as number) : undefined,
				longitude:
					typeof payload.longitude === 'number' ? (payload.longitude as number) : undefined,
				client_operation_id: operation.client_operation_id
			});
			return;
		}
		await cleanerCompleteTask(tokenOrThrow(), operation.task_id, {
			photoAfter: file,
			latitude: typeof payload.latitude === 'number' ? (payload.latitude as number) : undefined,
			longitude: typeof payload.longitude === 'number' ? (payload.longitude as number) : undefined,
			client_operation_id: operation.client_operation_id
		});
	}

	async function onSyncOfflineQueue() {
		await withAction(async () => {
			if (syncingQueue) return;
			syncingQueue = true;
			try {
				const rows = syncRowsReadyForReplay(await listOfflineOperations());
				if (rows.length === 0) {
					success = m.app_success_offline_queue_empty();
					return;
				}

				for (const row of rows) {
					await updateOfflineOperation(row.client_operation_id, { status: 'syncing' });
				}

				const operations: SyncBatchOperation[] = rows.map((row) => ({
					client_operation_id: row.client_operation_id,
					task_id: row.task_id,
					operation_type: row.operation_type,
					payload: row.payload
				}));

				let batchResults: SyncBatchOperationResult[] = [];
				let usedBatchRoute = true;

				try {
					const batch = await syncBatchOperations(tokenOrThrow(), operations);
					batchResults = batch.results || [];
				} catch (err: unknown) {
					const message = err instanceof Error ? err.message : '';
					if (!/404|not found|sync\/operations\/batch/i.test(message)) {
						throw err;
					}
					usedBatchRoute = false;
					for (const row of rows) {
						try {
							await replayOperationFallback(row);
							batchResults.push({
								client_operation_id: row.client_operation_id,
								status: 'applied'
							});
						} catch (fallbackErr: unknown) {
							batchResults.push({
								client_operation_id: row.client_operation_id,
								status: 'retryable_error',
								error_message:
									fallbackErr instanceof Error ? fallbackErr.message : m.app_error_sync_failed()
							});
						}
					}
				}

				for (const row of rows) {
					const result = batchResults.find(
						(item) => item.client_operation_id === row.client_operation_id
					);
					if (!result) continue;
					if (result.status === 'applied' || result.status === 'duplicate') {
						await updateOfflineOperation(row.client_operation_id, {
							status: 'done',
							last_error: undefined
						});
						continue;
					}
					await updateOfflineOperation(row.client_operation_id, {
						status: 'failed',
						attempt_count: row.attempt_count + 1,
						next_retry_at: nextRetryTimestamp(row.attempt_count + 1),
						last_error: result.error_message || m.app_error_sync_failed()
					});
				}

				offlineOps = await listOfflineOperations();
				await clearDoneOfflineOperations();
				offlineOps = await listOfflineOperations();
				await loadSyncStatusSnapshot(tokenOrThrow());
				success = usedBatchRoute
					? m.app_success_offline_queue_synced()
					: m.app_success_offline_queue_synced_fallback();
			} finally {
				syncingQueue = false;
			}
		});
	}

	async function onClearDoneQueueItems() {
		await withAction(async () => {
			await clearDoneOfflineOperations();
			offlineOps = await listOfflineOperations();
			success = m.app_success_offline_queue_cleared_done();
		});
	}

	async function onLoadInspections() {
		await withAction(async () => {
			inspectionsPending = await inspectionsGetPending(tokenOrThrow());
			success = m.app_success_inspections_loaded();
		});
	}

	async function onCreateInspection(event: SubmitEvent) {
		event.preventDefault();
		await withAction(async () => {
			await inspectionsCreate(tokenOrThrow(), {
				taskId: Number(inspectionForm.taskId),
				score: Number(inspectionForm.score),
				comment: inspectionForm.comment.trim() || undefined
			});
			inspectionForm = { taskId: '', score: '5', comment: '' };
			inspectionsPending = await inspectionsGetPending(tokenOrThrow());
			success = m.app_success_inspection_created();
		});
	}

	async function onLoadClientFeedback() {
		await withAction(async () => {
			await loadClientData();
			success = m.app_success_client_feedback_loaded();
		});
	}

	async function onCreateClientFeedback(event: SubmitEvent) {
		event.preventDefault();
		await withAction(async () => {
			await feedbackCreate(tokenOrThrow(), {
				object_id: Number(feedbackForm.objectId),
				rating: Number(feedbackForm.rating),
				text: feedbackForm.text.trim() || undefined
			});
			feedbackForm = { objectId: '', rating: '5', text: '' };
			await loadClientData();
			success = m.app_success_client_feedback_created();
		});
	}

	async function onUpdateClientFeedback(feedbackId: number) {
		await withAction(async () => {
			const draft = feedbackDrafts[feedbackId];
			await feedbackUpdate(tokenOrThrow(), feedbackId, {
				rating: Number(draft.rating),
				text: draft.text.trim() || undefined
			});
			await loadClientData();
			success = m.app_success_client_feedback_updated();
		});
	}

	async function onDeleteClientFeedback(feedbackId: number) {
		await withAction(async () => {
			await feedbackDelete(tokenOrThrow(), feedbackId);
			await loadClientData();
			success = m.app_success_client_feedback_deleted();
		});
	}

	async function onUpdateObjectLocation(event: SubmitEvent) {
		event.preventDefault();
		await withAction(async () => {
			await adminPatchObjectLocation(tokenOrThrow(), Number(objectSettingsForm.objectId), {
				latitude: Number(objectSettingsForm.latitude),
				longitude: Number(objectSettingsForm.longitude),
				geofence_radius_meters: Number(objectSettingsForm.geofenceRadiusMeters)
			});
			success = m.app_success_object_location_updated();
		});
	}


	async function onRefreshAnalytics() {
		await withAction(async () => {
			const token = tokenOrThrow();
			const tasks: Promise<unknown>[] = [];
			if (currentSession?.user.role === 'admin') {
				tasks.push(
					adminGetAnalyticsQuality(token).then((rows) => (adminQualityAnalytics = rows)),
					adminGetAnalyticsSync(token).then((rows) => (adminSyncAnalytics = rows)),
					adminGetAnalyticsAICost(token).then((rows) => (adminAICostAnalytics = rows))
				);
			}
			if (currentSession?.user.role === 'admin' || currentSession?.user.role === 'supervisor') {
				tasks.push(
					inspectionsGetAnalyticsQuality(token).then((rows) => (supervisorQualityAnalytics = rows)),
					inspectionsGetAnalyticsGeofence(token).then(
						(rows) => (supervisorGeofenceAnalytics = rows)
					),
					inspectionsGetAnalyticsSync(token).then((rows) => (supervisorSyncAnalytics = rows))
				);
			}
			await Promise.allSettled(tasks);
			success = m.app_success_analytics_refreshed();
		});
	}

	async function onLogout() {
		clearSession();
		await goto(resolve(ROUTES.auth));
	}

	onMount(() => {
		initSession();
		unsubscribe = session.subscribe((next) => {
			currentSession = next;
		});

		void withAction(async () => {
			await hydrateOfflineQueue();
			if (!currentSession) {
				await goto(resolve(ROUTES.auth));
				return;
			}
			await refreshByRole();
			if (currentSession.user.role === 'cleaner') {
				await loadSyncStatusSnapshot(tokenOrThrow());
			}
		});

		onlineListener = () => {
			if (currentSession?.user.role === 'cleaner') {
				void onSyncOfflineQueue();
			}
		};
		window.addEventListener('online', onlineListener);

		visibilityListener = () => {
			if (document.visibilityState === 'visible' && currentSession?.user.role === 'cleaner') {
				void onSyncOfflineQueue();
			}
		};
		document.addEventListener('visibilitychange', visibilityListener);

		syncInterval = setInterval(() => {
			if (currentSession?.user.role === 'cleaner') {
				void onSyncOfflineQueue();
			}
		}, 25_000);
	});

	onDestroy(() => {
		if (unsubscribe) unsubscribe();
		if (onlineListener) window.removeEventListener('online', onlineListener);
		if (visibilityListener) document.removeEventListener('visibilitychange', visibilityListener);
		if (syncInterval) window.clearInterval(syncInterval);
		if (objectAddressDebounceTimer) clearTimeout(objectAddressDebounceTimer);
		objectAddressSearchController?.abort();
		objectAddressSearchController = null;
	});
</script>

<svelte:head>
	<title>{m.app_title()}</title>
</svelte:head>

<main class={ui.page}>
	{#if !currentSession}
		<section class={ui.panelSm}>
			<h1 class={ui.sectionTitle}>
				<AppIcon name="shield" class="h-5 w-5 text-[var(--brand)]" />
				{m.app_not_authenticated_title()}
			</h1>
			<p class="mt-2 text-[var(--text-soft)]">{m.app_not_authenticated_body()}</p>
			<a class={`mt-5 ${ui.primaryButton}`} href={resolve(routeHref(ROUTES.auth))}>
				<AppIcon name="users" class="h-4 w-4" />
				{m.app_not_authenticated_cta()}
			</a>
		</section>
	{:else}
		<section class={ui.panelSm}>
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 class="flex items-center gap-2 text-2xl font-extrabold sm:text-4xl">
						<AppIcon name="clipboard" class="h-7 w-7 text-[var(--brand)]" />
						{m.app_heading()}
					</h1>
					<p class="mt-2 text-[var(--text-soft)]">
						{m.app_session_user({ name: currentSession.user.name })} · {roleLabel(
							currentSession.user.role
						)}
					</p>
					<p class="text-sm text-[var(--text-soft)]">
						{m.app_session_company({ name: currentSession.company.name })}
					</p>
				</div>
				<div class="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
					<button
						type="button"
						class={`${ui.secondaryButton} w-full sm:w-auto`}
						onclick={refreshAll}
						disabled={loading}
					>
						<AppIcon name="refresh" class="h-4 w-4" />
						{m.app_refresh()}
					</button>
					{#if currentSession.user.role === 'admin' || currentSession.user.role === 'supervisor'}
						<button
							type="button"
							class={`${ui.secondaryButton} w-full sm:w-auto`}
							onclick={onRefreshAnalytics}
							disabled={loading}
						>
							<AppIcon name="star" class="h-4 w-4" />
							{m.app_analytics_refresh()}
						</button>
					{/if}
					<button type="button" class={`${ui.primaryButton} w-full sm:w-auto`} onclick={onLogout}>
						<AppIcon name="log-out" class="h-4 w-4" />
						{m.app_logout()}
					</button>
				</div>
			</div>
		</section>

		{#if error}
			<FlashMessage kind="error" text={error} />
		{/if}

		{#if success}
			<FlashMessage kind="success" text={success} />
		{/if}

		{#if currentSession.user.role === 'admin'}
			<div class="mt-6 grid gap-6">
				<section id="admin-users" class={ui.panel}>
					<h2 class={ui.sectionTitle}>
						<AppIcon name="users" class="h-5 w-5 text-[var(--brand)]" />
						{m.app_admin_users_title()}
					</h2>
					<div class="mt-3">
						<button type="button" disabled={loading} onclick={onLoadUsers} class={ui.secondaryButton}>
							<AppIcon name="refresh" class="h-4 w-4" />
							{m.app_admin_users_fetch()}
						</button>
					</div>
					<form class="mt-4 grid gap-3 md:grid-cols-2" onsubmit={onCreateUser}>
						<label class={ui.label}>
							<span class="label-title">
								<AppIcon name="user" class="h-4 w-4" />
								{m.app_name_label()}
							</span>
							<div class={ui.inputWithIcon}>
								<AppIcon name="user" class={ui.inputIcon} />
								<input required bind:value={userForm.name} type="text" class={ui.inputPadded} />
							</div>
						</label>
						<label class={ui.label}>
							<span class="label-title">
								<AppIcon name="mail" class="h-4 w-4" />
								{m.app_email_label()}
							</span>
							<div class={ui.inputWithIcon}>
								<AppIcon name="mail" class={ui.inputIcon} />
								<input required bind:value={userForm.email} type="email" class={ui.inputPadded} />
							</div>
						</label>
						<label class={ui.label}>
							<span class="label-title">
								<AppIcon name="shield" class="h-4 w-4" />
								{m.app_role_label()}
							</span>
							<select bind:value={userForm.role} class={ui.input}>
								<option value="admin">{m.role_admin()}</option>
								<option value="supervisor">{m.role_supervisor()}</option>
								<option value="cleaner">{m.role_cleaner()}</option>
								<option value="client">{m.role_client()}</option>
							</select>
						</label>
						<label class={ui.label}>
							<span class="label-title">
								<AppIcon name="lock" class="h-4 w-4" />
								{m.auth_password_label()}
							</span>
							<div class={ui.inputWithIcon}>
								<AppIcon name="lock" class={ui.inputIcon} />
								<input
									required
									bind:value={userForm.password}
									type="password"
									class={ui.inputPadded}
								/>
							</div>
						</label>
						<div class="md:col-span-2">
							<button type="submit" disabled={loading} class={ui.primaryButton}>
								<AppIcon name="plus" class="h-4 w-4" />
								{m.app_admin_users_create()}
							</button>
						</div>
					</form>
					{#if companyUsers.length === 0}
						<p class="mt-4 text-[var(--text-soft)]">{m.app_empty_users()}</p>
					{:else}
						<div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
							{#each companyUsers as user (user.id)}
								<article class="surface-soft p-4">
									<div class="flex items-center justify-between">
										<span class="chip">#{user.id}</span>
										<span class="chip">{roleLabel(user.role)}</span>
									</div>
									{#if editingUserId === user.id}
										<div class="mt-3 grid gap-2">
											<label class={ui.label}>
												<span>{m.app_name_label()}</span>
												<input bind:value={userEditForm.name} class={ui.input} type="text" required />
											</label>
											<label class={ui.label}>
												<span>{m.app_email_label()}</span>
												<input bind:value={userEditForm.email} class={ui.input} type="email" required />
											</label>
											<label class={ui.label}>
												<span>{m.app_role_label()}</span>
												<select bind:value={userEditForm.role} class={ui.input}>
													<option value="admin">{m.role_admin()}</option>
													<option value="supervisor">{m.role_supervisor()}</option>
													<option value="cleaner">{m.role_cleaner()}</option>
													<option value="client">{m.role_client()}</option>
												</select>
											</label>
											<label class={ui.label}>
												<span>{m.app_admin_optional_password()}</span>
												<input bind:value={userEditForm.password} class={ui.input} type="password" />
											</label>
										</div>
										<div class="mt-3 flex flex-wrap gap-2">
											<button type="button" class={ui.primaryButton} onclick={() => onSaveUserEdit(user.id)}>
												<AppIcon name="check-circle" class="h-4 w-4" />
												{m.app_save()}
											</button>
											<button type="button" class={ui.secondaryButton} onclick={cancelUserEdit}>
												{m.app_cancel()}
											</button>
										</div>
									{:else}
										<p class="mt-2 font-semibold">{user.name}</p>
										<p class="mt-1 text-sm text-[var(--text-soft)]">{user.email}</p>
										<div class="mt-3 flex flex-wrap gap-2">
											<button type="button" class={ui.secondaryButton} onclick={() => startUserEdit(user)}>
												<AppIcon name="checklist" class="h-4 w-4" />
												{m.app_edit()}
											</button>
											<button type="button" class={ui.dangerButton} onclick={() => onDeleteUser(user.id)}>
												<AppIcon name="trash" class="h-4 w-4" />
												{m.app_delete()}
											</button>
										</div>
									{/if}
								</article>
							{/each}
						</div>
					{/if}
				</section>

				<section id="admin-objects" class={ui.panel}>
					<h2 class={ui.sectionTitle}>
						<AppIcon name="map-pin" class="h-5 w-5 text-[var(--brand)]" />
						{m.app_admin_objects_title()}
					</h2>
 				<form class="mt-4 grid gap-3 md:grid-cols-2" onsubmit={onCreateObject}>
						<label class={`${ui.label} md:col-span-2`}>
							<span class="label-title">
								<AppIcon name="map-pin" class="h-4 w-4" />
								{m.app_admin_object_address_label()}
							</span>
							<div class="relative">
								<div class={ui.inputWithIcon}>
									<AppIcon name={objectAddressSearching ? 'refresh' : 'map-pin'} class={`${ui.inputIcon} ${objectAddressSearching ? 'animate-spin' : ''}`} />
									<input
										type="text"
										class={ui.inputPadded}
										placeholder={m.location_picker_search_placeholder()}
										value={objectAddressQuery}
										autocomplete="off"
										oninput={(event) => onObjectAddressInput((event.currentTarget as HTMLInputElement).value)}
										onfocus={() => {
											if (objectAddressSuggestions.length) objectAddressShowSuggestions = true;
										}}
										onblur={() => setTimeout(() => (objectAddressShowSuggestions = false), 180)}
									/>
								</div>
								{#if objectAddressShowSuggestions && objectAddressSuggestions.length > 0}
									<ul class="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-lg">
										{#each objectAddressSuggestions as item, idx (idx)}
											<li>
												<button
													type="button"
													class="w-full px-3 py-2 text-left text-sm transition hover:bg-[var(--bg-muted)]"
													onmousedown={() => onSelectObjectAddressSuggestion(item)}
												>
													<AppIcon name="map-pin" class="mr-1.5 inline h-3.5 w-3.5 text-[var(--brand)]" />
													{item.display_name}
												</button>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						</label>
						<label class={ui.label}>
							<span class="label-title">
								<AppIcon name="building" class="h-4 w-4" />
								{m.app_admin_object_city_label()}
							</span>
							<input required bind:value={objectForm.city} type="text" class={ui.input} />
						</label>
						<label class={ui.label}>
							<span class="label-title">
								<AppIcon name="map-pin" class="h-4 w-4" />
								{m.app_admin_object_street_label()}
							</span>
							<input required bind:value={objectForm.street} type="text" class={ui.input} />
						</label>
						<label class={ui.label}>
							<span class="label-title">
								<AppIcon name="home" class="h-4 w-4" />
								{m.app_admin_object_house_number_label()}
							</span>
							<input required bind:value={objectForm.houseNumber} type="text" class={ui.input} />
						</label>
						<label class="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-muted)] px-3 text-sm font-semibold text-[var(--text-main)]">
							<input
								type="checkbox"
								class="h-4 w-4 accent-[var(--brand)]"
								bind:checked={objectForm.isPrivateHouse}
							/>
							<span>{m.app_admin_object_is_private_house_label()}</span>
						</label>
						{#if !objectForm.isPrivateHouse}
							<label class={ui.label}>
								<span class="label-title">
									<AppIcon name="home" class="h-4 w-4" />
									{m.app_admin_object_apartment_number_label()}
								</span>
								<input bind:value={objectForm.apartmentNumber} type="text" class={ui.input} />
							</label>
							<label class={ui.label}>
								<span class="label-title">
									<AppIcon name="building" class="h-4 w-4" />
									{m.app_admin_object_floor_label()}
								</span>
								<input bind:value={objectForm.floor} type="text" class={ui.input} />
							</label>
						{/if}
						<label class={`${ui.label} md:col-span-2`}>
							<span class="label-title">
								<AppIcon name="message-square" class="h-4 w-4" />
								{m.app_admin_object_description_label()}
							</span>
							<input bind:value={objectForm.description} type="text" class={ui.input} />
						</label>
						<div class="flex flex-wrap gap-2 md:col-span-2">
							<button type="submit" disabled={loading} class={ui.primaryButton}>
								<AppIcon name="plus" class="h-4 w-4" />
								{m.app_admin_objects_create()}
							</button>
							<button
								type="button"
								disabled={loading}
								onclick={onLoadObjects}
								class={ui.secondaryButton}
							>
								<AppIcon name="refresh" class="h-4 w-4" />
								{m.app_admin_objects_fetch()}
							</button>
						</div>
					</form>
 				{#if objectsStatus.length === 0}
						<p class="mt-4 text-[var(--text-soft)]">{m.app_empty_objects()}</p>
					{:else}
						<div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
							{#each objectsStatus as item (item.objectId)}
								<article class="surface-soft p-4">
									<div class="flex items-center justify-between">
										<span class="chip">#{item.objectId}</span>
										<span class="text-xs text-[var(--text-soft)]">{m.app_admin_objects_total_tasks()}: {item.totalTasks}</span>
									</div>
									{#if editingObjectId === item.objectId}
										<div class="mt-3 grid gap-2">
											<label class={ui.label}>
												<span>{m.app_admin_object_address_label()}</span>
												<input bind:value={objectEditForm.address} class={ui.input} type="text" required />
											</label>
											<label class={ui.label}>
												<span>{m.app_admin_object_description_label()}</span>
												<input bind:value={objectEditForm.description} class={ui.input} type="text" />
											</label>
										</div>
										<div class="mt-3 flex flex-wrap gap-2">
											<button type="button" class={ui.primaryButton} onclick={() => onSaveObjectEdit(item.objectId)}>
												<AppIcon name="check-circle" class="h-4 w-4" />
												{m.app_save()}
											</button>
											<button type="button" class={ui.secondaryButton} onclick={cancelObjectEdit}>
												{m.app_cancel()}
											</button>
										</div>
									{:else}
										<p class="mt-2 font-semibold">
											<AppIcon name="map-pin" class="mr-1 inline h-4 w-4 text-[var(--brand)]" />
											{item.address}
										</p>
										{#if item.description}
											<p class="mt-1 text-sm text-[var(--text-soft)]">{item.description}</p>
										{/if}
										<div class="mt-3 flex flex-wrap gap-2 text-xs">
											<span class="rounded-lg bg-amber-100 px-2 py-1 font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
												{item.pendingTasks} {m.app_admin_objects_pending_tasks()}
											</span>
											<span class="rounded-lg bg-blue-100 px-2 py-1 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
												{item.inProgressTasks} {m.app_admin_objects_in_progress_tasks()}
											</span>
											<span class="rounded-lg bg-green-100 px-2 py-1 font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
												{item.completedTasks} {m.app_admin_objects_completed_tasks()}
											</span>
										</div>
										<div class="mt-3 flex flex-wrap gap-2">
											<button type="button" class={ui.secondaryButton} onclick={() => startObjectEdit(item)}>
												<AppIcon name="checklist" class="h-4 w-4" />
												{m.app_edit()}
											</button>
											<button type="button" class={ui.dangerButton} onclick={() => onDeleteObject(item.objectId)}>
												<AppIcon name="trash" class="h-4 w-4" />
												{m.app_delete()}
											</button>
										</div>
									{/if}
								</article>
							{/each}
						</div>
					{/if}
					<div id="admin-object-settings" class="mt-6 border-t border-[var(--border)] pt-6">
						<h3 class={ui.sectionTitle}>
							<AppIcon name="map-pin" class="h-5 w-5 text-[var(--brand)]" />
							{m.app_admin_object_settings_title()}
						</h3>
						<p class="mt-2 text-sm text-[var(--text-soft)]">
							{m.app_admin_object_settings_desc()}
						</p>
						<form class="mt-4 grid gap-4" onsubmit={onUpdateObjectLocation}>
							<div class="grid gap-3 md:grid-cols-2">
								<label class={ui.label}>
									<span>{m.app_admin_object_settings_object_label()}</span>
									<select bind:value={objectSettingsForm.objectId} class={ui.input}>
										<option value="" disabled>{m.app_admin_object_settings_select_object()}</option>
										{#each objectsStatus as objectRow (objectRow.objectId)}
											<option value={String(objectRow.objectId)}>
												#{objectRow.objectId} · {objectRow.address}
											</option>
										{/each}
									</select>
								</label>
								<label class={ui.label}>
									<span>{m.app_admin_object_settings_radius_label()}</span>
									<input
										type="number"
										min="10"
										bind:value={objectSettingsForm.geofenceRadiusMeters}
										class={ui.input}
										required
									/>
								</label>
							</div>
							<LocationPicker
								bind:latitude={objectSettingsForm.latitude}
								bind:longitude={objectSettingsForm.longitude}
							/>
							<div>
								<button
									type="submit"
									class={ui.primaryButton}
									disabled={loading || !objectSettingsForm.objectId}
								>
									<AppIcon name="check-circle" class="h-4 w-4" />
									{m.app_admin_object_settings_save_location()}
								</button>
							</div>
						</form>
						<p class="mt-2 text-sm text-[var(--text-soft)]">
							{m.app_admin_object_settings_standard_auto()}
						</p>
					</div>
				</section>

 			<section id="admin-rooms" class={ui.panel}>
 				<h2 class={ui.sectionTitle}>
 					<AppIcon name="building" class="h-5 w-5 text-[var(--brand)]" />
 					{m.app_admin_rooms_title()}
 				</h2>
				<div class="mt-3">
					<button type="button" disabled={loading} onclick={onLoadRooms} class={ui.secondaryButton}>
						<AppIcon name="refresh" class="h-4 w-4" />
						{m.app_admin_rooms_fetch()}
					</button>
				</div>
 				<form class="mt-4 grid gap-3 md:grid-cols-3" onsubmit={onCreateRoom}>
 					<label class={ui.label}>
 						<span class="label-title">
 							<AppIcon name="building" class="h-4 w-4" />
 							{m.app_admin_room_object_label()}
 						</span>
 						<select required bind:value={roomForm.objectId} class={ui.input}>
 							<option value="" disabled>{m.app_admin_room_select_object()}</option>
 							{#each objectsStatus as obj (obj.objectId)}
 								<option value={String(obj.objectId)}>
 									#{obj.objectId} · {obj.address}
 								</option>
 							{/each}
 						</select>
 					</label>
 					<label class={ui.label}>
 						<span class="label-title">
 							<AppIcon name="checklist" class="h-4 w-4" />
 							{m.app_admin_room_type_label()}
 						</span>
 						<select bind:value={roomForm.type} class={ui.input}>
 							<option value="office">{m.room_type_office()}</option>
 							<option value="bathroom">{m.room_type_bathroom()}</option>
 							<option value="corridor">{m.room_type_corridor()}</option>
 						</select>
 					</label>
 					<label class={ui.label}>
 						<span class="label-title">
 							<AppIcon name="filter" class="h-4 w-4" />
 							{m.app_admin_room_area_label()}
 						</span>
 						<input
 							required
 							type="number"
 							min="1"
 							bind:value={roomForm.areaSqm}
 							class={ui.input}
 						/>
 					</label>
 					<div class="md:col-span-3">
 						<button type="submit" disabled={loading} class={ui.primaryButton}>
 							<AppIcon name="plus" class="h-4 w-4" />
 							{m.app_admin_rooms_create()}
 						</button>
 					</div>
 				</form>
				{#if companyRooms.length === 0}
					<p class="mt-4 text-[var(--text-soft)]">{m.app_empty_rooms()}</p>
				{:else}
					<div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{#each companyRooms as room (room.id)}
							<article class="surface-soft p-4">
								<div class="flex items-center justify-between">
									<span class="chip">#{room.id}</span>
									<span class="chip">{roomTypeLabel(room.type)}</span>
								</div>
								{#if editingRoomId === room.id}
									<div class="mt-3 grid gap-2">
										<label class={ui.label}>
											<span>{m.app_admin_room_object_label()}</span>
											<select bind:value={roomEditForm.objectId} class={ui.input}>
												{#each objectsStatus as obj (obj.objectId)}
													<option value={String(obj.objectId)}>#{obj.objectId} · {obj.address}</option>
												{/each}
											</select>
										</label>
										<label class={ui.label}>
											<span>{m.app_admin_room_type_label()}</span>
											<select bind:value={roomEditForm.type} class={ui.input}>
												<option value="office">{m.room_type_office()}</option>
												<option value="bathroom">{m.room_type_bathroom()}</option>
												<option value="corridor">{m.room_type_corridor()}</option>
											</select>
										</label>
										<label class={ui.label}>
											<span>{m.app_admin_room_area_label()}</span>
											<input bind:value={roomEditForm.areaSqm} type="number" min="1" class={ui.input} />
										</label>
									</div>
									<div class="mt-3 flex flex-wrap gap-2">
										<button type="button" class={ui.primaryButton} onclick={() => onSaveRoomEdit(room.id)}>
											<AppIcon name="check-circle" class="h-4 w-4" />
											{m.app_save()}
										</button>
										<button type="button" class={ui.secondaryButton} onclick={cancelRoomEdit}>
											{m.app_cancel()}
										</button>
									</div>
								{:else}
									<p class="mt-2 font-semibold">
										{room.objectAddress || `#${room.object_id}`} · {room.area_sqm} sqm
									</p>
									<p class="mt-1 text-sm text-[var(--text-soft)]">{roomTypeLabel(room.type)}</p>
									<div class="mt-3 flex flex-wrap gap-2">
										<button type="button" class={ui.secondaryButton} onclick={() => startRoomEdit(room)}>
											<AppIcon name="checklist" class="h-4 w-4" />
											{m.app_edit()}
										</button>
										<button type="button" class={ui.dangerButton} onclick={() => onDeleteRoom(room.id)}>
											<AppIcon name="trash" class="h-4 w-4" />
											{m.app_delete()}
										</button>
									</div>
								{/if}
							</article>
						{/each}
					</div>
				{/if}
 			</section>

 			<section id="admin-tasks" class={ui.panel}>
 				<h2 class={ui.sectionTitle}>
 					<AppIcon name="checklist" class="h-5 w-5 text-[var(--brand)]" />
 					{m.app_admin_tasks_title()}
 				</h2>
				<div class="mt-3">
					<button type="button" disabled={loading} onclick={onLoadAdminTasks} class={ui.secondaryButton}>
						<AppIcon name="refresh" class="h-4 w-4" />
						{m.app_admin_tasks_fetch()}
					</button>
				</div>
 				<form class="mt-4 grid gap-3 md:grid-cols-2" onsubmit={onCreateTask}>
 					<label class={ui.label}>
 						<span class="label-title">
 							<AppIcon name="building" class="h-4 w-4" />
 							{m.app_admin_task_room_label()}
 						</span>
 						<select required bind:value={taskForm.roomId} class={ui.input}>
 							<option value="" disabled>{m.app_admin_task_select_room()}</option>
 							{#each companyRooms as room (room.id)}
 								<option value={String(room.id)}>
 									#{room.id} · {room.objectAddress || ''} · {room.type} · {room.area_sqm} sqm
 								</option>
 							{/each}
 						</select>
 					</label>
 					<label class={ui.label}>
 						<span class="label-title">
 							<AppIcon name="user" class="h-4 w-4" />
 							{m.app_admin_task_cleaner_label()}
 						</span>
 						<select required bind:value={taskForm.cleanerId} class={ui.input}>
 							<option value="" disabled>{m.app_admin_task_select_cleaner()}</option>
 							{#each companyUsers.filter((u) => u.role === 'cleaner') as cleaner (cleaner.id)}
 								<option value={String(cleaner.id)}>
 									#{cleaner.id} · {cleaner.name} ({cleaner.email})
 								</option>
 							{/each}
 						</select>
 					</label>
 					<div class="md:col-span-2">
 						<button type="submit" disabled={loading} class={ui.primaryButton}>
 							<AppIcon name="plus" class="h-4 w-4" />
 							{m.app_admin_tasks_create()}
 						</button>
 					</div>
 				</form>
				{#if adminTasks.length === 0}
					<p class="mt-4 text-[var(--text-soft)]">{m.app_empty_tasks()}</p>
				{:else}
					<div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{#each adminTasks as task (task.id)}
							<article class="surface-soft p-4">
								<div class="flex items-center justify-between">
									<span class="chip">#{task.id}</span>
									<span class="chip">{taskStatusLabel(task.status)}</span>
								</div>
								{#if editingTaskId === task.id}
									<div class="mt-3 grid gap-2">
										<label class={ui.label}>
											<span>{m.app_admin_task_room_label()}</span>
											<select bind:value={taskEditForm.roomId} class={ui.input}>
												{#each companyRooms as room (room.id)}
													<option value={String(room.id)}>
														#{room.id} · {room.objectAddress || ''} · {roomTypeLabel(room.type)}
													</option>
												{/each}
											</select>
										</label>
										<label class={ui.label}>
											<span>{m.app_admin_task_cleaner_label()}</span>
											<select bind:value={taskEditForm.cleanerId} class={ui.input}>
												{#each companyUsers.filter((u) => u.role === 'cleaner') as cleaner (cleaner.id)}
													<option value={String(cleaner.id)}>
														#{cleaner.id} · {cleaner.name} ({cleaner.email})
													</option>
												{/each}
											</select>
										</label>
										<label class={ui.label}>
											<span>{m.app_status_label()}</span>
											<select bind:value={taskEditForm.status} class={ui.input}>
												<option value="pending">{m.app_status_pending()}</option>
												<option value="in_progress">{m.app_status_in_progress()}</option>
												<option value="completed">{m.app_status_completed()}</option>
											</select>
										</label>
									</div>
									<div class="mt-3 flex flex-wrap gap-2">
										<button type="button" class={ui.primaryButton} onclick={() => onSaveTaskEdit(task.id)}>
											<AppIcon name="check-circle" class="h-4 w-4" />
											{m.app_save()}
										</button>
										<button type="button" class={ui.secondaryButton} onclick={cancelTaskEdit}>
											{m.app_cancel()}
										</button>
									</div>
								{:else}
									<p class="mt-2 font-semibold">
										{task.object_address} · {roomTypeLabel(task.room_type)} · {task.room_area_sqm} sqm
									</p>
									<p class="mt-1 text-sm text-[var(--text-soft)]">
										{task.cleaner_name} ({task.cleaner_email})
									</p>
									<div class="mt-3 flex flex-wrap gap-2">
										<button type="button" class={ui.secondaryButton} onclick={() => startTaskEdit(task)}>
											<AppIcon name="checklist" class="h-4 w-4" />
											{m.app_edit()}
										</button>
										<button type="button" class={ui.dangerButton} onclick={() => onDeleteTask(task.id)}>
											<AppIcon name="trash" class="h-4 w-4" />
											{m.app_delete()}
										</button>
									</div>
								{/if}
							</article>
						{/each}
					</div>
				{/if}
 			</section>

 			<section id="admin-wizard" class={ui.panel}>
 				<h2 class={ui.sectionTitle}>
 					<AppIcon name="sparkles" class="h-5 w-5 text-[var(--brand)]" />
 					{m.app_admin_wizard_title()}
 				</h2>
 				<p class="mt-2 text-sm text-[var(--text-soft)]">{m.app_admin_wizard_desc()}</p>

 				<div class="mt-4 flex items-center gap-2 text-sm font-medium">
 					{#each [m.app_admin_wizard_step_object(), m.app_admin_wizard_step_room(), m.app_admin_wizard_step_task(), m.app_admin_wizard_step_done()] as label, i}
 						<span
 							class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold {i <= wizardStep ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-muted)] text-[var(--text-soft)]'}"
						>{i + 1}</span>
						<span class="hidden sm:inline {i <= wizardStep ? 'text-[var(--text-main)]' : 'text-[var(--text-soft)]'}">{label}</span>
 						{#if i < 3}
 							<span class="mx-1 h-px w-4 bg-[var(--border)] sm:w-8"></span>
 						{/if}
 					{/each}
 				</div>

 				{#if wizardStep === 0}
 					<div class="mt-4 grid gap-3 sm:max-w-xl">
 						<label class={ui.label}>
 							<span class="label-title">
 								<AppIcon name="map-pin" class="h-4 w-4" />
 								{m.app_admin_wizard_select_object()}
 							</span>
							<select required bind:value={wizardObjectId} class={ui.input} onchange={onWizardObjectChange}>
								<option value="" disabled>{m.app_admin_room_select_object()}</option>
								{#each objectsStatus as obj (obj.objectId)}
									<option value={String(obj.objectId)}>
										#{obj.objectId} · {obj.address}
 									</option>
 								{/each}
 							</select>
 						</label>
 						<div>
 							<button
 								type="button"
 								class={ui.primaryButton}
 								disabled={!wizardObjectId}
 								onclick={() => { wizardStep = 1; }}
 							>
 								<AppIcon name="chevron-right" class="h-4 w-4" />
 								{m.app_admin_wizard_next()}
 							</button>
 						</div>
 					</div>
 				{:else if wizardStep === 1}
 					<div class="mt-4 grid gap-3 sm:max-w-xl">
 						<label class={ui.label}>
 							<span>{m.app_admin_wizard_pick_room()}</span>
							<select bind:value={wizardRoomId} class={ui.input} onchange={onWizardRoomChange}>
								<option value="">{m.app_admin_wizard_new_room()}</option>
								{#each wizardRoomsForObject() as room (room.id)}
									<option value={String(room.id)}>
 										#{room.id} · {room.type} · {room.area_sqm} sqm
 									</option>
 								{/each}
 							</select>
 						</label>
 						{#if !wizardRoomId}
 							<form class="grid gap-3 sm:grid-cols-2" onsubmit={onWizardCreateRoom}>
 								<label class={ui.label}>
 									<span>{m.app_admin_room_type_label()}</span>
 									<select bind:value={wizardRoomType} class={ui.input}>
 										<option value="office">{m.room_type_office()}</option>
 										<option value="bathroom">{m.room_type_bathroom()}</option>
 										<option value="corridor">{m.room_type_corridor()}</option>
 									</select>
 								</label>
 								<label class={ui.label}>
 									<span>{m.app_admin_room_area_label()}</span>
 									<input required type="number" min="1" bind:value={wizardRoomArea} class={ui.input} />
 								</label>
 								<div class="sm:col-span-2">
 									<button type="submit" class={ui.primaryButton} disabled={loading}>
 										<AppIcon name="plus" class="h-4 w-4" />
 										{m.app_admin_wizard_create_room_next()}
 									</button>
 								</div>
 							</form>
 						{:else}
 							<div>
 								<button
 									type="button"
 									class={ui.primaryButton}
 									onclick={() => { wizardStep = 2; }}
 								>
 									<AppIcon name="chevron-right" class="h-4 w-4" />
 									{m.app_admin_wizard_next()}
 								</button>
 							</div>
 						{/if}
 						<div>
 							<button type="button" class={ui.secondaryButton} onclick={() => { wizardStep = 0; }}>
 								{m.app_admin_wizard_back()}
 							</button>
 						</div>
 					</div>
 				{:else if wizardStep === 2}
					{@const recommendation = wizardRecommendation()}
 					<form class="mt-4 grid gap-3 sm:max-w-xl" onsubmit={onWizardCreateTask}>
						<div class="surface-soft rounded-xl border border-[var(--border)] p-3">
							<p class="text-sm font-semibold">{m.app_admin_wizard_recommendation_title()}</p>
							<p class="mt-1 text-xs text-[var(--text-soft)]">
								{m.app_admin_wizard_recommendation_hint()}
							</p>
							<label class={ui.label + ' mt-3'}>
								<span>{m.app_admin_wizard_traffic_label()}</span>
								<select bind:value={wizardUsage} class={ui.input}>
									<option value="quiet">{m.app_admin_wizard_traffic_low()}</option>
									<option value="normal">{m.app_admin_wizard_traffic_medium()}</option>
									<option value="busy">{m.app_admin_wizard_traffic_high()}</option>
								</select>
							</label>
							<div class="mt-2 grid gap-1 text-sm">
								<p>
									<span class="text-[var(--text-soft)]"
										>{m.app_admin_wizard_recommended_level_label()}</span
									>
									<span class="font-medium">{wizardLevelLabel(recommendation.level)}</span>
								</p>
								<p>
									<span class="text-[var(--text-soft)]"
										>{m.app_admin_wizard_recommended_reason_label()}</span
									>
									<span>{recommendation.reason}</span>
								</p>
							</div>
							<label class="mt-3 inline-flex items-center gap-2 text-sm font-medium">
								<input
									type="checkbox"
									bind:checked={wizardApplyRecommendedStandard}
									class="h-4 w-4 accent-[var(--brand)]"
								/>
								<span>{m.app_admin_wizard_apply_recommendation_label()}</span>
							</label>
						</div>
 						<label class={ui.label}>
 							<span class="label-title">
 								<AppIcon name="user" class="h-4 w-4" />
 								{m.app_admin_task_cleaner_label()}
 							</span>
 							<select required bind:value={wizardCleanerId} class={ui.input}>
 								<option value="" disabled>{m.app_admin_task_select_cleaner()}</option>
 								{#each wizardCleaners() as cleaner (cleaner.id)}
 									<option value={String(cleaner.id)}>
 										#{cleaner.id} · {cleaner.name} ({cleaner.email})
 									</option>
 								{/each}
 							</select>
 						</label>
 						<div class="flex flex-wrap gap-2">
 							<button type="submit" class={ui.primaryButton} disabled={loading || !wizardCleanerId}>
 								<AppIcon name="check-circle" class="h-4 w-4" />
 								{m.app_admin_wizard_assign_task()}
 							</button>
 							<button type="button" class={ui.secondaryButton} onclick={() => { wizardStep = 1; }}>
 								{m.app_admin_wizard_back()}
 							</button>
 						</div>
 					</form>
 				{:else}
 					<div class="mt-4 grid gap-3 sm:max-w-xl">
 						<div class="flex items-center gap-2 rounded-xl bg-green-50 p-4 text-green-800 dark:bg-green-900/20 dark:text-green-300">
 							<AppIcon name="check-circle" class="h-5 w-5" />
 							<span class="font-semibold">{m.app_admin_wizard_done()}</span>
 						</div>
 						<div>
 							<button type="button" class={ui.primaryButton} onclick={resetWizard}>
 								<AppIcon name="plus" class="h-4 w-4" />
 								{m.app_admin_wizard_create_another()}
 							</button>
 						</div>
 					</div>
 				{/if}
 			</section>

				<section id="admin-analytics" class={ui.panel}>
					<h2 class={ui.sectionTitle}>
						<AppIcon name="star" class="h-5 w-5 text-[var(--brand)]" />
						{m.app_admin_analytics_title()}
					</h2>
					<div class="mt-3">
						<button
							type="button"
							disabled={loading}
							onclick={onLoadEfficiency}
							class={ui.secondaryButton}
						>
							<AppIcon name="refresh" class="h-4 w-4" />
							{m.app_admin_analytics_fetch()}
						</button>
					</div>
					<div class={ui.tableWrap}>
						<table class={ui.table}>
							<thead class="text-left text-[var(--text-soft)]">
								<tr>
									<th class="py-2 pr-4">{m.app_admin_analytics_cleaner()}</th>
									<th class="py-2 pr-4">{m.app_admin_analytics_area()}</th>
								</tr>
							</thead>
							<tbody>
								{#if efficiency.length === 0}
									<tr>
										<td colspan="2" class="py-3 text-[var(--text-soft)]"
											>{m.app_empty_analytics()}</td
										>
									</tr>
								{:else}
									{#each efficiency as row, index (index)}
										<tr class="border-t border-[var(--border)]">
											<td class="py-2 pr-4">{row.cleanerName}</td>
											<td class="py-2 pr-4">{row.totalArea}</td>
										</tr>
									{/each}
								{/if}
							</tbody>
						</table>
					</div>
				</section>

				<section id="admin-analytics-quality" class={ui.panel}>
					<h2 class={ui.sectionTitle}>
						<AppIcon name="star" class="h-5 w-5 text-[var(--brand)]" />
						{m.app_admin_quality_ai_title()}
					</h2>
					<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						<MetricCard
							title={m.app_metric_quality_points()}
							value={String(
								adminQualityAnalytics.reduce((acc, row) => acc + Number(row.value || 0), 0)
							)}
							detail={m.app_metric_rows({ count: String(adminQualityAnalytics.length) })}
							icon="check-circle"
						/>
						<MetricCard
							title={m.app_metric_sync_rows()}
							value={String(adminSyncAnalytics.length)}
							detail={m.app_metric_avg_success({
								value: adminSyncAnalytics.length
									? asPercent(
											adminSyncAnalytics.reduce((acc, row) => acc + row.success_rate, 0) /
												adminSyncAnalytics.length
										)
									: '0%'
							})}
							icon="refresh"
						/>
						<MetricCard
							title={m.app_metric_ai_estimated_cost()}
							value={`$${adminAICostAnalytics.reduce((acc, row) => acc + Number(row.estimated_cost_usd || 0), 0).toFixed(2)}`}
							detail={m.app_metric_models({ count: String(adminAICostAnalytics.length) })}
							icon="sparkles"
						/>
					</div>
					<div class="mt-4 grid gap-4 lg:grid-cols-2">
						<SparklineChart
							title={m.app_chart_quality_trend()}
							labels={analyticsLabels(adminQualityAnalytics)}
							values={analyticsValues(adminQualityAnalytics)}
							emptyText={m.app_empty_chart_data()}
						/>
						<SparklineChart
							title={m.app_chart_sync_health_trend()}
							labels={adminSyncAnalytics.map((row) => row.label)}
							values={adminSyncAnalytics.map((row) => Number(row.success_rate || 0))}
							color="#2fa36b"
							emptyText={m.app_empty_chart_data()}
						/>
					</div>
					{#if adminAICostAnalytics.length > 0}
						<div class={ui.tableWrap}>
							<table class={ui.table}>
								<thead>
									<tr>
										<th>{m.app_table_model()}</th>
										<th>{m.app_table_requests()}</th>
										<th>{m.app_table_input_tokens()}</th>
										<th>{m.app_table_output_tokens()}</th>
										<th>{m.app_table_estimated_usd()}</th>
									</tr>
								</thead>
								<tbody>
									{#each adminAICostAnalytics as row (row.model)}
										<tr>
											<td>{row.model}</td>
											<td>{row.request_count}</td>
											<td>{row.estimated_input_tokens}</td>
											<td>{row.estimated_output_tokens}</td>
											<td>${row.estimated_cost_usd.toFixed(4)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</section>
			</div>
		{/if}

		{#if currentSession.user.role === 'cleaner'}
			<section id="cleaner-tasks" class={`mt-6 ${ui.panel}`}>
				<h2 class={ui.sectionTitle}>
					<AppIcon name="checklist" class="h-5 w-5 text-[var(--brand)]" />
					{m.app_cleaner_title()}
				</h2>
				<div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<MetricCard
						title={m.app_metric_queue_pending()}
						value={String(queueStats.pending)}
						detail={m.app_metric_failed({ count: String(queueStats.failed) })}
						icon="refresh"
					/>
					<MetricCard
						title={m.app_metric_queue_done()}
						value={String(queueStats.done)}
						detail={m.app_metric_total({ count: String(queueStats.total) })}
						icon="check-circle"
					/>
					<MetricCard
						title={m.app_metric_sync_status()}
						value={syncStatusSnapshot?.pending_count !== undefined
							? String(syncStatusSnapshot.pending_count)
							: m.app_value_na()}
						detail={m.app_metric_server_failed({
							count:
								syncStatusSnapshot?.failed_count !== undefined
									? String(syncStatusSnapshot.failed_count)
									: m.app_value_na()
						})}
						icon="upload"
					/>
					<div class="surface-soft flex flex-col justify-center gap-2 p-3">
						<button
							type="button"
							class={ui.primaryButton}
							onclick={onSyncOfflineQueue}
							disabled={loading || syncingQueue}
						>
							<AppIcon name="upload" class="h-4 w-4" />
							{m.app_cleaner_sync_now()}
						</button>
						<button
							type="button"
							class={ui.secondaryButton}
							onclick={onClearDoneQueueItems}
							disabled={loading}
						>
							<AppIcon name="trash" class="h-4 w-4" />
							{m.app_cleaner_clear_done()}
						</button>
					</div>
				</div>
				{#if queueStats.failed > 0}
					<div class="surface-soft mt-3 p-3">
						<p class="text-sm font-semibold text-[var(--text-soft)]">
							{m.app_cleaner_failed_queue_title()}
						</p>
						<div class="mt-2 grid gap-2 text-sm">
							{#each offlineOps.filter((item) => item.status === 'failed') as item (item.client_operation_id)}
								<div class="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2">
									<p class="font-semibold">#{item.task_id} · {item.operation_type}</p>
									<p class="text-[var(--text-soft)]">
										{item.last_error || m.app_cleaner_failed_operation_default()}
									</p>
									<p class="text-xs text-[var(--text-soft)]">
										{m.app_cleaner_attempts({ count: String(item.attempt_count) })}
									</p>
									<button
										type="button"
										class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-600"
										onclick={() =>
											deleteOfflineOperation(item.client_operation_id).then(hydrateOfflineQueue)}
									>
										<AppIcon name="trash" class="h-3.5 w-3.5" />
										{m.app_remove()}
									</button>
								</div>
							{/each}
						</div>
					</div>
				{/if}
				<form
					class="mt-3 grid gap-3 md:grid-cols-4"
					onsubmit={(event) => {
						event.preventDefault();
						void onLoadCleanerTasks();
					}}
				>
					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="filter" class="h-4 w-4" />
							{m.app_cleaner_filter_status_label()}
						</span>
						<select bind:value={cleanerFilters.status} class={ui.input}>
							<option value="">{m.app_cleaner_filter_any_status()}</option>
							<option value="pending">{m.app_status_pending()}</option>
							<option value="in_progress">{m.app_status_in_progress()}</option>
							<option value="completed">{m.app_status_completed()}</option>
						</select>
					</label>
					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="calendar" class="h-4 w-4" />
							{m.app_cleaner_filter_date_from_label()}
						</span>
						<input type="date" bind:value={cleanerFilters.date_from} class={ui.input} />
					</label>
					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="calendar" class="h-4 w-4" />
							{m.app_cleaner_filter_date_to_label()}
						</span>
						<input type="date" bind:value={cleanerFilters.date_to} class={ui.input} />
					</label>
					<div class="flex items-end">
						<button type="submit" disabled={loading} class={`${ui.secondaryButton} w-full sm:w-auto`}>
							<AppIcon name="refresh" class="h-4 w-4" />
							{m.app_cleaner_fetch()}
						</button>
					</div>
				</form>

				{#if cleanerTasks.length === 0}
					<p class="mt-4 text-[var(--text-soft)]">{m.app_empty_cleaner_tasks()}</p>
				{:else}
					<div class="mt-4 grid gap-4">
						{#each cleanerTasks as row (row.task.id)}
							<article class="surface-soft p-4">
								<p class="text-sm text-[var(--text-soft)]">
									{m.app_cleaner_task_id({ id: String(row.task.id) })}
								</p>
								<p class="mt-1 inline-flex items-center gap-2 font-semibold">
									<AppIcon name="check-circle" class="h-4 w-4 text-[var(--brand)]" />
									{m.app_cleaner_task_status({ status: taskStatusLabel(row.task.status) })}
								</p>
								<p class="text-sm text-[var(--text-soft)]">
									{m.app_cleaner_task_room({
										room: String(row.room.id),
										type: roomTypeLabel(row.room.type),
										area: String(row.room.area_sqm)
									})}
								</p>
 							<p class="text-sm text-[var(--text-soft)]">
									{m.app_cleaner_task_object({ address: row.object.address })}
								</p>
								<div class="mt-1 flex flex-wrap gap-2 text-xs">
									{#if row.object.cleaning_standard}
										<span class="chip"
											>{m.app_cleaner_tariff({
												standard: cleaningStandardLabel(row.object.cleaning_standard)
											})}</span
										>
									{/if}
									{#if row.object.latitude && row.object.longitude}
										<a
											href="https://www.openstreetmap.org/?mlat={row.object.latitude}&mlon={row.object.longitude}#map=17/{row.object.latitude}/{row.object.longitude}"
											target="_blank"
											rel="noopener noreferrer"
											class="chip text-[var(--brand)] underline"
										>
											<AppIcon name="map-pin" class="h-3.5 w-3.5" />
											{m.app_cleaner_view_on_map()}
										</a>
									{/if}
								</div>
								<div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-soft)]">
									<span class="chip">
										{m.app_cleaner_gps_label()}:
										{taskCoords[row.task.id]?.latitude !== undefined
											? `${taskCoords[row.task.id].latitude?.toFixed(5)}, ${taskCoords[row.task.id].longitude?.toFixed(5)}`
											: m.app_cleaner_gps_not_captured()}
									</span>
									<button
										type="button"
										class={ui.ghostButton}
										disabled={loading}
										onclick={() => captureTaskLocation(row.task.id)}
									>
										<AppIcon name="map-pin" class="h-4 w-4" />
										{m.app_cleaner_use_gps()}
									</button>
								</div>

								<div class="mt-3 grid gap-2 md:grid-cols-2">
									<label class={ui.label}>
										<span class="label-title">
											<AppIcon name="upload" class="h-4 w-4" />
											{m.app_cleaner_photo_before()}
										</span>
										<input
											type="file"
											accept="image/*"
											capture="environment"
											class="file-control"
											onchange={(event) => {
												const input = event.currentTarget as HTMLInputElement;
												beforeFiles[row.task.id] = input.files?.[0] || null;
											}}
										/>
									</label>
									<label class={ui.label}>
										<span class="label-title">
											<AppIcon name="camera" class="h-4 w-4" />
											{m.app_cleaner_photo_after()}
										</span>
										<input
											type="file"
											accept="image/*"
											capture="environment"
											class="file-control"
											onchange={(event) => {
												const input = event.currentTarget as HTMLInputElement;
												afterFiles[row.task.id] = input.files?.[0] || null;
											}}
										/>
									</label>
								</div>

								<div class="mt-3 flex flex-wrap gap-2">
									<button
										type="button"
										disabled={loading}
										onclick={() => onStartCleanerTask(row.task.id)}
										class={ui.primaryButton}
									>
										<AppIcon name="play" class="h-4 w-4" />
										{m.app_cleaner_start()}
									</button>
									<button
										type="button"
										disabled={loading}
										onclick={() => onCompleteCleanerTask(row.task.id)}
										class={ui.secondaryButton}
									>
										<AppIcon name="check-circle" class="h-4 w-4" />
										{m.app_cleaner_complete()}
									</button>
 							</div>

 							{#if row.task.status === 'in_progress'}
 								<div class="mt-3">
 									<TaskQuestionnaire
 										taskId={row.task.id}
 										token={currentSession?.token || ''}
 										onChecklistGenerated={() => refreshByRole()}
 									/>
 								</div>
 							{/if}

 							{#if checklistsByTask[row.task.id]}
									<div class="surface-soft mt-3 p-3">
										<div class="flex flex-wrap items-center justify-between gap-2">
											<p class="text-sm font-semibold">{m.app_cleaner_task_checklist()}</p>
											<span class="chip">
												{m.app_cleaner_completion_percent({
													value: String(checklistsByTask[row.task.id].completion_percent)
												})}
											</span>
										</div>
										<div class="mt-2 grid gap-2">
											{#each checklistsByTask[row.task.id].items as item, itemIndex (item.id)}
												<label
													class="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2"
												>
													<div class="flex items-start gap-2">
														<input
															type="checkbox"
															checked={item.done}
															onchange={(event) => {
																checklistsByTask[row.task.id].items[itemIndex].done = (
																	event.currentTarget as HTMLInputElement
																).checked;
															}}
															class="mt-1 h-4 w-4 accent-[var(--brand)]"
														/>
														<div class="grid flex-1 gap-1">
															<span class="text-sm font-medium">
																{item.title}
																{#if item.photo_required}
																	<span class="ml-1 text-xs text-orange-500">📷 {m.app_cleaner_photo_required()}</span>
																{/if}
															</span>
															<input
																type="text"
																class={ui.input}
																value={item.note || ''}
																oninput={(event) => {
																	checklistsByTask[row.task.id].items[itemIndex].note = (
																		event.currentTarget as HTMLInputElement
																	).value;
																}}
																placeholder={m.app_cleaner_note_placeholder()}
															/>
															{#if item.photo_url}
																<div class="mt-1">
																	<img src={item.photo_url} alt={item.title} class="h-20 w-20 rounded-lg border border-[var(--border)] object-cover" />
																</div>
															{/if}
															{#if item.photo_required || !item.photo_url}
																<input
																	type="file"
																	accept="image/*"
																	capture="environment"
																	class="file-control mt-1 text-xs"
																	onchange={(event) => {
																		const input = event.currentTarget as HTMLInputElement;
																		const file = input.files?.[0];
																		if (file) onUploadChecklistPhoto(row.task.id, item.id, file);
																	}}
																/>
															{/if}
														</div>
													</div>
												</label>
											{/each}
										</div>
										<button
											type="button"
											class={`mt-3 ${ui.secondaryButton}`}
											disabled={loading}
											onclick={() => onPatchChecklist(row.task.id)}
										>
											<AppIcon name="check-circle" class="h-4 w-4" />
											{m.app_cleaner_save_checklist()}
										</button>
									</div>
								{/if}

								{#if aiRatingsByTask[row.task.id]}
									<div class="surface-soft mt-3 p-3">
										<div class="flex flex-wrap items-center justify-between gap-2">
											<p class="text-sm font-semibold">{m.app_cleaner_ai_quality_title()}</p>
											<span class="chip">
												{aiStatusLabel(aiRatingsByTask[row.task.id].ai_status)}
											</span>
										</div>
										<p class="mt-1 text-sm text-[var(--text-soft)]">
											{m.app_cleaner_ai_score_model({
												score: String(aiRatingsByTask[row.task.id].ai_score ?? m.app_value_na()),
												model: aiRatingsByTask[row.task.id].ai_model ?? m.app_value_na()
											})}
										</p>
										{#if aiRatingsByTask[row.task.id].ai_feedback}
											<p class="mt-1 text-sm">{aiRatingsByTask[row.task.id].ai_feedback}</p>
										{/if}
										<button
											type="button"
											class={`mt-2 ${ui.ghostButton}`}
											onclick={() => onRunTaskAiRating(row.task.id)}
											disabled={loading}
										>
											<AppIcon name="sparkles" class="h-4 w-4" />
											{m.app_cleaner_ai_rerun()}
										</button>
									</div>
								{/if}
							</article>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		{#if currentSession.user.role === 'supervisor' || currentSession.user.role === 'admin'}
			<section id="supervisor-inspections" class={`mt-6 ${ui.panel}`}>
				<h2 class={ui.sectionTitle}>
					<AppIcon name="shield" class="h-5 w-5 text-[var(--brand)]" />
					{m.app_inspections_title()}
				</h2>
				<div class="mt-3">
					<button
						type="button"
						disabled={loading}
						onclick={onLoadInspections}
						class={ui.secondaryButton}
					>
						<AppIcon name="refresh" class="h-4 w-4" />
						{m.app_inspections_fetch()}
					</button>
				</div>
				<div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<MetricCard
						title={m.app_metric_quality_rows()}
						value={String(supervisorQualityAnalytics.length)}
						detail={m.app_metric_sum({
							value: String(
								supervisorQualityAnalytics.reduce((acc, row) => acc + Number(row.value || 0), 0)
							)
						})}
						icon="star"
					/>
					<MetricCard
						title={m.app_metric_geofence_rows()}
						value={String(supervisorGeofenceAnalytics.length)}
						detail={m.app_metric_violations({
							count: String(
								supervisorGeofenceAnalytics.reduce(
									(acc, row) => acc + Number(row.violations || 0),
									0
								)
							)
						})}
						icon="map-pin"
					/>
					<MetricCard
						title={m.app_metric_sync_rows()}
						value={String(supervisorSyncAnalytics.length)}
						detail={m.app_metric_avg_success({
							value: supervisorSyncAnalytics.length
								? asPercent(
										supervisorSyncAnalytics.reduce((acc, row) => acc + row.success_rate, 0) /
											supervisorSyncAnalytics.length
									)
								: '0%'
						})}
						icon="refresh"
					/>
				</div>
				<div class="mt-4 grid gap-4 lg:grid-cols-2">
					<SparklineChart
						title={m.app_chart_inspection_quality_trend()}
						labels={analyticsLabels(supervisorQualityAnalytics)}
						values={analyticsValues(supervisorQualityAnalytics)}
						emptyText={m.app_empty_chart_data()}
					/>
					<SparklineChart
						title={m.app_chart_geofence_violations_trend()}
						labels={supervisorGeofenceAnalytics.map((row) => row.label)}
						values={supervisorGeofenceAnalytics.map((row) => Number(row.violations || 0))}
						color="#d97706"
						emptyText={m.app_empty_chart_data()}
					/>
				</div>

				<form class="mt-4 grid gap-3 md:grid-cols-3" onsubmit={onCreateInspection}>
					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="checklist" class="h-4 w-4" />
							{m.app_inspection_task_id_label()}
						</span>
						<select required bind:value={inspectionForm.taskId} class={ui.input}>
							<option value="" disabled>{m.app_inspection_task_id_label()}</option>
							{#each inspectionsPending as pendingRow (pendingRow.task.id)}
								<option value={String(pendingRow.task.id)}>
									#{pendingRow.task.id} · {pendingRow.object.address}
								</option>
							{/each}
						</select>
					</label>
					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="star" class="h-4 w-4" />
							{m.app_inspection_score_label()}
						</span>
						<input
							required
							type="number"
							min="1"
							max="5"
							bind:value={inspectionForm.score}
							class={ui.input}
						/>
					</label>
					<label class={`${ui.label} md:col-span-3`}>
						<span class="label-title">
							<AppIcon name="message-square" class="h-4 w-4" />
							{m.app_inspection_comment_label()}
						</span>
						<input type="text" bind:value={inspectionForm.comment} class={ui.input} />
					</label>
					<div class="md:col-span-3">
						<button type="submit" disabled={loading} class={ui.primaryButton}>
							<AppIcon name="plus" class="h-4 w-4" />
							{m.app_inspection_create()}
						</button>
					</div>
				</form>

 			{#if inspectionsPending.length === 0}
					<p class="mt-4 text-[var(--text-soft)]">{m.app_empty_inspections()}</p>
				{:else}
					<div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{#each inspectionsPending as row (row.task.id)}
							<article class="surface-soft p-4">
								<div class="flex items-center justify-between">
									<span class="chip">#{row.task.id}</span>
									<span class="chip">{taskStatusLabel(row.task.status)}</span>
								</div>
								<p class="mt-2 font-semibold">
									<AppIcon name="map-pin" class="mr-1 inline h-4 w-4 text-[var(--brand)]" />
									{row.object.address}
								</p>
								<p class="mt-1 text-sm text-[var(--text-soft)]">
									<AppIcon name="home" class="mr-1 inline h-3.5 w-3.5" />
									{roomTypeLabel(row.room.type)} · {row.room.area_sqm} m²
								</p>
								<div class="mt-3 flex items-center justify-between">
									<div class="flex items-center gap-2">
										<AppIcon name="star" class="h-4 w-4 text-amber-500" />
										<span class="text-sm font-semibold">
											{aiRatingsByTask[row.task.id]?.ai_score ?? m.app_value_na()}
										</span>
									</div>
									<button
										type="button"
										class={ui.ghostButton}
										disabled={loading}
										onclick={() => onRunTaskAiRating(row.task.id)}
									>
										<AppIcon name="sparkles" class="h-4 w-4" />
										{m.app_action_rerun()}
									</button>
								</div>
							</article>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		{#if currentSession.user.role === 'client'}
			<section id="client-feedback" class={`mt-6 ${ui.panel}`}>
				<h2 class={ui.sectionTitle}>
					<AppIcon name="message-square" class="h-5 w-5 text-[var(--brand)]" />
					{m.app_client_title()}
				</h2>
				<p class="mt-2 text-[var(--text-soft)]">{m.app_client_body()}</p>
				<div class="mt-3">
					<button
						type="button"
						disabled={loading}
						onclick={onLoadClientFeedback}
						class={ui.secondaryButton}
					>
						<AppIcon name="refresh" class="h-4 w-4" />
						{m.app_client_feedback_fetch()}
					</button>
				</div>

				<form class="mt-4 grid gap-3 md:grid-cols-3" onsubmit={onCreateClientFeedback}>
					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="building" class="h-4 w-4" />
							{m.app_client_feedback_object_id_label()}
						</span>
						<select required bind:value={feedbackForm.objectId} class={ui.input}>
							<option value="" disabled>{m.app_client_feedback_object_id_label()}</option>
							{#each clientFeedbackObjects as objectRow (objectRow.id)}
								<option value={String(objectRow.id)}>
									#{objectRow.id} · {objectRow.address}
								</option>
							{/each}
						</select>
					</label>
					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="star" class="h-4 w-4" />
							{m.app_client_feedback_rating_label()}
						</span>
						<input
							required
							type="number"
							min="1"
							max="5"
							bind:value={feedbackForm.rating}
							class={ui.input}
						/>
					</label>
					<label class={`${ui.label} md:col-span-3`}>
						<span class="label-title">
							<AppIcon name="message-square" class="h-4 w-4" />
							{m.app_client_feedback_text_label()}
						</span>
						<input type="text" bind:value={feedbackForm.text} class={ui.input} />
					</label>
					<div class="md:col-span-3">
						<button
							type="submit"
							disabled={loading || clientFeedbackObjects.length === 0}
							class={ui.primaryButton}
						>
							<AppIcon name="plus" class="h-4 w-4" />
							{m.app_client_feedback_create()}
						</button>
					</div>
				</form>
				{#if clientFeedbackObjects.length === 0}
					<p class="mt-3 text-sm text-[var(--text-soft)]">{m.app_empty_objects()}</p>
				{/if}

 			{#if clientFeedbackRows.length === 0}
					<p class="mt-4 text-[var(--text-soft)]">{m.app_empty_client_feedback()}</p>
				{:else}
					<div class="mt-4 grid gap-3 sm:grid-cols-2">
						{#each clientFeedbackRows as row (row.feedback.id)}
							<article class="surface-soft p-4">
								<div class="flex items-center justify-between">
									<span class="chip">#{row.feedback.id}</span>
									<div class="flex items-center gap-1">
										{#each Array(5) as _, i (i)}
											<AppIcon
												name="star"
												class={`h-4 w-4 ${i < Number(feedbackDrafts[row.feedback.id]?.rating || row.feedback.rating) ? 'text-amber-500' : 'text-[var(--border)]'}`}
											/>
										{/each}
									</div>
								</div>
								<p class="mt-2 font-semibold">
									<AppIcon name="building" class="mr-1 inline h-4 w-4 text-[var(--brand)]" />
									{row.object.address}
								</p>
								<div class="mt-3 grid gap-2">
									<label class="grid gap-1 text-sm font-semibold text-[var(--text-soft)]">
										<span>{m.app_client_feedback_rating_label()}</span>
										<input
											type="number"
											min="1"
											max="5"
											bind:value={feedbackDrafts[row.feedback.id].rating}
											class={ui.input}
										/>
									</label>
									<label class="grid gap-1 text-sm font-semibold text-[var(--text-soft)]">
										<span>{m.app_client_feedback_text_label()}</span>
										<input
											type="text"
											bind:value={feedbackDrafts[row.feedback.id].text}
											class={ui.input}
										/>
									</label>
								</div>
								<div class="mt-3 flex flex-wrap gap-2">
									<button
										type="button"
										disabled={loading}
										onclick={() => onUpdateClientFeedback(row.feedback.id)}
										class={ui.secondaryButton}
									>
										<AppIcon name="check-circle" class="h-4 w-4" />
										{m.app_client_feedback_update()}
									</button>
									<button
										type="button"
										disabled={loading}
										onclick={() => onDeleteClientFeedback(row.feedback.id)}
										class={ui.dangerButton}
									>
										<AppIcon name="trash" class="h-4 w-4" />
										{m.app_client_feedback_delete()}
									</button>
								</div>
							</article>
						{/each}
					</div>
				{/if}
			</section>
		{/if}
	{/if}
</main>
