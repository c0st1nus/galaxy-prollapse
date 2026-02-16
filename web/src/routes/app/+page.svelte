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
		adminAcceptClientServiceRequest,
		adminCreateObject,
		adminCreateRoom,
		adminCreateTask,
		adminCreateUser,
		adminDeleteCompany,
		adminDeleteObject,
		adminDeleteRoom,
		adminDeleteTask,
		adminDeleteUser,
		adminGetAnalyticsAICost,
		adminGetAnalyticsQuality,
		adminGetAnalyticsSync,
		adminGetClientServiceRequests,
		adminGetCompany,
		adminGetEfficiency,
		adminGetObjectsStatus,
		adminGetRoomTypeCatalog,
		adminGetRooms,
		adminGetTasks,
		adminGetUsers,
		adminPatchCompany,
		adminPatchObject,
		adminPatchObjectCleaningStandard,
		adminPatchObjectLocation,
		adminPatchRoom,
		adminPatchTask,
		adminPatchUser,
		authGetCompanies,
		cleanerGetTaskAiRating,
		cleanerGetTaskChecklist,
		cleanerRunTaskAiRating,
		cleanerCompleteTask,
		cleanerFlowCheckInObject,
		cleanerFlowCheckOutObject,
		cleanerFlowGetToday,
		cleanerFlowUpdateObjectPresence,
		cleanerPatchTaskChecklist,
		cleanerStartTask,
		cleanerUploadChecklistPhoto,
		clientServiceRequestsCreate,
		clientServiceRequestsGetMy,
		feedbackCreate,
		feedbackDelete,
		feedbackGetObjects,
		feedbackGetMy,
		feedbackUpdate,
		inspectionsGetAnalyticsGeofence,
		inspectionsGetAnalyticsQuality,
		inspectionsGetAnalyticsSync,
		inspectionsGetAnalyticsTime,
		inspectionsGetManageCleaners,
		inspectionsGetManageRooms,
		inspectionsCreateTask,
		inspectionsPatchTask,
		inspectionsDeleteTask,
		inspectionsGetTaskAiRating,
		inspectionsRunTaskAiRating,
		inspectionsCreate,
		inspectionsGetPending,
		syncBatchOperations,
		type AICostAnalyticsRow,
		type AdminClientServiceRequestRow,
		type AdminRoomRow,
		type AdminTaskRow,
		type AdminUserRow,
		type AdminEfficiencyRow,
		type CatalogOption,
		type CleanerFlowObject,
		type CleanerTaskRow,
		type ClientEasySetupUsage,
		type ClientFeedbackObject,
		type ClientFeedbackRow,
		type ClientServiceRequestRow,
		type ClientServiceRequestTask,
		type Company,
		type GeofenceAnalyticsRow,
		type ObjectStatusRow,
		type PendingInspectionRow,
		type QualityAnalyticsRow,
		type SyncAnalyticsRow,
		type SyncBatchOperation,
		type SyncBatchOperationResult,
		type SupervisorTimeAnalytics,
		type TaskAiRating,
		type TaskChecklist,
		type TaskChecklistItem,
		type UserRole,
		type RoomType
	} from '$lib/api';
	import {
		clearDoneOfflineOperations,
		enqueueOfflineOperation,
		listOfflineOperations,
		nextRetryTimestamp,
		shouldRetryOperation,
		updateOfflineOperation,
		type OfflineOperation
	} from '$lib/offline-queue';
	import {
		capturePhotoWithNativeCamera,
		dataUrlToFile,
		fileToDataUrl,
		isNativeRuntime,
		readCurrentPosition
	} from '$lib/native';
	import {
		assessCleaningPhotoBeforeSend,
		describePhotoQualityWarnings,
		formatPhotoQualityFailure,
		hasBlockingPhotoQualityIssues,
		type PhotoCheckStage
	} from '$lib/photo-quality';
	import { clearSession, initSession, session, type SessionState } from '$lib/session';

	let currentSession = $state<SessionState | null>(null);

	let loading = $state(false);
	let error = $state('');
	let success = $state('');

	let objectsStatus = $state<ObjectStatusRow[]>([]);
	let efficiency = $state<AdminEfficiencyRow[]>([]);
	let cleanerTasks = $state<CleanerTaskRow[]>([]);
	let cleanerTodayObjects = $state<CleanerFlowObject[]>([]);
	let inspectionsPending = $state<PendingInspectionRow[]>([]);
	let checklistsByTask = $state<Record<number, TaskChecklist>>({});
	let aiRatingsByTask = $state<Record<number, TaskAiRating>>({});
	let offlineOps = $state<OfflineOperation[]>([]);
	let syncingQueue = $state(false);

	let supervisorQualityAnalytics = $state<QualityAnalyticsRow[]>([]);
	let supervisorGeofenceAnalytics = $state<GeofenceAnalyticsRow[]>([]);
	let supervisorSyncAnalytics = $state<SyncAnalyticsRow[]>([]);
	let supervisorTimeAnalytics = $state<SupervisorTimeAnalytics | null>(null);
	let supervisorAnalyticsFilters = $state({
		date_from: '',
		date_to: ''
	});
	let cleanerPresenceSyncing = $state(false);

	let adminQualityAnalytics = $state<QualityAnalyticsRow[]>([]);
	let adminSyncAnalytics = $state<SyncAnalyticsRow[]>([]);
	let adminAICostAnalytics = $state<AICostAnalyticsRow[]>([]);
	let adminCompany = $state<Company | null>(null);

	let companyUsers = $state<AdminUserRow[]>([]);
	let companyRooms = $state<AdminRoomRow[]>([]);
	let adminTasks = $state<AdminTaskRow[]>([]);
	const CUSTOM_ROOM_TYPE_VALUE = '__custom__';
	const DEFAULT_ROOM_TYPE_OPTIONS: CatalogOption[] = [
		{ value: 'office', label: 'Office' },
		{ value: 'bathroom', label: 'Bathroom' },
		{ value: 'corridor', label: 'Corridor' },
		{ value: 'kitchen', label: 'Kitchen' },
		{ value: 'lobby', label: 'Lobby' },
		{ value: 'conference_room', label: 'Conference room' },
		{ value: 'stairwell', label: 'Stairwell' },
		{ value: 'elevator', label: 'Elevator' },
		{ value: 'storage', label: 'Storage room' },
		{ value: 'classroom', label: 'Classroom' }
	];
	let roomTypeOptions = $state<CatalogOption[]>([...DEFAULT_ROOM_TYPE_OPTIONS]);

	let companyForm = $state({
		name: ''
	});

	let wizardStep = $state(0);
	let wizardObjectId = $state('');
	let wizardRoomId = $state('');
	let wizardCleanerId = $state('');
	let wizardRoomType = $state<RoomType>('office');
	let wizardCustomRoomType = $state('');
	let wizardRoomArea = $state('');
	type WizardUsage = 'quiet' | 'normal' | 'busy';
	type WizardRecommendation = {
		level: number;
		standard: string;
		roomType: RoomType;
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
		type: 'office' as RoomType,
		customType: '',
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
		type: 'office' as RoomType,
		customType: '',
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
		date: ''
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
	let objectLocationSaving = $state(false);
	let objectLocationMessage = $state<{ kind: 'success' | 'error'; text: string } | null>(null);

	let clientFeedbackObjects = $state<ClientFeedbackObject[]>([]);
	let clientFeedbackRows = $state<ClientFeedbackRow[]>([]);
	let clientCompanies = $state<Company[]>([]);
	let clientCompanyId = $state('');
	const feedbackDrafts: Record<number, { rating: string; text: string }> = $state({});
	let clientServiceRequestRows = $state<ClientServiceRequestRow[]>([]);
	let adminClientServiceRequestRows = $state<AdminClientServiceRequestRow[]>([]);
	let clientAddressQuery = $state('');
	let clientAddressSuggestions = $state<ObjectAddressSuggestion[]>([]);
	let clientAddressSearching = $state(false);
	let clientAddressShowSuggestions = $state(false);
	let clientAddressDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let clientAddressSearchController = $state<AbortController | null>(null);
	let clientAddressSearchSequence = $state(0);
	let clientServiceRequestForm = $state({
		city: '',
		street: '',
		houseNumber: '',
		apartmentNumber: '',
		floor: '',
		isPrivateHouse: false,
		objectDescription: '',
		latitude: '',
		longitude: '',
		easySetupUsage: 'normal' as ClientEasySetupUsage,
		clientNote: ''
	});
	type ClientRequestTaskDraft = {
		roomType: RoomType;
		customRoomType: string;
		areaSqm: string;
		note: string;
	};
	let clientServiceRequestTasks = $state<ClientRequestTaskDraft[]>([
		{
			roomType: 'office',
			customRoomType: '',
			areaSqm: '',
			note: ''
		}
	]);
	const clientServiceRequestDecisionDrafts: Record<number, string> = $state({});

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

	function selectedClientCompanyName() {
		if (!clientCompanyId) return '';
		return clientCompanies.find((row) => String(row.id) === clientCompanyId)?.name || '';
	}

	function resetClientCompanyScopedData() {
		clientFeedbackRows = [];
		clientFeedbackObjects = [];
		clientServiceRequestRows = [];
		feedbackForm.objectId = '';
		for (const key in feedbackDrafts) delete feedbackDrafts[Number(key)];
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
		const seen: Record<string, true> = {};
		const append = (rows: ObjectAddressSuggestion[]) => {
			for (const row of rows) {
				const key = objectAddressSuggestionKey(row);
				if (seen[key]) continue;
				seen[key] = true;
				merged.push(row);
				if (merged.length >= OBJECT_ADDRESS_MAX_RESULTS) return;
			}
		};
		append(local);
		append(global);
		return merged;
	}

	function objectAddressSearchParams(q: string, limit: number, countrycodes?: string): string {
		const params: Record<string, string> = {
			format: 'jsonv2',
			q,
			limit: String(limit),
			addressdetails: '1',
			dedupe: '0'
		};
		if (countrycodes) params.countrycodes = countrycodes;
		return Object.entries(params)
			.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
			.join('&');
	}

	async function fetchObjectAddressSuggestions(
		params: string,
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
		const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
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

	function applyClientAddressSuggestion(item: ObjectAddressSuggestion) {
		const addr = item.address || {};
		const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
		const streetRaw =
			addr.road || addr.pedestrian || addr.footway || addr.neighbourhood || addr.suburb || '';
		const split = splitStreetAndHouse(streetRaw);
		const houseNumber = addr.house_number || split.houseNumber || '';

		if (city.trim()) clientServiceRequestForm.city = city.trim();
		if (split.street.trim()) clientServiceRequestForm.street = split.street.trim();
		else if (streetRaw.trim()) clientServiceRequestForm.street = streetRaw.trim();
		if (houseNumber.trim()) clientServiceRequestForm.houseNumber = houseNumber.trim();

		const lat = Number(item.lat);
		const lon = Number(item.lon);
		if (Number.isFinite(lat)) clientServiceRequestForm.latitude = lat.toFixed(6);
		if (Number.isFinite(lon)) clientServiceRequestForm.longitude = lon.toFixed(6);

		const parts = item.display_name
			.split(',')
			.map((part) => part.trim())
			.filter(Boolean);
		if (!clientServiceRequestForm.street && parts.length > 0) {
			const fallback = splitStreetAndHouse(parts[0]);
			clientServiceRequestForm.street = fallback.street || parts[0];
			if (!clientServiceRequestForm.houseNumber && fallback.houseNumber) {
				clientServiceRequestForm.houseNumber = fallback.houseNumber;
			}
		}
		if (!clientServiceRequestForm.city && parts.length > 1) {
			clientServiceRequestForm.city = parts[1];
		}
	}

	async function searchClientAddress(query: string) {
		const trimmed = query.trim();
		if (trimmed.length < 2) {
			clientAddressSuggestions = [];
			clientAddressShowSuggestions = false;
			clientAddressSearching = false;
			clientAddressSearchController?.abort();
			clientAddressSearchController = null;
			return;
		}
		clientAddressSearchController?.abort();
		const controller = new AbortController();
		clientAddressSearchController = controller;
		const currentSearch = ++clientAddressSearchSequence;
		clientAddressSearching = true;
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
			if (currentSearch !== clientAddressSearchSequence) return;
			const local = localResult.status === 'fulfilled' ? localResult.value : [];
			const global = globalResult.status === 'fulfilled' ? globalResult.value : [];
			clientAddressSuggestions = mergeObjectAddressSuggestions(local, global);
			clientAddressShowSuggestions = clientAddressSuggestions.length > 0;
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			if (currentSearch === clientAddressSearchSequence) {
				clientAddressSuggestions = [];
				clientAddressShowSuggestions = false;
			}
		} finally {
			if (currentSearch === clientAddressSearchSequence) clientAddressSearching = false;
			if (clientAddressSearchController === controller) clientAddressSearchController = null;
		}
	}

	function onClientAddressInput(value: string) {
		clientAddressQuery = value;
		if (clientAddressDebounceTimer) clearTimeout(clientAddressDebounceTimer);
		if (value.trim().length < 2) {
			clientAddressSearchController?.abort();
			clientAddressSearchController = null;
			clientAddressSearching = false;
			clientAddressSuggestions = [];
			clientAddressShowSuggestions = false;
			return;
		}
		clientAddressShowSuggestions = true;
		clientAddressDebounceTimer = setTimeout(() => searchClientAddress(value), 300);
	}

	function onSelectClientAddressSuggestion(item: ObjectAddressSuggestion) {
		clientAddressQuery = item.display_name;
		clientAddressShowSuggestions = false;
		clientAddressSuggestions = [];
		applyClientAddressSuggestion(item);
	}

	function onClientRequestLocationChange(lat: string, lng: string, address: string) {
		clientServiceRequestForm.latitude = lat;
		clientServiceRequestForm.longitude = lng;
		if (address.trim()) {
			clientAddressQuery = address.trim();
			const parts = address
				.split(',')
				.map((part) => part.trim())
				.filter(Boolean);
			if (!clientServiceRequestForm.street && parts.length > 0) {
				const split = splitStreetAndHouse(parts[0]);
				clientServiceRequestForm.street = split.street || parts[0];
				if (!clientServiceRequestForm.houseNumber && split.houseNumber) {
					clientServiceRequestForm.houseNumber = split.houseNumber;
				}
			}
			if (!clientServiceRequestForm.city && parts.length > 1) {
				clientServiceRequestForm.city = parts[1];
			}
		}
	}

	function composeObjectAddress() {
		const city = objectForm.city.trim();
		const street = objectForm.street.trim();
		const houseNumber = objectForm.houseNumber.trim();
		const apartmentNumber = objectForm.apartmentNumber.trim();
		const floor = objectForm.floor.trim();

		const parts = [city, [street, houseNumber].filter(Boolean).join(' ')].filter(Boolean);
		if (!objectForm.isPrivateHouse) {
			if (apartmentNumber)
				parts.push(`${m.app_admin_object_apartment_prefix()} ${apartmentNumber}`);
			if (floor) parts.push(`${m.app_admin_object_floor_prefix()} ${floor}`);
		}
		return parts.join(', ');
	}

	function composeClientServiceRequestAddress() {
		const city = clientServiceRequestForm.city.trim();
		const street = clientServiceRequestForm.street.trim();
		const houseNumber = clientServiceRequestForm.houseNumber.trim();
		const apartmentNumber = clientServiceRequestForm.apartmentNumber.trim();
		const floor = clientServiceRequestForm.floor.trim();
		const parts = [city, [street, houseNumber].filter(Boolean).join(' ')].filter(Boolean);
		if (!clientServiceRequestForm.isPrivateHouse) {
			if (apartmentNumber)
				parts.push(`${m.app_admin_object_apartment_prefix()} ${apartmentNumber}`);
			if (floor) parts.push(`${m.app_admin_object_floor_prefix()} ${floor}`);
		}
		return parts.join(', ');
	}

	function asPercent(value: number) {
		const safe = Number.isFinite(value) ? value : 0;
		const percent = safe <= 1 ? safe * 100 : safe;
		return `${Math.round(percent * 100) / 100}%`;
	}

	function formatElapsed(seconds: number | null | undefined) {
		const safe = Math.max(0, Math.floor(Number(seconds || 0)));
		const hours = Math.floor(safe / 3600);
		const minutes = Math.floor((safe % 3600) / 60);
		const secs = safe % 60;
		const hh = String(hours).padStart(2, '0');
		const mm = String(minutes).padStart(2, '0');
		const ss = String(secs).padStart(2, '0');
		return `${hh}:${mm}:${ss}`;
	}

	function supervisorAnalyticsInput() {
		const date_from = supervisorAnalyticsFilters.date_from.trim();
		const date_to = supervisorAnalyticsFilters.date_to.trim();
		return {
			date_from: date_from || undefined,
			date_to: date_to || undefined
		};
	}

	function supervisorTodayObjects() {
		return supervisorTimeAnalytics?.today_tracking?.objects || [];
	}

	function cleanerUnsyncedCount() {
		let count = 0;
		for (const row of offlineOps) {
			if (row.status !== 'done') count += 1;
		}
		return count;
	}

	function filteredCleanerTodayObjects() {
		const statusFilter = cleanerFilters.status.trim();
		if (!statusFilter) return cleanerTodayObjects;

		return cleanerTodayObjects
			.map((objectRow) => ({
				...objectRow,
				rooms: objectRow.rooms
					.map((roomRow) => ({
						...roomRow,
						tasks: roomRow.tasks.filter((taskRow) => taskRow.task.status === statusFilter)
					}))
					.filter((roomRow) => roomRow.tasks.length > 0)
			}))
			.filter((objectRow) => objectRow.rooms.length > 0);
	}

	function flattenCleanerTasksFromToday(objects: CleanerFlowObject[]): CleanerTaskRow[] {
		const rows: CleanerTaskRow[] = [];
		for (const objectRow of objects) {
			for (const roomRow of objectRow.rooms) {
				for (const taskRow of roomRow.tasks) {
					rows.push({
						task: taskRow.task,
						room: roomRow.room,
						object: {
							id: objectRow.object.id,
							company_id: objectRow.object.company_id,
							address: objectRow.object.address,
							description: objectRow.object.description,
							latitude: objectRow.object.latitude || null,
							longitude: objectRow.object.longitude || null,
							geofence_radius_meters: objectRow.object.geofence_radius_meters,
							cleaning_standard: objectRow.object.cleaning_standard
						}
					});
				}
			}
		}
		return rows;
	}

	function activeObjectIds() {
		return cleanerTodayObjects
			.filter((row) => row.active_session?.status === 'active')
			.map((row) => row.object.id);
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

	function findCleanerTask(taskId: number): CleanerTaskRow | undefined {
		return cleanerTasks.find((row) => row.task.id === taskId);
	}

	function taskHasAnyPhoto(taskId: number): boolean {
		const task = findCleanerTask(taskId)?.task;
		return Boolean(task?.photo_before || task?.photo_after);
	}

	function cleanerAiStatusLabel(status: TaskAiRating['ai_status'] | undefined): string {
		if (status === 'pending') return m.app_cleaner_ai_status_pending();
		if (status === 'succeeded') return m.app_cleaner_ai_status_succeeded();
		if (status === 'failed') return m.app_cleaner_ai_status_failed();
		return m.app_cleaner_ai_status_not_requested();
	}

	function checklistMessageKeyFromTitle(title: string): string {
		return `checklist_item_${title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '')}`;
	}

	function localizedChecklistTitle(title: string): string {
		const key = checklistMessageKeyFromTitle(title);
		const messageMap = m as unknown as Record<string, (() => string) | undefined>;
		const value = messageMap[key];
		if (typeof value === 'function') {
			return value();
		}
		return title;
	}

	function roomTypeSelectValue(type: string): string {
		const normalized = type.trim();
		if (!normalized) return 'office';
		return roomTypeOptions.some((option) => option.value === normalized)
			? normalized
			: CUSTOM_ROOM_TYPE_VALUE;
	}

	function resolveRoomTypeInput(selectedType: string, customType: string): string {
		if (selectedType === CUSTOM_ROOM_TYPE_VALUE) {
			return customType.trim();
		}
		return selectedType.trim();
	}

	function asTitle(value: string): string {
		return value
			.replace(/[_-]+/g, ' ')
			.split(' ')
			.filter(Boolean)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}

	function roomTypeLabel(type: string | null | undefined) {
		if (!type) return '';
		if (type === 'office') return m.room_type_office();
		if (type === 'bathroom') return m.room_type_bathroom();
		if (type === 'corridor') return m.room_type_corridor();
		if (type === 'kitchen') return m.room_type_kitchen();
		if (type === 'lobby') return m.room_type_lobby();
		if (type === 'conference_room') return m.room_type_conference_room();
		if (type === 'stairwell') return m.room_type_stairwell();
		if (type === 'elevator') return m.room_type_elevator();
		if (type === 'storage') return m.room_type_storage();
		if (type === 'classroom') return m.room_type_classroom();
		const fromCatalog = roomTypeOptions.find((option) => option.value === type);
		return fromCatalog?.label || asTitle(type);
	}

	function clientRequestStatusLabel(status: string) {
		if (status === 'pending') return m.app_client_request_status_pending();
		if (status === 'accepted') return m.app_client_request_status_accepted();
		if (status === 'rejected') return m.app_client_request_status_rejected();
		return status;
	}

	function clientRequestStatusChipClass(status: string) {
		if (status === 'accepted') return 'chip bg-green-100 text-green-700';
		if (status === 'rejected') return 'chip bg-red-100 text-red-700';
		return 'chip bg-amber-100 text-amber-700';
	}

	function newClientRequestTaskDraft(): ClientRequestTaskDraft {
		return {
			roomType: 'office',
			customRoomType: '',
			areaSqm: '',
			note: ''
		};
	}

	function addClientServiceRequestTask() {
		clientServiceRequestTasks.push(newClientRequestTaskDraft());
	}

	function removeClientServiceRequestTask(index: number) {
		if (clientServiceRequestTasks.length <= 1) return;
		clientServiceRequestTasks.splice(index, 1);
	}

	function resetClientServiceRequestForm() {
		clientServiceRequestForm = {
			city: '',
			street: '',
			houseNumber: '',
			apartmentNumber: '',
			floor: '',
			isPrivateHouse: false,
			objectDescription: '',
			latitude: '',
			longitude: '',
			easySetupUsage: 'normal',
			clientNote: ''
		};
		clientAddressQuery = '';
		clientAddressSuggestions = [];
		clientAddressShowSuggestions = false;
		clientServiceRequestTasks = [newClientRequestTaskDraft()];
	}

	function buildClientServiceRequestTasks(): ClientServiceRequestTask[] {
		const tasks: ClientServiceRequestTask[] = [];
		for (const task of clientServiceRequestTasks) {
			const roomType = resolveRoomTypeInput(task.roomType, task.customRoomType);
			const areaSqm = Number(task.areaSqm);
			if (!roomType || !Number.isInteger(areaSqm) || areaSqm <= 0) {
				throw new Error(m.app_error_client_request_invalid_task());
			}
			tasks.push({
				room_type: roomType,
				area_sqm: areaSqm,
				note: task.note.trim() || undefined
			});
		}
		if (!tasks.length) throw new Error(m.app_error_client_request_invalid_task());
		return tasks;
	}

	function ensureClientServiceRequestDecisionDrafts() {
		const pendingIds = new Set(
			adminClientServiceRequestRows.filter((row) => row.status === 'pending').map((row) => row.id)
		);
		for (const key in clientServiceRequestDecisionDrafts) {
			const id = Number(key);
			if (!pendingIds.has(id)) {
				delete clientServiceRequestDecisionDrafts[id];
			}
		}

		for (const row of adminClientServiceRequestRows) {
			if (row.status !== 'pending') continue;
			if (!(row.id in clientServiceRequestDecisionDrafts)) {
				clientServiceRequestDecisionDrafts[row.id] = '';
			}
		}
	}

	function syncObjectSettingsFromSelection() {
		const selectedObjectId = Number(objectSettingsForm.objectId);
		if (!Number.isInteger(selectedObjectId)) return;
		const selectedObject = objectsStatus.find((row) => row.objectId === selectedObjectId);
		if (!selectedObject) return;
		objectSettingsForm.latitude =
			selectedObject.latitude !== null ? selectedObject.latitude.toFixed(6) : '';
		objectSettingsForm.longitude =
			selectedObject.longitude !== null ? selectedObject.longitude.toFixed(6) : '';
		objectSettingsForm.geofenceRadiusMeters = String(selectedObject.geofence_radius_meters);
	}

	function onObjectSettingsObjectChange() {
		syncObjectSettingsFromSelection();
		objectLocationMessage = null;
	}

	function canSubmitObjectLocation() {
		if (!objectSettingsForm.objectId) return false;
		const latRaw = objectSettingsForm.latitude.trim();
		const lngRaw = objectSettingsForm.longitude.trim();
		const geofenceRaw = objectSettingsForm.geofenceRadiusMeters.trim();
		if (!latRaw || !lngRaw || !geofenceRaw) return false;
		const geofence = Number(geofenceRaw);
		return (
			Number.isFinite(Number(latRaw)) &&
			Number.isFinite(Number(lngRaw)) &&
			Number.isInteger(geofence) &&
			geofence >= 10
		);
	}

	function ensureTaskSelections() {
		const roomIds = new Set(companyRooms.map((row) => String(row.id)));
		const cleaners = companyUsers.filter((row) => row.role === 'cleaner');
		const cleanerIds = new Set(cleaners.map((row) => String(row.id)));

		if (taskForm.roomId && !roomIds.has(taskForm.roomId)) taskForm.roomId = '';
		if (!taskForm.roomId && companyRooms.length) taskForm.roomId = String(companyRooms[0].id);

		if (taskForm.cleanerId && !cleanerIds.has(taskForm.cleanerId)) taskForm.cleanerId = '';
		if (!taskForm.cleanerId && cleaners.length) taskForm.cleanerId = String(cleaners[0].id);

		if (taskEditForm.roomId && !roomIds.has(taskEditForm.roomId)) taskEditForm.roomId = '';
		if (taskEditForm.cleanerId && !cleanerIds.has(taskEditForm.cleanerId))
			taskEditForm.cleanerId = '';
	}

	function ensureAdminSelections() {
		const objectIds = new Set(objectsStatus.map((row) => String(row.objectId)));
		const roomIds = new Set(companyRooms.map((row) => String(row.id)));
		const userIds = new Set(companyUsers.map((row) => String(row.id)));
		const taskIds = new Set(adminTasks.map((row) => String(row.id)));
		const previousObjectId = objectSettingsForm.objectId;

		if (objectSettingsForm.objectId && !objectIds.has(objectSettingsForm.objectId)) {
			objectSettingsForm.objectId = '';
		}
		if (!objectSettingsForm.objectId && objectsStatus.length) {
			objectSettingsForm.objectId = String(objectsStatus[0].objectId);
		}

		if (roomForm.objectId && !objectIds.has(roomForm.objectId)) roomForm.objectId = '';
		ensureTaskSelections();

		if (wizardObjectId && !objectIds.has(wizardObjectId)) wizardObjectId = '';
		if (wizardRoomId && !roomIds.has(wizardRoomId)) wizardRoomId = '';
		const cleanerIds = new Set(
			companyUsers.filter((row) => row.role === 'cleaner').map((row) => String(row.id))
		);
		if (wizardCleanerId && !cleanerIds.has(wizardCleanerId)) wizardCleanerId = '';

		if (editingObjectId !== null && !objectIds.has(String(editingObjectId))) editingObjectId = null;
		if (editingRoomId !== null && !roomIds.has(String(editingRoomId))) editingRoomId = null;
		if (editingUserId !== null && !userIds.has(String(editingUserId))) editingUserId = null;
		if (editingTaskId !== null && !taskIds.has(String(editingTaskId))) editingTaskId = null;

		if (objectSettingsForm.objectId !== previousObjectId) {
			syncObjectSettingsFromSelection();
			objectLocationMessage = null;
		}

		ensureClientServiceRequestDecisionDrafts();
	}

	function syncRowsReadyForReplay(rows: OfflineOperation[]) {
		return rows.filter((row) => shouldRetryOperation(row));
	}

	async function loadRoomTypeOptions(token: string) {
		try {
			const payload = await adminGetRoomTypeCatalog(token);
			const next = payload.options
				.filter((option) => option.value.trim())
				.map((option) => ({
					value: option.value.trim(),
					label: option.label.trim() || asTitle(option.value.trim())
				}));
			roomTypeOptions = next.length ? next : [...DEFAULT_ROOM_TYPE_OPTIONS];
		} catch {
			roomTypeOptions = [...DEFAULT_ROOM_TYPE_OPTIONS];
		}
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
		const analyticsInput = supervisorAnalyticsInput();
		await loadRoomTypeOptions(token);
		const [
			companyPayload,
			efficiencyPayload,
			pendingPayload,
			objectsPayload,
			usersPayload,
			roomsPayload,
			tasksPayload,
			clientRequestsPayload
		] = await Promise.all([
			adminGetCompany(token),
			adminGetEfficiency(token),
			inspectionsGetPending(token),
			adminGetObjectsStatus(token),
			adminGetUsers(token),
			adminGetRooms(token),
			adminGetTasks(token),
			adminGetClientServiceRequests(token)
		]);
		adminCompany = companyPayload;
		companyForm.name = companyPayload.name;
		efficiency = efficiencyPayload;
		inspectionsPending = pendingPayload;
		objectsStatus = objectsPayload;
		companyUsers = usersPayload;
		companyRooms = roomsPayload;
		adminTasks = tasksPayload;
		adminClientServiceRequestRows = clientRequestsPayload;
		if (!inspectionForm.taskId && pendingPayload.length) {
			inspectionForm.taskId = String(pendingPayload[0].task.id);
		}
		ensureAdminSelections();

		const settled = await Promise.allSettled([
			adminGetAnalyticsQuality(token),
			adminGetAnalyticsSync(token),
			adminGetAnalyticsAICost(token),
			inspectionsGetAnalyticsQuality(token, analyticsInput),
			inspectionsGetAnalyticsGeofence(token, analyticsInput),
			inspectionsGetAnalyticsSync(token, analyticsInput),
			inspectionsGetAnalyticsTime(token, analyticsInput)
		]);
		if (settled[0].status === 'fulfilled') adminQualityAnalytics = settled[0].value;
		if (settled[1].status === 'fulfilled') adminSyncAnalytics = settled[1].value;
		if (settled[2].status === 'fulfilled') adminAICostAnalytics = settled[2].value;
		if (settled[3].status === 'fulfilled') supervisorQualityAnalytics = settled[3].value;
		if (settled[4].status === 'fulfilled') supervisorGeofenceAnalytics = settled[4].value;
		if (settled[5].status === 'fulfilled') supervisorSyncAnalytics = settled[5].value;
		if (settled[6].status === 'fulfilled') supervisorTimeAnalytics = settled[6].value;
	}

	async function loadCleanerData() {
		const token = tokenOrThrow();
		const today = await cleanerFlowGetToday(token, {
			date: cleanerFilters.date || undefined
		});
		cleanerTodayObjects = today.objects;
		cleanerTasks = flattenCleanerTasksFromToday(today.objects);
		await loadCleanerTaskDetails(token);
	}

	async function loadSupervisorData() {
		const token = tokenOrThrow();
		const analyticsInput = supervisorAnalyticsInput();
		inspectionsPending = await inspectionsGetPending(token);
		if (!inspectionForm.taskId && inspectionsPending.length) {
			inspectionForm.taskId = String(inspectionsPending[0].task.id);
		}
		const lookupsSettled = await Promise.allSettled([
			inspectionsGetManageRooms(token),
			inspectionsGetManageCleaners(token)
		]);
		if (lookupsSettled[0].status === 'fulfilled') companyRooms = lookupsSettled[0].value;
		if (lookupsSettled[1].status === 'fulfilled') companyUsers = lookupsSettled[1].value;
		ensureTaskSelections();
		const settled = await Promise.allSettled([
			inspectionsGetAnalyticsQuality(token, analyticsInput),
			inspectionsGetAnalyticsGeofence(token, analyticsInput),
			inspectionsGetAnalyticsSync(token, analyticsInput),
			inspectionsGetAnalyticsTime(token, analyticsInput)
		]);
		if (settled[0].status === 'fulfilled') supervisorQualityAnalytics = settled[0].value;
		if (settled[1].status === 'fulfilled') supervisorGeofenceAnalytics = settled[1].value;
		if (settled[2].status === 'fulfilled') supervisorSyncAnalytics = settled[2].value;
		if (settled[3].status === 'fulfilled') supervisorTimeAnalytics = settled[3].value;
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
		const selectedCompanyId = Number(clientCompanyId);
		if (!Number.isInteger(selectedCompanyId)) {
			resetClientCompanyScopedData();
			return;
		}

		let feedbackRows: ClientFeedbackRow[] = [];
		let feedbackObjects: ClientFeedbackObject[] = [];
		let serviceRequests: ClientServiceRequestRow[] = [];
		try {
			[feedbackRows, feedbackObjects, serviceRequests] = await Promise.all([
				feedbackGetMy(token, { company_id: selectedCompanyId }),
				feedbackGetObjects(token, selectedCompanyId),
				clientServiceRequestsGetMy(token, { company_id: selectedCompanyId })
			]);
		} catch (err) {
			const message = err instanceof Error ? err.message : '';
			if (/company not found/i.test(message)) {
				clientCompanyId = '';
				resetClientCompanyScopedData();
				return;
			}
			throw err;
		}
		clientFeedbackRows = feedbackRows;
		clientFeedbackObjects = feedbackObjects;
		clientServiceRequestRows = serviceRequests;
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

	async function loadClientCompanies() {
		clientCompanies = (await authGetCompanies()).filter(
			(row) => !/\bmock\b/i.test(row.name) && !/\bdev\s*test\s*co\b/i.test(row.name)
		);
		if (clientCompanyId && !clientCompanies.some((row) => String(row.id) === clientCompanyId)) {
			clientCompanyId = '';
		}
		const preferredCompanyId = currentSession?.company?.id;
		if (!clientCompanyId && preferredCompanyId !== undefined && preferredCompanyId !== null) {
			const preferredId = String(preferredCompanyId);
			if (clientCompanies.some((row) => String(row.id) === preferredId)) {
				clientCompanyId = preferredId;
			}
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
			await loadClientCompanies();
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
			const resolvedType = resolveRoomTypeInput(roomForm.type, roomForm.customType);
			if (!resolvedType) throw new Error(m.app_error_generic());
			await adminCreateRoom(tokenOrThrow(), {
				object_id: Number(roomForm.objectId),
				type: resolvedType,
				area_sqm: Number(roomForm.areaSqm)
			});
			roomForm = { objectId: '', type: 'office', customType: '', areaSqm: '' };
			await reloadAdminCrudData(tokenOrThrow());
			success = m.app_success_room_created();
		});
	}

	async function onCreateTask(event: SubmitEvent) {
		event.preventDefault();
		await withAction(async () => {
			const token = tokenOrThrow();
			const payload = {
				room_id: Number(taskForm.roomId),
				cleaner_id: Number(taskForm.cleanerId)
			};
			if (currentSession?.user.role === 'supervisor') {
				await inspectionsCreateTask(token, payload);
				await loadSupervisorData();
			} else {
				await adminCreateTask(token, payload);
				await reloadAdminCrudData(token);
			}
			taskForm = { roomId: '', cleanerId: '' };
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
		const selectedType = roomTypeSelectValue(room.type);
		editingRoomId = room.id;
		roomEditForm = {
			objectId: String(room.object_id),
			type: selectedType,
			customType: selectedType === CUSTOM_ROOM_TYPE_VALUE ? room.type : '',
			areaSqm: String(room.area_sqm)
		};
	}

	function cancelRoomEdit() {
		editingRoomId = null;
		roomEditForm = { objectId: '', type: 'office', customType: '', areaSqm: '' };
	}

	async function onSaveRoomEdit(roomId: number) {
		await withAction(async () => {
			if (!roomEditForm.objectId || !roomEditForm.areaSqm) {
				throw new Error(m.app_error_generic());
			}
			const resolvedType = resolveRoomTypeInput(roomEditForm.type, roomEditForm.customType);
			if (!resolvedType) throw new Error(m.app_error_generic());
			await adminPatchRoom(tokenOrThrow(), roomId, {
				object_id: Number(roomEditForm.objectId),
				type: resolvedType,
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

	function startTodayTrackingTaskEdit(
		objectId: number,
		objectAddress: string,
		task: {
			task_id: number;
			status: 'pending' | 'in_progress' | 'completed';
			timestamp_start: string | null;
			timestamp_end: string | null;
			room_id: number;
			room_type: RoomType;
			room_area_sqm: number;
			cleaner_id: number;
			cleaner_name: string;
			cleaner_email: string;
		}
	) {
		startTaskEdit({
			id: task.task_id,
			room_id: task.room_id,
			cleaner_id: task.cleaner_id,
			status: task.status,
			timestamp_start: task.timestamp_start,
			timestamp_end: task.timestamp_end,
			room_type: task.room_type,
			room_area_sqm: task.room_area_sqm,
			object_id: objectId,
			object_address: objectAddress,
			cleaner_name: task.cleaner_name,
			cleaner_email: task.cleaner_email
		});
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
			const token = tokenOrThrow();
			const payload = {
				room_id: Number(taskEditForm.roomId),
				cleaner_id: Number(taskEditForm.cleanerId),
				status: taskEditForm.status
			};
			if (currentSession?.user.role === 'supervisor') {
				await inspectionsPatchTask(token, taskId, payload);
				await loadSupervisorData();
			} else {
				await adminPatchTask(token, taskId, payload);
				await reloadAdminCrudData(token);
			}
			cancelTaskEdit();
			success = m.app_success_task_updated();
		});
	}

	async function onDeleteTask(taskId: number) {
		if (!confirm(m.app_confirm_delete_task())) return;
		await withAction(async () => {
			const token = tokenOrThrow();
			if (currentSession?.user.role === 'supervisor') {
				await inspectionsDeleteTask(token, taskId);
				await loadSupervisorData();
			} else {
				await adminDeleteTask(token, taskId);
				await reloadAdminCrudData(token);
			}
			cancelTaskEdit();
			success = m.app_success_task_deleted();
		});
	}

	function wizardSelectedRoom(): AdminRoomRow | null {
		if (!wizardRoomId) return null;
		return companyRooms.find((room) => String(room.id) === wizardRoomId) ?? null;
	}

	function wizardEffectiveRoomType(): RoomType {
		const selectedRoomType = wizardSelectedRoom()?.type;
		if (selectedRoomType) return selectedRoomType;
		return resolveRoomTypeInput(wizardRoomType, wizardCustomRoomType) || 'office';
	}

	function wizardBaseLevelForRoom(roomType: RoomType): number {
		if (roomType === 'bathroom') return 2;
		if (roomType === 'corridor') return 4;
		if (roomType === 'lobby' || roomType === 'stairwell' || roomType === 'elevator') return 4;
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

	function wizardRoomReason(roomType: RoomType): string {
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
		wizardCustomRoomType = '';
		wizardUsage = 'normal';
		wizardApplyRecommendedStandard = true;
	}

	function onWizardRoomChange() {
		wizardCleanerId = '';
		wizardUsage = 'normal';
		wizardApplyRecommendedStandard = true;
		if (wizardRoomId) wizardCustomRoomType = '';
	}

	async function onWizardCreateRoom(event: SubmitEvent) {
		event.preventDefault();
		if (!wizardObjectId || !wizardRoomArea) return;
		await withAction(async () => {
			const resolvedType = resolveRoomTypeInput(wizardRoomType, wizardCustomRoomType);
			if (!resolvedType) throw new Error(m.app_error_generic());
			const created = await adminCreateRoom(tokenOrThrow(), {
				object_id: Number(wizardObjectId),
				type: resolvedType,
				area_sqm: Number(wizardRoomArea)
			});
			await reloadAdminCrudData(tokenOrThrow());
			wizardRoomId = String(created.id);
			wizardRoomArea = '';
			wizardCustomRoomType = '';
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
		wizardCustomRoomType = '';
		wizardRoomArea = '';
		wizardUsage = 'normal';
		wizardApplyRecommendedStandard = true;
	}

	async function reloadAdminCrudData(token: string) {
		await loadRoomTypeOptions(token);
		const [objectsPayload, usersPayload, roomsPayload, tasksPayload, clientRequestsPayload] =
			await Promise.all([
				adminGetObjectsStatus(token),
				adminGetUsers(token),
				adminGetRooms(token),
				adminGetTasks(token),
				adminGetClientServiceRequests(token)
			]);
		objectsStatus = objectsPayload;
		companyUsers = usersPayload;
		companyRooms = roomsPayload;
		adminTasks = tasksPayload;
		adminClientServiceRequestRows = clientRequestsPayload;
		ensureAdminSelections();
	}

	async function onLoadCompany() {
		await withAction(async () => {
			adminCompany = await adminGetCompany(tokenOrThrow());
			companyForm.name = adminCompany.name;
			success = m.app_success_company_loaded();
		});
	}

	async function onUpdateCompany(event: SubmitEvent) {
		event.preventDefault();
		await withAction(async () => {
			const name = companyForm.name.trim();
			if (!name) throw new Error(m.app_error_generic());
			adminCompany = await adminPatchCompany(tokenOrThrow(), name);
			companyForm.name = adminCompany.name;
			success = m.app_success_company_updated();
		});
	}

	async function onDeleteCompany() {
		if (!confirm(`${m.app_admin_company_delete()}?`)) return;
		await withAction(async () => {
			await adminDeleteCompany(tokenOrThrow());
			await onLogout();
		});
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
			await loadRoomTypeOptions(tokenOrThrow());
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
			await loadCleanerData();
			success = m.app_success_cleaner_tasks_loaded();
		});
	}

	async function onApplyCleanerFilters(event: SubmitEvent) {
		event.preventDefault();
		await onLoadCleanerTasks();
	}

	async function onResetCleanerFilters() {
		cleanerFilters = {
			status: '',
			date: ''
		};
		await onLoadCleanerTasks();
	}

	async function onCheckInObject(objectId: number) {
		await withAction(async () => {
			const coords = await readCurrentPosition();
			await cleanerFlowCheckInObject(tokenOrThrow(), objectId, {
				latitude: coords.latitude,
				longitude: coords.longitude
			});
			await loadCleanerData();
			success = m.app_success_checked_in_object({ id: String(objectId) });
		});
	}

	async function onCheckOutObject(objectId: number) {
		await withAction(async () => {
			let coords:
				| {
						latitude?: number;
						longitude?: number;
				  }
				| undefined;
			try {
				const position = await readCurrentPosition();
				coords = { latitude: position.latitude, longitude: position.longitude };
			} catch {
				coords = undefined;
			}
			await cleanerFlowCheckOutObject(tokenOrThrow(), objectId, coords);
			await loadCleanerData();
			success = m.app_success_checked_out_object({ id: String(objectId) });
		});
	}

	async function syncCleanerPresenceInBackground() {
		if (cleanerPresenceSyncing) return;
		const token = currentSession?.token;
		if (!token) return;
		const activeIds = activeObjectIds();
		if (!activeIds.length) return;
		cleanerPresenceSyncing = true;
		try {
			const coords = await readCurrentPosition();
			for (const objectId of activeIds) {
				try {
					const update = await cleanerFlowUpdateObjectPresence(token, objectId, {
						latitude: coords.latitude,
						longitude: coords.longitude
					});
					const target = cleanerTodayObjects.find((row) => row.object.id === objectId);
					if (target?.active_session) {
						target.active_session.current_inside_geofence = update.inside_geofence;
						target.active_session.last_distance_meters = String(update.distance_meters);
						target.active_session.last_presence_at = new Date().toISOString();
						target.active_session.timing = update.timing;
					}
				} catch {
					// continue with other active sessions
				}
			}
			const today = await cleanerFlowGetToday(token, {
				date: cleanerFilters.date || undefined
			});
			cleanerTodayObjects = today.objects;
			cleanerTasks = flattenCleanerTasksFromToday(today.objects);
		} catch {
			// ignore background presence sync failures
		} finally {
			cleanerPresenceSyncing = false;
		}
	}

	type CleanerOperationResult = 'applied' | 'queued_offline' | 'queued_connectivity';

	async function queueOrRunCleanerOperation(input: {
		taskId: number;
		type: 'start_task' | 'complete_task';
		photo?: File | null;
	}): Promise<CleanerOperationResult> {
		let photo = input.photo || null;
		const taskHasPhoto = taskHasAnyPhoto(input.taskId);
		if (!photo && isNativeRuntime() && input.type === 'complete_task' && !taskHasPhoto) {
			try {
				photo = await capturePhotoWithNativeCamera('photo_after');
				afterFiles[input.taskId] = photo;
			} catch (err) {
				const message = err instanceof Error ? err.message : '';
				if (/camera capture canceled/i.test(message)) {
					throw new Error(m.app_error_task_action_photo_any_required());
				}
				if (/camera permission denied/i.test(message)) {
					throw new Error('Camera permission denied. Enable camera access in iOS settings.');
				}
				throw err;
			}
		}

		if (input.type === 'complete_task' && !photo && !taskHasPhoto) {
			throw new Error(m.app_error_task_action_photo_any_required());
		}

		const client_operation_id = crypto.randomUUID();
		let coords = taskCoords[input.taskId] || {};
		if (typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
			const liveCoords = await readCurrentPosition();
			taskCoords[input.taskId] = liveCoords;
			coords = liveCoords;
		}
		const payload: Record<string, unknown> = {
			latitude: coords.latitude,
			longitude: coords.longitude
		};

		if (photo) {
			const stage: PhotoCheckStage = input.type === 'start_task' ? 'before' : 'after';
			const quality = await assessCleaningPhotoBeforeSend(photo, stage);
			if (hasBlockingPhotoQualityIssues(quality)) {
				throw new Error(formatPhotoQualityFailure(quality, stage));
			}
			payload.photo_quality = {
				analyzer: quality.analyzer,
				issues: quality.issues,
				metrics: quality.metrics
			};
			const warningSummary = describePhotoQualityWarnings(quality);
			if (warningSummary) {
				payload.photo_quality_warning = warningSummary;
			}
			payload.photo_data_url = await fileToDataUrl(photo);
			payload.photo_name = photo.name;
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
			return 'queued_offline';
		}

		try {
			if (input.type === 'start_task') {
				await cleanerStartTask(tokenOrThrow(), input.taskId, {
					photoBefore: photo || undefined,
					latitude: typeof coords.latitude === 'number' ? coords.latitude : undefined,
					longitude: typeof coords.longitude === 'number' ? coords.longitude : undefined,
					client_operation_id
				});
			} else {
				await cleanerCompleteTask(tokenOrThrow(), input.taskId, {
					photoAfter: photo || undefined,
					latitude: typeof coords.latitude === 'number' ? coords.latitude : undefined,
					longitude: typeof coords.longitude === 'number' ? coords.longitude : undefined,
					client_operation_id
				});
			}
			return 'applied';
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
			return 'queued_connectivity';
		}
	}

	async function onStartCleanerTask(taskId: number) {
		await withAction(async () => {
			await queueOrRunCleanerOperation({
				taskId,
				type: 'start_task',
				photo: beforeFiles[taskId]
			});
			await loadCleanerData();
			success = m.app_success_task_started();
		});
	}

	async function onCompleteCleanerTask(taskId: number) {
		await withAction(async () => {
			const outcome = await queueOrRunCleanerOperation({
				taskId,
				type: 'complete_task',
				photo: afterFiles[taskId]
			});
			await loadCleanerData();
			if (outcome === 'applied') {
				aiRatingsByTask[taskId] = { task_id: taskId, ai_status: 'pending' };
				void requestCleanerTaskAiRating(taskId, false).catch(() => {
					// keep completion successful even if ai rating call fails
				});
			}
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
			const quality = await assessCleaningPhotoBeforeSend(file, 'checklist');
			if (hasBlockingPhotoQualityIssues(quality)) {
				throw new Error(formatPhotoQualityFailure(quality, 'checklist'));
			}
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

	async function requestCleanerTaskAiRating(taskId: number, showToast = true) {
		const token = tokenOrThrow();
		const next = await cleanerRunTaskAiRating(token, taskId);
		aiRatingsByTask[taskId] = next;
		if (showToast) {
			success = m.app_success_ai_rating_requested();
		}
	}

	async function onRunCleanerTaskAiRating(taskId: number) {
		await withAction(async () => {
			await requestCleanerTaskAiRating(taskId);
		});
	}

	async function onRunSupervisorTaskAiRating(taskId: number) {
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
		if (
			operation.operation_type === 'complete_task' &&
			!file &&
			!taskHasAnyPhoto(operation.task_id)
		) {
			throw new Error(m.app_error_queue_complete_photo_any_missing());
		}
		if (file) {
			const stage: PhotoCheckStage = operation.operation_type === 'start_task' ? 'before' : 'after';
			const quality = await assessCleaningPhotoBeforeSend(file, stage);
			if (hasBlockingPhotoQualityIssues(quality)) {
				throw new Error(formatPhotoQualityFailure(quality, stage));
			}
		}
		if (operation.operation_type === 'start_task') {
			await cleanerStartTask(tokenOrThrow(), operation.task_id, {
				photoBefore: file || undefined,
				latitude: typeof payload.latitude === 'number' ? (payload.latitude as number) : undefined,
				longitude:
					typeof payload.longitude === 'number' ? (payload.longitude as number) : undefined,
				client_operation_id: operation.client_operation_id
			});
			return;
		}
		await cleanerCompleteTask(tokenOrThrow(), operation.task_id, {
			photoAfter: file || undefined,
			latitude: typeof payload.latitude === 'number' ? (payload.latitude as number) : undefined,
			longitude: typeof payload.longitude === 'number' ? (payload.longitude as number) : undefined,
			client_operation_id: operation.client_operation_id
		});
	}

	async function syncOfflineQueueInBackground() {
		if (syncingQueue) return;
		syncingQueue = true;
		try {
			const rows = syncRowsReadyForReplay(await listOfflineOperations());
			if (rows.length === 0) return;

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

			try {
				const batch = await syncBatchOperations(tokenOrThrow(), operations);
				batchResults = batch.results || [];
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : '';
				if (!/404|not found|sync\/operations\/batch/i.test(message)) {
					throw err;
				}
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
		} catch {
			// keep background sync silent and retry on next cycle.
		} finally {
			syncingQueue = false;
		}
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

	async function onLoadAdminClientServiceRequests() {
		await withAction(async () => {
			adminClientServiceRequestRows = await adminGetClientServiceRequests(tokenOrThrow());
			ensureClientServiceRequestDecisionDrafts();
			success = m.app_success_admin_client_requests_loaded();
		});
	}

	async function onAcceptAdminClientServiceRequest(requestId: number) {
		await withAction(async () => {
			const result = await adminAcceptClientServiceRequest(tokenOrThrow(), requestId, {
				decision_note: clientServiceRequestDecisionDrafts[requestId]?.trim() || undefined
			});
			await reloadAdminCrudData(tokenOrThrow());
			success = m.app_success_admin_client_request_accepted({
				id: String(requestId),
				tasks: String(result.created_tasks)
			});
		});
	}

	async function onCreateClientServiceRequest(event: SubmitEvent) {
		event.preventDefault();
		await withAction(async () => {
			const companyId = Number(clientCompanyId);
			if (!Number.isInteger(companyId)) throw new Error(m.register_company_required());

			const objectAddress = composeClientServiceRequestAddress();
			if (!objectAddress) throw new Error(m.app_error_client_request_address_required());

			const tasks = buildClientServiceRequestTasks();
			const latitudeRaw = clientServiceRequestForm.latitude.trim();
			const longitudeRaw = clientServiceRequestForm.longitude.trim();

			let latitude: number | undefined;
			let longitude: number | undefined;
			if (latitudeRaw || longitudeRaw) {
				const latParsed = Number(latitudeRaw);
				const lngParsed = Number(longitudeRaw);
				if (!Number.isFinite(latParsed) || !Number.isFinite(lngParsed)) {
					throw new Error(m.app_error_client_request_invalid_gps());
				}
				latitude = latParsed;
				longitude = lngParsed;
			}

			await clientServiceRequestsCreate(tokenOrThrow(), {
				company_id: companyId,
				object_address: objectAddress,
				object_description: clientServiceRequestForm.objectDescription.trim() || undefined,
				latitude,
				longitude,
				location_accuracy_meters: 100,
				easy_setup_usage: clientServiceRequestForm.easySetupUsage,
				tasks,
				client_note: clientServiceRequestForm.clientNote.trim() || undefined
			});
			resetClientServiceRequestForm();
			await loadClientData();
			success = m.app_success_client_request_created();
		});
	}

	async function onLoadClientFeedback() {
		await withAction(async () => {
			await loadClientCompanies();
			await loadClientData();
			success = m.app_success_client_requests_loaded();
		});
	}

	function onClientCompanyChange() {
		void withAction(async () => {
			await loadClientData();
		});
	}

	async function onCreateClientFeedback(event: SubmitEvent) {
		event.preventDefault();
		await withAction(async () => {
			const companyId = Number(clientCompanyId);
			if (!Number.isInteger(companyId)) throw new Error(m.register_company_required());

			await feedbackCreate(tokenOrThrow(), {
				company_id: companyId,
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
		objectLocationMessage = null;
		objectLocationSaving = true;
		try {
			const objectId = Number(objectSettingsForm.objectId);
			const latitude = Number(objectSettingsForm.latitude.trim());
			const longitude = Number(objectSettingsForm.longitude.trim());
			const geofenceRadius = Number(objectSettingsForm.geofenceRadiusMeters.trim());
			if (
				!Number.isInteger(objectId) ||
				!Number.isFinite(latitude) ||
				!Number.isFinite(longitude) ||
				!Number.isInteger(geofenceRadius) ||
				geofenceRadius < 10
			) {
				throw new Error(m.app_error_generic());
			}

			const updated = await adminPatchObjectLocation(tokenOrThrow(), objectId, {
				latitude,
				longitude,
				geofence_radius_meters: geofenceRadius
			});

			objectsStatus = objectsStatus.map((row) =>
				row.objectId === objectId
					? {
							...row,
							latitude: updated.latitude,
							longitude: updated.longitude,
							geofence_radius_meters: updated.geofence_radius_meters
						}
					: row
			);

			objectSettingsForm.latitude = updated.latitude.toFixed(6);
			objectSettingsForm.longitude = updated.longitude.toFixed(6);
			objectSettingsForm.geofenceRadiusMeters = String(updated.geofence_radius_meters);

			const message = m.app_success_object_location_updated();
			success = message;
			error = '';
			objectLocationMessage = { kind: 'success', text: message };
		} catch (err) {
			const message = err instanceof Error ? err.message : m.app_error_generic();
			error = message;
			success = '';
			objectLocationMessage = { kind: 'error', text: message };
		} finally {
			objectLocationSaving = false;
		}
	}

	async function onRefreshAnalytics() {
		await withAction(async () => {
			const token = tokenOrThrow();
			const analyticsInput = supervisorAnalyticsInput();
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
					inspectionsGetAnalyticsQuality(token, analyticsInput).then(
						(rows) => (supervisorQualityAnalytics = rows)
					),
					inspectionsGetAnalyticsGeofence(token, analyticsInput).then(
						(rows) => (supervisorGeofenceAnalytics = rows)
					),
					inspectionsGetAnalyticsSync(token, analyticsInput).then(
						(rows) => (supervisorSyncAnalytics = rows)
					),
					inspectionsGetAnalyticsTime(token, analyticsInput).then(
						(rows) => (supervisorTimeAnalytics = rows)
					)
				);
			}
			await Promise.allSettled(tasks);
			success = m.app_success_analytics_refreshed();
		});
	}

	async function onApplySupervisorAnalyticsFilters(event: SubmitEvent) {
		event.preventDefault();
		await onRefreshAnalytics();
	}

	async function onResetSupervisorAnalyticsFilters() {
		supervisorAnalyticsFilters = {
			date_from: '',
			date_to: ''
		};
		await onRefreshAnalytics();
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
		});

		onlineListener = () => {
			if (currentSession?.user.role === 'cleaner') {
				void syncOfflineQueueInBackground();
				void syncCleanerPresenceInBackground();
			}
		};
		window.addEventListener('online', onlineListener);

		visibilityListener = () => {
			if (document.visibilityState === 'visible' && currentSession?.user.role === 'cleaner') {
				void syncOfflineQueueInBackground();
				void syncCleanerPresenceInBackground();
			}
		};
		document.addEventListener('visibilitychange', visibilityListener);

		syncInterval = setInterval(() => {
			if (currentSession?.user.role === 'cleaner') {
				void syncOfflineQueueInBackground();
				void syncCleanerPresenceInBackground();
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
		if (clientAddressDebounceTimer) clearTimeout(clientAddressDebounceTimer);
		clientAddressSearchController?.abort();
		clientAddressSearchController = null;
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
						{m.app_session_company({
							name: currentSession.company?.name || selectedClientCompanyName() || m.app_value_na()
						})}
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
				<section id="admin-company" class={ui.panel}>
					<h2 class={ui.sectionTitle}>
						<AppIcon name="building" class="h-5 w-5 text-[var(--brand)]" />
						{m.app_admin_company_title()}
					</h2>
					<div class="mt-3 flex flex-wrap gap-2">
						<button
							type="button"
							disabled={loading}
							onclick={onLoadCompany}
							class={ui.secondaryButton}
						>
							<AppIcon name="refresh" class="h-4 w-4" />
							{m.app_admin_company_load()}
						</button>
						<button
							type="button"
							disabled={loading}
							onclick={onDeleteCompany}
							class={ui.dangerButton}
						>
							<AppIcon name="trash" class="h-4 w-4" />
							{m.app_admin_company_delete()}
						</button>
					</div>
					<form class="mt-4 grid gap-3 md:grid-cols-3" onsubmit={onUpdateCompany}>
						<label class={`${ui.label} md:col-span-2`}>
							<span class="label-title">
								<AppIcon name="building" class="h-4 w-4" />
								{m.app_admin_company_name_label()}
							</span>
							<input required bind:value={companyForm.name} type="text" class={ui.input} />
						</label>
						<div class="md:self-end">
							<button
								type="submit"
								disabled={loading || !companyForm.name.trim()}
								class={ui.primaryButton}
							>
								<AppIcon name="check-circle" class="h-4 w-4" />
								{m.app_admin_company_update()}
							</button>
						</div>
					</form>
					{#if adminCompany}
						<p class="mt-2 text-xs text-[var(--text-soft)]">
							#{adminCompany.id} · {adminCompany.created_at || m.app_value_na()}
						</p>
					{/if}
				</section>

				<section id="admin-users" class={ui.panel}>
					<h2 class={ui.sectionTitle}>
						<AppIcon name="users" class="h-5 w-5 text-[var(--brand)]" />
						{m.app_admin_users_title()}
					</h2>
					<div class="mt-3">
						<button
							type="button"
							disabled={loading}
							onclick={onLoadUsers}
							class={ui.secondaryButton}
						>
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
												<input
													bind:value={userEditForm.name}
													class={ui.input}
													type="text"
													required
												/>
											</label>
											<label class={ui.label}>
												<span>{m.app_email_label()}</span>
												<input
													bind:value={userEditForm.email}
													class={ui.input}
													type="email"
													required
												/>
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
												<input
													bind:value={userEditForm.password}
													class={ui.input}
													type="password"
												/>
											</label>
										</div>
										<div class="mt-3 flex flex-wrap gap-2">
											<button
												type="button"
												class={ui.primaryButton}
												onclick={() => onSaveUserEdit(user.id)}
											>
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
											<button
												type="button"
												class={ui.secondaryButton}
												onclick={() => startUserEdit(user)}
											>
												<AppIcon name="checklist" class="h-4 w-4" />
												{m.app_edit()}
											</button>
											<button
												type="button"
												class={ui.dangerButton}
												onclick={() => onDeleteUser(user.id)}
											>
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

				<section id="admin-client-requests" class={ui.panel}>
					<h2 class={ui.sectionTitle}>
						<AppIcon name="clipboard" class="h-5 w-5 text-[var(--brand)]" />
						{m.app_admin_client_requests_title()}
					</h2>
					<p class="mt-2 text-sm text-[var(--text-soft)]">{m.app_admin_client_requests_body()}</p>
					<div class="mt-3">
						<button
							type="button"
							disabled={loading}
							onclick={onLoadAdminClientServiceRequests}
							class={ui.secondaryButton}
						>
							<AppIcon name="refresh" class="h-4 w-4" />
							{m.app_admin_client_requests_fetch()}
						</button>
					</div>
					{#if adminClientServiceRequestRows.length === 0}
						<p class="mt-4 text-[var(--text-soft)]">{m.app_empty_admin_client_requests()}</p>
					{:else}
						<div class="mt-4 grid gap-3">
							{#each adminClientServiceRequestRows as row (row.id)}
								<article class="surface-soft p-4">
									<div class="flex flex-wrap items-start justify-between gap-2">
										<div>
											<p class="font-semibold">
												#{row.id} · {row.object_address}
											</p>
											<p class="text-sm text-[var(--text-soft)]">
												{row.client.name} ({row.client.email})
											</p>
										</div>
										<span class={clientRequestStatusChipClass(row.status)}>
											{clientRequestStatusLabel(row.status)}
										</span>
									</div>
									{#if row.object_description}
										<p class="mt-2 text-sm text-[var(--text-soft)]">{row.object_description}</p>
									{/if}
									{#if row.latitude !== null && row.longitude !== null}
										<p class="mt-2 text-xs text-[var(--text-soft)]">
											{m.app_client_request_gps_label()}: {row.latitude.toFixed(6)},
											{row.longitude.toFixed(6)}
											{#if row.location_accuracy_meters !== null}
												· {m.app_client_request_accuracy_label()}: ±
												{Math.round(row.location_accuracy_meters)}m
											{/if}
										</p>
									{/if}
									<p class="mt-2 text-xs text-[var(--text-soft)]">
										{m.app_client_request_radius_label()}: {row.geofence_radius_meters}m
									</p>
									<div class="mt-3 space-y-2">
										{#each row.requested_tasks as task, index (index)}
											<div
												class="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
											>
												<p class="text-sm font-semibold">
													{roomTypeLabel(task.room_type)} · {task.area_sqm} sqm
												</p>
												{#if task.note}
													<p class="text-xs text-[var(--text-soft)]">{task.note}</p>
												{/if}
											</div>
										{/each}
									</div>
									{#if row.client_note}
										<p class="mt-2 text-sm text-[var(--text-soft)]">
											{m.app_client_request_note_label()}: {row.client_note}
										</p>
									{/if}
									<p class="mt-2 text-sm text-[var(--text-soft)]">
										{m.app_admin_wizard_recommended_level_label()}
										{cleaningStandardLabel(row.recommended_cleaning_standard)}
									</p>

									{#if row.status === 'pending'}
										<div class="mt-3 grid gap-2 md:grid-cols-2">
											<label class={ui.label}>
												<span>{m.app_admin_client_requests_decision_note_label()}</span>
												<input
													type="text"
													class={ui.input}
													bind:value={clientServiceRequestDecisionDrafts[row.id]}
												/>
											</label>
											<p class="text-sm text-[var(--text-soft)] md:self-end">
												{m.app_admin_client_requests_body()}
											</p>
										</div>
										<div class="mt-3">
											<button
												type="button"
												class={ui.primaryButton}
												disabled={loading ||
													!companyUsers.some((u) => u.role === 'supervisor') ||
													!companyUsers.some((u) => u.role === 'cleaner')}
												onclick={() => onAcceptAdminClientServiceRequest(row.id)}
											>
												<AppIcon name="check-circle" class="h-4 w-4" />
												{m.app_admin_client_requests_accept_assign()}
											</button>
										</div>
									{:else}
										<p class="mt-3 text-sm text-[var(--text-soft)]">
											{#if row.assigned_supervisor_id}
												{m.app_admin_client_requests_assigned_supervisor()}: #
												{row.assigned_supervisor_id}
											{/if}
											{#if row.assigned_cleaner_id}
												{#if row.assigned_supervisor_id}
													·
												{/if}
												{m.app_admin_client_requests_assigned_cleaner()}: #{row.assigned_cleaner_id}
											{/if}
										</p>
										{#if row.created_object}
											<p class="text-sm text-[var(--text-soft)]">
												{m.app_admin_client_requests_created_object()}: #{row.created_object.id} ·
												{row.created_object.address}
											</p>
										{/if}
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
									<AppIcon
										name={objectAddressSearching ? 'refresh' : 'map-pin'}
										class={`${ui.inputIcon} ${objectAddressSearching ? 'animate-spin' : ''}`}
									/>
									<input
										type="text"
										class={ui.inputPadded}
										placeholder={m.location_picker_search_placeholder()}
										value={objectAddressQuery}
										autocomplete="off"
										oninput={(event) =>
											onObjectAddressInput((event.currentTarget as HTMLInputElement).value)}
										onfocus={() => {
											if (objectAddressSuggestions.length) objectAddressShowSuggestions = true;
										}}
										onblur={() => setTimeout(() => (objectAddressShowSuggestions = false), 180)}
									/>
								</div>
								{#if objectAddressShowSuggestions && objectAddressSuggestions.length > 0}
									<ul
										class="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-lg"
									>
										{#each objectAddressSuggestions as item, idx (idx)}
											<li>
												<button
													type="button"
													class="w-full px-3 py-2 text-left text-sm transition hover:bg-[var(--bg-muted)]"
													onmousedown={() => onSelectObjectAddressSuggestion(item)}
												>
													<AppIcon
														name="map-pin"
														class="mr-1.5 inline h-3.5 w-3.5 text-[var(--brand)]"
													/>
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
						<label
							class="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-muted)] px-3 text-sm font-semibold text-[var(--text-main)]"
						>
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
										<span class="text-xs text-[var(--text-soft)]"
											>{m.app_admin_objects_total_tasks()}: {item.totalTasks}</span
										>
									</div>
									{#if editingObjectId === item.objectId}
										<div class="mt-3 grid gap-2">
											<label class={ui.label}>
												<span>{m.app_admin_object_address_label()}</span>
												<input
													bind:value={objectEditForm.address}
													class={ui.input}
													type="text"
													required
												/>
											</label>
											<label class={ui.label}>
												<span>{m.app_admin_object_description_label()}</span>
												<input
													bind:value={objectEditForm.description}
													class={ui.input}
													type="text"
												/>
											</label>
										</div>
										<div class="mt-3 flex flex-wrap gap-2">
											<button
												type="button"
												class={ui.primaryButton}
												onclick={() => onSaveObjectEdit(item.objectId)}
											>
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
											<span
												class="rounded-lg bg-amber-100 px-2 py-1 font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
											>
												{item.pendingTasks}
												{m.app_admin_objects_pending_tasks()}
											</span>
											<span
												class="rounded-lg bg-blue-100 px-2 py-1 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
											>
												{item.inProgressTasks}
												{m.app_admin_objects_in_progress_tasks()}
											</span>
											<span
												class="rounded-lg bg-green-100 px-2 py-1 font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400"
											>
												{item.completedTasks}
												{m.app_admin_objects_completed_tasks()}
											</span>
										</div>
										<div class="mt-3 flex flex-wrap gap-2">
											<button
												type="button"
												class={ui.secondaryButton}
												onclick={() => startObjectEdit(item)}
											>
												<AppIcon name="checklist" class="h-4 w-4" />
												{m.app_edit()}
											</button>
											<button
												type="button"
												class={ui.dangerButton}
												onclick={() => onDeleteObject(item.objectId)}
											>
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
									<select
										bind:value={objectSettingsForm.objectId}
										class={ui.input}
										onchange={onObjectSettingsObjectChange}
									>
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
									disabled={loading || objectLocationSaving || !canSubmitObjectLocation()}
								>
									{#if objectLocationSaving}
										<AppIcon name="refresh" class="h-4 w-4 animate-spin" />
									{:else}
										<AppIcon name="check-circle" class="h-4 w-4" />
									{/if}
									{m.app_admin_object_settings_save_location()}
								</button>
							</div>
							{#if objectLocationMessage}
								<FlashMessage kind={objectLocationMessage.kind} text={objectLocationMessage.text} />
							{/if}
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
						<button
							type="button"
							disabled={loading}
							onclick={onLoadRooms}
							class={ui.secondaryButton}
						>
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
								{#each roomTypeOptions as option (option.value)}
									<option value={option.value}>{roomTypeLabel(option.value)}</option>
								{/each}
								<option value={CUSTOM_ROOM_TYPE_VALUE}>{m.app_room_type_custom_option()}</option>
							</select>
						</label>
						{#if roomForm.type === CUSTOM_ROOM_TYPE_VALUE}
							<label class={ui.label}>
								<span>{m.app_room_type_custom_label()}</span>
								<input bind:value={roomForm.customType} type="text" class={ui.input} required />
							</label>
						{/if}
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
														<option value={String(obj.objectId)}
															>#{obj.objectId} · {obj.address}</option
														>
													{/each}
												</select>
											</label>
											<label class={ui.label}>
												<span>{m.app_admin_room_type_label()}</span>
												<select bind:value={roomEditForm.type} class={ui.input}>
													{#each roomTypeOptions as option (option.value)}
														<option value={option.value}>{roomTypeLabel(option.value)}</option>
													{/each}
													<option value={CUSTOM_ROOM_TYPE_VALUE}
														>{m.app_room_type_custom_option()}</option
													>
												</select>
											</label>
											{#if roomEditForm.type === CUSTOM_ROOM_TYPE_VALUE}
												<label class={ui.label}>
													<span>{m.app_room_type_custom_label()}</span>
													<input
														bind:value={roomEditForm.customType}
														type="text"
														class={ui.input}
														required
													/>
												</label>
											{/if}
											<label class={ui.label}>
												<span>{m.app_admin_room_area_label()}</span>
												<input
													bind:value={roomEditForm.areaSqm}
													type="number"
													min="1"
													class={ui.input}
												/>
											</label>
										</div>
										<div class="mt-3 flex flex-wrap gap-2">
											<button
												type="button"
												class={ui.primaryButton}
												onclick={() => onSaveRoomEdit(room.id)}
											>
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
											<button
												type="button"
												class={ui.secondaryButton}
												onclick={() => startRoomEdit(room)}
											>
												<AppIcon name="checklist" class="h-4 w-4" />
												{m.app_edit()}
											</button>
											<button
												type="button"
												class={ui.dangerButton}
												onclick={() => onDeleteRoom(room.id)}
											>
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
						<button
							type="button"
							disabled={loading}
							onclick={onLoadAdminTasks}
							class={ui.secondaryButton}
						>
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
											<button
												type="button"
												class={ui.primaryButton}
												onclick={() => onSaveTaskEdit(task.id)}
											>
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
											<button
												type="button"
												class={ui.secondaryButton}
												onclick={() => startTaskEdit(task)}
											>
												<AppIcon name="checklist" class="h-4 w-4" />
												{m.app_edit()}
											</button>
											<button
												type="button"
												class={ui.dangerButton}
												onclick={() => onDeleteTask(task.id)}
											>
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
						{#each [m.app_admin_wizard_step_object(), m.app_admin_wizard_step_room(), m.app_admin_wizard_step_task(), m.app_admin_wizard_step_done()] as label, i (i)}
							<span
								class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold {i <=
								wizardStep
									? 'bg-[var(--brand)] text-white'
									: 'bg-[var(--bg-muted)] text-[var(--text-soft)]'}">{i + 1}</span
							>
							<span
								class="hidden sm:inline {i <= wizardStep
									? 'text-[var(--text-main)]'
									: 'text-[var(--text-soft)]'}">{label}</span
							>
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
								<select
									required
									bind:value={wizardObjectId}
									class={ui.input}
									onchange={onWizardObjectChange}
								>
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
									onclick={() => {
										wizardStep = 1;
									}}
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
											#{room.id} · {roomTypeLabel(room.type)} · {room.area_sqm} sqm
										</option>
									{/each}
								</select>
							</label>
							{#if !wizardRoomId}
								<form class="grid gap-3 sm:grid-cols-2" onsubmit={onWizardCreateRoom}>
									<label class={ui.label}>
										<span>{m.app_admin_room_type_label()}</span>
										<select bind:value={wizardRoomType} class={ui.input}>
											{#each roomTypeOptions as option (option.value)}
												<option value={option.value}>{roomTypeLabel(option.value)}</option>
											{/each}
											<option value={CUSTOM_ROOM_TYPE_VALUE}
												>{m.app_room_type_custom_option()}</option
											>
										</select>
									</label>
									{#if wizardRoomType === CUSTOM_ROOM_TYPE_VALUE}
										<label class={ui.label}>
											<span>{m.app_room_type_custom_label()}</span>
											<input
												bind:value={wizardCustomRoomType}
												type="text"
												class={ui.input}
												required
											/>
										</label>
									{/if}
									<label class={ui.label}>
										<span>{m.app_admin_room_area_label()}</span>
										<input
											required
											type="number"
											min="1"
											bind:value={wizardRoomArea}
											class={ui.input}
										/>
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
										onclick={() => {
											wizardStep = 2;
										}}
									>
										<AppIcon name="chevron-right" class="h-4 w-4" />
										{m.app_admin_wizard_next()}
									</button>
								</div>
							{/if}
							<div>
								<button
									type="button"
									class={ui.secondaryButton}
									onclick={() => {
										wizardStep = 0;
									}}
								>
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
								<button
									type="submit"
									class={ui.primaryButton}
									disabled={loading || !wizardCleanerId}
								>
									<AppIcon name="check-circle" class="h-4 w-4" />
									{m.app_admin_wizard_assign_task()}
								</button>
								<button
									type="button"
									class={ui.secondaryButton}
									onclick={() => {
										wizardStep = 1;
									}}
								>
									{m.app_admin_wizard_back()}
								</button>
							</div>
						</form>
					{:else}
						<div class="mt-4 grid gap-3 sm:max-w-xl">
							<div
								class="flex items-center gap-2 rounded-xl bg-green-50 p-4 text-green-800 dark:bg-green-900/20 dark:text-green-300"
							>
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
				<form class="mt-4 grid gap-3 md:grid-cols-4" onsubmit={onApplyCleanerFilters}>
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
						<input type="date" bind:value={cleanerFilters.date} class={ui.input} />
					</label>
					<div class="md:col-span-2 md:self-end">
						<div class="flex flex-wrap gap-2">
							<button type="submit" disabled={loading} class={ui.secondaryButton}>
								<AppIcon name="refresh" class="h-4 w-4" />
								{m.app_cleaner_fetch()}
							</button>
							<button
								type="button"
								disabled={loading}
								class={ui.ghostButton}
								onclick={onResetCleanerFilters}
							>
								<AppIcon name="x" class="h-4 w-4" />
								{m.app_cancel()}
							</button>
							<button
								type="button"
								disabled={loading}
								class={ui.secondaryButton}
								onclick={onLoadCleanerTasks}
							>
								<AppIcon name="refresh" class="h-4 w-4" />
								{m.app_cleaner_refresh_tasks()}
							</button>
						</div>
					</div>
				</form>
				<p class="mt-3 text-sm text-[var(--text-soft)]">
					{m.app_cleaner_today_tasks_hint()}
				</p>

				<section class="surface-soft mt-4 p-4">
					<div class="flex items-center justify-between gap-3">
						<div>
							<p class="text-xs text-[var(--text-soft)]">{m.app_metric_sync_status()}</p>
							<p class="mt-1 text-sm font-semibold">{m.app_metric_queue_pending()}</p>
						</div>
						<p class="text-3xl leading-none font-semibold">{cleanerUnsyncedCount()}</p>
					</div>
				</section>

				{#if filteredCleanerTodayObjects().length === 0}
					<p class="mt-4 text-[var(--text-soft)]">{m.app_cleaner_empty_today_objects()}</p>
				{:else}
					<div class="mt-4 grid gap-4">
						{#each filteredCleanerTodayObjects() as objectRow (objectRow.object.id)}
							<article class="surface-soft p-4">
								<div class="flex flex-wrap items-start justify-between gap-3">
									<div>
										<p class="font-semibold">{objectRow.object.address}</p>
										<p class="text-sm text-[var(--text-soft)]">
											{m.app_cleaner_object_timing_summary({
												on_site: formatElapsed(objectRow.timing.on_site_seconds),
												off_site: formatElapsed(objectRow.timing.off_site_seconds),
												total: formatElapsed(objectRow.timing.elapsed_seconds)
											})}
										</p>
										{#if objectRow.active_session}
											<p class="text-xs text-[var(--text-soft)]">
												{m.app_cleaner_session_timing({
													elapsed: formatElapsed(objectRow.active_session.timing.elapsed_seconds)
												})}
												·
												{objectRow.active_session.current_inside_geofence
													? ` ${m.app_cleaner_presence_inside_geofence()}`
													: ` ${m.app_cleaner_presence_outside_geofence()}`}
											</p>
										{/if}
									</div>
									<div class="flex flex-wrap gap-2">
										{#if objectRow.active_session?.status === 'active'}
											<button
												type="button"
												class={ui.secondaryButton}
												disabled={loading}
												onclick={() => onCheckOutObject(objectRow.object.id)}
											>
												<AppIcon name="check-circle" class="h-4 w-4" />
												{m.app_cleaner_check_out()}
											</button>
										{:else}
											<button
												type="button"
												class={ui.primaryButton}
												disabled={loading}
												onclick={() => onCheckInObject(objectRow.object.id)}
											>
												<AppIcon name="map-pin" class="h-4 w-4" />
												{m.app_cleaner_check_in()}
											</button>
										{/if}
									</div>
								</div>

								{#if objectRow.active_session?.status !== 'active'}
									<p class="mt-3 text-sm text-[var(--text-soft)]">
										{m.app_cleaner_check_in_hint()}
									</p>
								{:else}
									{#if !objectRow.active_session.current_inside_geofence}
										<p class="mt-3 text-sm text-amber-600">
											{m.app_cleaner_outside_geofence_warning()}
										</p>
									{/if}
									<div class="mt-4 grid gap-3">
										{#each objectRow.rooms as roomEntry (roomEntry.room.id)}
											<section
												class="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3"
											>
												<div class="flex flex-wrap items-center justify-between gap-2">
													<p class="font-semibold">
														{m.app_cleaner_room_summary({
															id: String(roomEntry.room.id),
															type: roomTypeLabel(roomEntry.room.type),
															area: String(roomEntry.room.area_sqm)
														})}
													</p>
													<span class="chip">
														{m.app_cleaner_room_timing_summary({
															elapsed: formatElapsed(roomEntry.timing.elapsed_seconds),
															on_site: formatElapsed(roomEntry.timing.on_site_seconds)
														})}
													</span>
												</div>

												<div class="mt-3 grid gap-3">
													{#each roomEntry.tasks as taskEntry (taskEntry.task.id)}
														<article
															class="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3"
														>
															<p class="text-sm text-[var(--text-soft)]">
																{m.app_cleaner_task_id({ id: String(taskEntry.task.id) })}
															</p>
															<p class="text-sm font-semibold">
																{m.app_cleaner_task_timing_summary({
																	status: taskStatusLabel(taskEntry.task.status),
																	elapsed: formatElapsed(taskEntry.timing.elapsed_seconds),
																	on_site: formatElapsed(taskEntry.timing.on_site_seconds),
																	off_site: formatElapsed(taskEntry.timing.off_site_seconds)
																})}
															</p>

															{#if taskEntry.instructions.length > 0}
																<div class="mt-2 text-sm">
																	<p class="font-semibold">{m.app_cleaner_instructions_title()}</p>
																	<div class="mt-1 grid gap-1 text-[var(--text-soft)]">
																		{#each taskEntry.instructions as instruction, idx (idx)}
																			<p>{idx + 1}. {localizedChecklistTitle(instruction)}</p>
																		{/each}
																	</div>
																</div>
															{/if}

															{#if taskEntry.task.status === 'pending'}
																<div class="mt-3">
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
																				beforeFiles[taskEntry.task.id] = input.files?.[0] || null;
																			}}
																		/>
																	</label>
																</div>
																<div class="mt-3">
																	<button
																		type="button"
																		disabled={loading ||
																			!objectRow.active_session.current_inside_geofence}
																		onclick={() => onStartCleanerTask(taskEntry.task.id)}
																		class={ui.primaryButton}
																	>
																		<AppIcon name="play" class="h-4 w-4" />
																		{m.app_cleaner_start()}
																	</button>
																</div>
															{:else if taskEntry.task.status === 'in_progress'}
																<div class="mt-3">
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
																				afterFiles[taskEntry.task.id] = input.files?.[0] || null;
																			}}
																		/>
																	</label>
																</div>
																<div class="mt-3">
																	<button
																		type="button"
																		disabled={loading ||
																			!objectRow.active_session.current_inside_geofence}
																		onclick={() => onCompleteCleanerTask(taskEntry.task.id)}
																		class={ui.primaryButton}
																	>
																		<AppIcon name="check-circle" class="h-4 w-4" />
																		{m.app_cleaner_complete()}
																	</button>
																</div>
															{:else}
																<p class="mt-2 text-xs text-[var(--text-soft)]">
																	{m.app_cleaner_task_completed_hint()}
																</p>
															{/if}

															{#if taskEntry.task.status === 'in_progress'}
																<div class="mt-3">
																	<TaskQuestionnaire
																		taskId={taskEntry.task.id}
																		token={currentSession?.token || ''}
																		onChecklistGenerated={() => refreshByRole()}
																	/>
																</div>
															{/if}

															{#if checklistsByTask[taskEntry.task.id]}
																<div class="surface-soft mt-3 p-3 sm:p-4">
																	<div class="flex flex-wrap items-center justify-between gap-2">
																		<p class="text-sm font-semibold">
																			{m.app_cleaner_task_checklist()}
																		</p>
																		<span class="chip">
																			{m.app_cleaner_completion_percent({
																				value: String(
																					checklistsByTask[taskEntry.task.id].completion_percent
																				)
																			})}
																		</span>
																	</div>
																	<div class="mt-3 grid gap-3">
																		{#each checklistsByTask[taskEntry.task.id].items as item, itemIndex (item.id)}
																			<div
																				class="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3"
																			>
																				<label class="flex cursor-pointer items-start gap-3">
																					<input
																						type="checkbox"
																						checked={item.done}
																						onchange={(event) => {
																							checklistsByTask[taskEntry.task.id].items[
																								itemIndex
																							].done = (
																								event.currentTarget as HTMLInputElement
																							).checked;
																						}}
																						class="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]"
																					/>
																					<span class="min-h-5 text-sm leading-5 font-medium">
																						{localizedChecklistTitle(item.title)}
																					</span>
																				</label>
																				<div class="mt-2 grid gap-2">
																					<input
																						type="text"
																						class={ui.input}
																						value={item.note || ''}
																						oninput={(event) => {
																							checklistsByTask[taskEntry.task.id].items[
																								itemIndex
																							].note = (
																								event.currentTarget as HTMLInputElement
																							).value;
																						}}
																						placeholder={m.app_cleaner_note_placeholder()}
																					/>
																					{#if item.photo_url}
																						<div class="mt-1">
																							<img
																								src={item.photo_url}
																								alt={localizedChecklistTitle(item.title)}
																								class="h-24 w-24 rounded-lg border border-[var(--border)] object-cover"
																							/>
																						</div>
																					{/if}
																					<input
																						type="file"
																						accept="image/*"
																						capture="environment"
																						class="file-control mt-1 w-full text-sm"
																						onchange={(event) => {
																							const input = event.currentTarget as HTMLInputElement;
																							const file = input.files?.[0];
																							if (file)
																								onUploadChecklistPhoto(
																									taskEntry.task.id,
																									item.id,
																									file
																								);
																						}}
																					/>
																				</div>
																			</div>
																		{/each}
																	</div>
																	<button
																		type="button"
																		class={`mt-3 w-full sm:w-auto ${ui.secondaryButton}`}
																		disabled={loading}
																		onclick={() => onPatchChecklist(taskEntry.task.id)}
																	>
																		<AppIcon name="check-circle" class="h-4 w-4" />
																		{m.app_cleaner_save_checklist()}
																	</button>
																</div>
															{/if}

															{#if taskEntry.task.status === 'completed' || aiRatingsByTask[taskEntry.task.id]}
																<div class="surface-soft mt-3 p-3">
																	<div class="flex flex-wrap items-center justify-between gap-2">
																		<p class="text-sm font-semibold">
																			{m.app_cleaner_ai_quality_title()}
																		</p>
																		<span class="chip">
																			{cleanerAiStatusLabel(
																				aiRatingsByTask[taskEntry.task.id]?.ai_status
																			)}
																		</span>
																	</div>
																	{#if typeof aiRatingsByTask[taskEntry.task.id]?.ai_score === 'number'}
																		<p class="mt-2 text-sm">
																			{m.app_cleaner_ai_score_model({
																				score: String(aiRatingsByTask[taskEntry.task.id]?.ai_score),
																				model:
																					aiRatingsByTask[taskEntry.task.id]?.ai_model ||
																					m.app_value_na()
																			})}
																		</p>
																	{/if}
																	{#if aiRatingsByTask[taskEntry.task.id]?.ai_feedback_cleaner || aiRatingsByTask[taskEntry.task.id]?.ai_feedback}
																		<p class="mt-2 text-sm text-[var(--text-soft)]">
																			{aiRatingsByTask[taskEntry.task.id]?.ai_feedback_cleaner ||
																				aiRatingsByTask[taskEntry.task.id]?.ai_feedback}
																		</p>
																	{/if}
																	{#if aiRatingsByTask[taskEntry.task.id]?.ai_review?.photo_quality?.retake_required}
																		<p class="mt-2 text-xs text-amber-600">
																			{m.app_supervisor_photo_retake_recommended()}
																		</p>
																	{/if}
																	{#if taskEntry.task.status === 'completed'}
																		<button
																			type="button"
																			class={`mt-3 w-full sm:w-auto ${ui.ghostButton}`}
																			disabled={loading}
																			onclick={() => onRunCleanerTaskAiRating(taskEntry.task.id)}
																		>
																			<AppIcon name="sparkles" class="h-4 w-4" />
																			{m.app_cleaner_ai_rerun()}
																		</button>
																	{/if}
																</div>
															{/if}
														</article>
													{/each}
												</div>
											</section>
										{/each}
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
				<form class="mt-4 grid gap-3 md:grid-cols-4" onsubmit={onApplySupervisorAnalyticsFilters}>
					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="calendar" class="h-4 w-4" />
							{m.app_cleaner_filter_date_from_label()}
						</span>
						<input type="date" class={ui.input} bind:value={supervisorAnalyticsFilters.date_from} />
					</label>
					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="calendar" class="h-4 w-4" />
							{m.app_cleaner_filter_date_to_label()}
						</span>
						<input type="date" class={ui.input} bind:value={supervisorAnalyticsFilters.date_to} />
					</label>
					<div class="md:col-span-2 md:self-end">
						<div class="flex flex-wrap gap-2">
							<button type="submit" class={ui.secondaryButton} disabled={loading}>
								<AppIcon name="refresh" class="h-4 w-4" />
								{m.app_analytics_refresh()}
							</button>
							<button
								type="button"
								class={ui.ghostButton}
								disabled={loading}
								onclick={onResetSupervisorAnalyticsFilters}
							>
								<AppIcon name="x" class="h-4 w-4" />
								{m.app_cancel()}
							</button>
						</div>
					</div>
				</form>
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
					<MetricCard
						title={m.app_supervisor_metric_on_site_ratio()}
						value={supervisorTimeAnalytics
							? asPercent(supervisorTimeAnalytics.summary.on_site_ratio)
							: m.app_value_na()}
						detail={supervisorTimeAnalytics
							? m.app_supervisor_metric_tracked({
									value: formatElapsed(supervisorTimeAnalytics.summary.total_elapsed_seconds)
								})
							: m.app_supervisor_metric_no_time_data()}
						icon="check-circle"
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
				{#if supervisorTimeAnalytics}
					<section class="surface-soft mt-4 p-4">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h3 class="text-sm font-semibold text-[var(--text-main)]">
								{m.app_supervisor_time_analytics_title()}
							</h3>
							<span class="chip">
								{m.app_supervisor_time_window({
									from: supervisorTimeAnalytics.window.date_from,
									to: supervisorTimeAnalytics.window.date_to
								})}
							</span>
						</div>
						<div class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
							<div class="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
								<p class="text-xs text-[var(--text-soft)]">{m.app_supervisor_on_site()}</p>
								<p class="mt-1 text-base font-semibold">
									{formatElapsed(supervisorTimeAnalytics.summary.on_site_seconds)}
								</p>
							</div>
							<div class="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
								<p class="text-xs text-[var(--text-soft)]">{m.app_supervisor_off_site()}</p>
								<p class="mt-1 text-base font-semibold">
									{formatElapsed(supervisorTimeAnalytics.summary.off_site_seconds)}
								</p>
							</div>
							<div class="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
								<p class="text-xs text-[var(--text-soft)]">{m.app_supervisor_total_tracked()}</p>
								<p class="mt-1 text-base font-semibold">
									{formatElapsed(supervisorTimeAnalytics.summary.total_elapsed_seconds)}
								</p>
							</div>
							<div class="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
								<p class="text-xs text-[var(--text-soft)]">{m.app_supervisor_task_elapsed()}</p>
								<p class="mt-1 text-base font-semibold">
									{formatElapsed(supervisorTimeAnalytics.summary.task_elapsed_seconds)}
								</p>
							</div>
						</div>
						<div class="mt-4 grid gap-4 xl:grid-cols-2">
							<div class="min-w-0">
								<p class="text-sm font-semibold text-[var(--text-main)]">
									{m.app_supervisor_by_cleaner()}
								</p>
								{#if supervisorTimeAnalytics.cleaners.length === 0}
									<p class="mt-2 text-sm text-[var(--text-soft)]">
										{m.app_supervisor_no_cleaner_time_data()}
									</p>
								{:else}
									<div class={`${ui.tableWrap} mt-2 max-w-full min-w-0`}>
										<table class={`${ui.table} min-w-[980px]`}>
											<thead>
												<tr>
													<th>{m.app_admin_analytics_cleaner()}</th>
													<th>{m.app_supervisor_on_site()}</th>
													<th>{m.app_supervisor_off_site()}</th>
													<th>{m.app_supervisor_table_total()}</th>
													<th>{m.app_supervisor_task_elapsed()}</th>
													<th>{m.app_supervisor_table_on_site_percent()}</th>
													<th>{m.app_supervisor_table_objects()}</th>
													<th>{m.app_supervisor_table_rooms()}</th>
													<th>{m.app_supervisor_table_tasks()}</th>
												</tr>
											</thead>
											<tbody>
												{#each supervisorTimeAnalytics.cleaners as row (row.cleaner_id)}
													<tr>
														<td>{row.cleaner_name}</td>
														<td>{formatElapsed(row.on_site_seconds)}</td>
														<td>{formatElapsed(row.off_site_seconds)}</td>
														<td>{formatElapsed(row.total_elapsed_seconds)}</td>
														<td>{formatElapsed(row.task_elapsed_seconds)}</td>
														<td>{asPercent(row.on_site_ratio)}</td>
														<td>{row.object_count}</td>
														<td>{row.room_count}</td>
														<td>{row.task_count}</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{/if}
							</div>
							<div class="min-w-0">
								<p class="text-sm font-semibold text-[var(--text-main)]">
									{m.app_supervisor_by_object()}
								</p>
								{#if supervisorTimeAnalytics.objects.length === 0}
									<p class="mt-2 text-sm text-[var(--text-soft)]">
										{m.app_supervisor_no_object_time_data()}
									</p>
								{:else}
									<div class={`${ui.tableWrap} mt-2 max-w-full min-w-0`}>
										<table class={`${ui.table} min-w-[620px]`}>
											<thead>
												<tr>
													<th>{m.app_inspections_object()}</th>
													<th>{m.app_supervisor_on_site()}</th>
													<th>{m.app_supervisor_off_site()}</th>
													<th>{m.app_supervisor_table_total()}</th>
													<th>{m.app_supervisor_table_on_site_percent()}</th>
												</tr>
											</thead>
											<tbody>
												{#each supervisorTimeAnalytics.objects as row (row.object_id)}
													<tr>
														<td>{row.object_address}</td>
														<td>{formatElapsed(row.on_site_seconds)}</td>
														<td>{formatElapsed(row.off_site_seconds)}</td>
														<td>{formatElapsed(row.total_elapsed_seconds)}</td>
														<td>{asPercent(row.on_site_ratio)}</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{/if}
							</div>
						</div>
					</section>
				{/if}
				{#if supervisorTimeAnalytics}
					<section class="surface-soft mt-4 p-4">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h3 class="text-sm font-semibold text-[var(--text-main)]">
								{m.app_admin_objects_title()} · {m.app_admin_tasks_title()}
							</h3>
							<span class="chip">
								{supervisorTimeAnalytics.today_tracking?.date || m.app_value_na()}
							</span>
						</div>
						<form class="mt-3 grid gap-3 md:grid-cols-3" onsubmit={onCreateTask}>
							<label class={ui.label}>
								<span class="label-title">
									<AppIcon name="building" class="h-4 w-4" />
									{m.app_admin_task_room_label()}
								</span>
								<select required bind:value={taskForm.roomId} class={ui.input}>
									<option value="" disabled>{m.app_admin_task_select_room()}</option>
									{#each companyRooms as room (room.id)}
										<option value={String(room.id)}>
											#{room.id} · {room.objectAddress || ''} · {roomTypeLabel(room.type)}
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
							<div class="md:self-end">
								<button
									type="submit"
									disabled={loading ||
										!companyRooms.length ||
										!companyUsers.some((row) => row.role === 'cleaner')}
									class={ui.primaryButton}
								>
									<AppIcon name="plus" class="h-4 w-4" />
									{m.app_admin_tasks_create()}
								</button>
							</div>
						</form>
						{#if supervisorTodayObjects().length === 0}
							<p class="mt-3 text-sm text-[var(--text-soft)]">
								{m.app_cleaner_empty_today_objects()}
							</p>
						{:else}
							<div class="mt-4 grid gap-3 sm:grid-cols-2">
								{#each supervisorTodayObjects() as objectRow (objectRow.object_id)}
									<article
										class="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4"
									>
										<div class="flex flex-wrap items-start justify-between gap-2">
											<div>
												<p class="font-semibold">{objectRow.object_address}</p>
												<p class="mt-1 text-xs text-[var(--text-soft)]">
													{m.app_cleaner_object_timing_summary({
														on_site: formatElapsed(objectRow.on_site_seconds),
														off_site: formatElapsed(objectRow.off_site_seconds),
														total: formatElapsed(objectRow.total_elapsed_seconds)
													})}
												</p>
											</div>
											<div class="text-right text-xs text-[var(--text-soft)]">
												<p>{m.app_admin_analytics_cleaner()}: {objectRow.active_cleaner_count}</p>
												<p>{m.app_supervisor_table_tasks()}: {objectRow.task_count}</p>
											</div>
										</div>
										{#if objectRow.tasks.length === 0}
											<p class="mt-3 text-sm text-[var(--text-soft)]">{m.app_empty_tasks()}</p>
										{:else}
											<div class="mt-3 grid gap-2">
												{#each objectRow.tasks as task (task.task_id)}
													<div
														class="rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] p-3"
													>
														<div class="flex flex-wrap items-center justify-between gap-2">
															<span class="chip">#{task.task_id}</span>
															<span class="chip">{taskStatusLabel(task.status)}</span>
														</div>
														{#if editingTaskId === task.task_id}
															<div class="mt-2 grid gap-2">
																<label class={ui.label}>
																	<span>{m.app_admin_task_room_label()}</span>
																	<select bind:value={taskEditForm.roomId} class={ui.input}>
																		{#each companyRooms as room (room.id)}
																			<option value={String(room.id)}>
																				#{room.id} · {room.objectAddress || ''} · {roomTypeLabel(
																					room.type
																				)}
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
																		<option value="in_progress">{m.app_status_in_progress()}</option
																		>
																		<option value="completed">{m.app_status_completed()}</option>
																	</select>
																</label>
																<div class="flex flex-wrap gap-2">
																	<button
																		type="button"
																		class={ui.primaryButton}
																		onclick={() => onSaveTaskEdit(task.task_id)}
																	>
																		<AppIcon name="check-circle" class="h-4 w-4" />
																		{m.app_save()}
																	</button>
																	<button
																		type="button"
																		class={ui.secondaryButton}
																		onclick={cancelTaskEdit}
																	>
																		{m.app_cancel()}
																	</button>
																</div>
															</div>
														{:else}
															<p class="mt-2 text-sm">
																{roomTypeLabel(task.room_type)} · {task.room_area_sqm} sqm
															</p>
															<p class="mt-1 text-xs text-[var(--text-soft)]">
																{task.cleaner_name} ({task.cleaner_email})
															</p>
															<div class="mt-2 flex flex-wrap gap-2">
																<button
																	type="button"
																	class={ui.secondaryButton}
																	onclick={() =>
																		startTodayTrackingTaskEdit(
																			objectRow.object_id,
																			objectRow.object_address,
																			task
																		)}
																>
																	<AppIcon name="checklist" class="h-4 w-4" />
																	{m.app_edit()}
																</button>
																<button
																	type="button"
																	class={ui.dangerButton}
																	onclick={() => onDeleteTask(task.task_id)}
																>
																	<AppIcon name="trash" class="h-4 w-4" />
																	{m.app_delete()}
																</button>
															</div>
														{/if}
													</div>
												{/each}
											</div>
										{/if}
									</article>
								{/each}
							</div>
						{/if}
					</section>
				{/if}

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
										onclick={() => onRunSupervisorTaskAiRating(row.task.id)}
									>
										<AppIcon name="sparkles" class="h-4 w-4" />
										{m.app_action_rerun()}
									</button>
								</div>
								{#if aiRatingsByTask[row.task.id]?.ai_feedback_supervisor || aiRatingsByTask[row.task.id]?.ai_feedback}
									<p class="mt-2 text-sm text-[var(--text-soft)]">
										{aiRatingsByTask[row.task.id]?.ai_feedback_supervisor ||
											aiRatingsByTask[row.task.id]?.ai_feedback}
									</p>
								{/if}
								{#if aiRatingsByTask[row.task.id]?.ai_review?.photo_quality?.retake_required}
									<p class="mt-1 text-xs text-amber-600">
										{m.app_supervisor_photo_retake_recommended()}
									</p>
								{/if}
							</article>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		{#if currentSession.user.role === 'client'}
			<section id="client-requests" class={`mt-6 ${ui.panel}`}>
				<h2 class={ui.sectionTitle}>
					<AppIcon name="clipboard" class="h-5 w-5 text-[var(--brand)]" />
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
						{m.app_client_requests_fetch()}
					</button>
				</div>

				<div class="mt-4 grid gap-3 md:grid-cols-2">
					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="building" class="h-4 w-4" />
							{m.auth_company_name_label()}
						</span>
						<select
							required
							bind:value={clientCompanyId}
							class={ui.input}
							disabled={loading}
							onchange={onClientCompanyChange}
						>
							<option value="" disabled>{m.register_company_select_placeholder()}</option>
							{#each clientCompanies as company (company.id)}
								<option value={String(company.id)}>{company.name}</option>
							{/each}
						</select>
					</label>
					<div class="md:self-end">
						<button
							type="button"
							class={ui.secondaryButton}
							disabled={loading}
							onclick={onLoadClientFeedback}
						>
							<AppIcon name="refresh" class="h-4 w-4" />
							{m.register_companies_load()}
						</button>
					</div>
				</div>

				<form class="mt-4 grid gap-3" onsubmit={onCreateClientServiceRequest}>
					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="map-pin" class="h-4 w-4" />
							{m.app_admin_object_address_label()}
						</span>
						<div class="relative">
							<div class={ui.inputWithIcon}>
								<AppIcon
									name={clientAddressSearching ? 'refresh' : 'map-pin'}
									class={`${ui.inputIcon} ${clientAddressSearching ? 'animate-spin' : ''}`}
								/>
								<input
									type="text"
									class={ui.inputPadded}
									placeholder={m.location_picker_search_placeholder()}
									value={clientAddressQuery}
									autocomplete="off"
									oninput={(event) =>
										onClientAddressInput((event.currentTarget as HTMLInputElement).value)}
									onfocus={() => {
										if (clientAddressSuggestions.length) clientAddressShowSuggestions = true;
									}}
									onblur={() => setTimeout(() => (clientAddressShowSuggestions = false), 180)}
								/>
							</div>
							{#if clientAddressShowSuggestions && clientAddressSuggestions.length > 0}
								<ul
									class="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-lg"
								>
									{#each clientAddressSuggestions as item, idx (idx)}
										<li>
											<button
												type="button"
												class="w-full px-3 py-2 text-left text-sm transition hover:bg-[var(--bg-muted)]"
												onmousedown={() => onSelectClientAddressSuggestion(item)}
											>
												<AppIcon
													name="map-pin"
													class="mr-1.5 inline h-3.5 w-3.5 text-[var(--brand)]"
												/>
												{item.display_name}
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					</label>

					<div class="grid gap-3 md:grid-cols-2">
						<label class={ui.label}>
							<span class="label-title">
								<AppIcon name="building" class="h-4 w-4" />
								{m.app_admin_object_city_label()}
							</span>
							<input
								required
								bind:value={clientServiceRequestForm.city}
								type="text"
								class={ui.input}
							/>
						</label>
						<label class={ui.label}>
							<span class="label-title">
								<AppIcon name="map-pin" class="h-4 w-4" />
								{m.app_admin_object_street_label()}
							</span>
							<input
								required
								bind:value={clientServiceRequestForm.street}
								type="text"
								class={ui.input}
							/>
						</label>
						<label class={ui.label}>
							<span class="label-title">
								<AppIcon name="home" class="h-4 w-4" />
								{m.app_admin_object_house_number_label()}
							</span>
							<input
								required
								bind:value={clientServiceRequestForm.houseNumber}
								type="text"
								class={ui.input}
							/>
						</label>
						<label
							class="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-muted)] px-3 text-sm font-semibold text-[var(--text-main)]"
						>
							<input
								type="checkbox"
								class="h-4 w-4 accent-[var(--brand)]"
								bind:checked={clientServiceRequestForm.isPrivateHouse}
							/>
							<span>{m.app_admin_object_is_private_house_label()}</span>
						</label>
						{#if !clientServiceRequestForm.isPrivateHouse}
							<label class={ui.label}>
								<span class="label-title">
									<AppIcon name="home" class="h-4 w-4" />
									{m.app_admin_object_apartment_number_label()}
								</span>
								<input
									bind:value={clientServiceRequestForm.apartmentNumber}
									type="text"
									class={ui.input}
								/>
							</label>
							<label class={ui.label}>
								<span class="label-title">
									<AppIcon name="building" class="h-4 w-4" />
									{m.app_admin_object_floor_label()}
								</span>
								<input bind:value={clientServiceRequestForm.floor} type="text" class={ui.input} />
							</label>
						{/if}
					</div>

					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="sparkles" class="h-4 w-4" />
							{m.app_admin_wizard_traffic_label()}
						</span>
						<select bind:value={clientServiceRequestForm.easySetupUsage} class={ui.input}>
							<option value="quiet">{m.app_admin_wizard_traffic_low()}</option>
							<option value="normal">{m.app_admin_wizard_traffic_medium()}</option>
							<option value="busy">{m.app_admin_wizard_traffic_high()}</option>
						</select>
					</label>
					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="message-square" class="h-4 w-4" />
							{m.app_client_request_object_description_label()}
						</span>
						<input
							type="text"
							bind:value={clientServiceRequestForm.objectDescription}
							class={ui.input}
						/>
					</label>

					<div class="grid gap-3 rounded-xl border border-[var(--border)] p-3">
						<LocationPicker
							bind:latitude={clientServiceRequestForm.latitude}
							bind:longitude={clientServiceRequestForm.longitude}
							bind:address={clientAddressQuery}
							onLocationChange={onClientRequestLocationChange}
						/>
					</div>

					<div class="rounded-xl border border-[var(--border)] p-3">
						<div class="flex items-center justify-between gap-2">
							<p class="text-sm font-semibold">{m.app_client_request_tasks_title()}</p>
							<button
								type="button"
								class={ui.secondaryButton}
								disabled={loading}
								onclick={addClientServiceRequestTask}
							>
								<AppIcon name="plus" class="h-4 w-4" />
								{m.app_client_request_add_task()}
							</button>
						</div>
						<div class="mt-3 grid gap-3">
							{#each clientServiceRequestTasks as task, index (index)}
								<div class="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
									<div class="grid gap-3 md:grid-cols-4">
										<label class={ui.label}>
											<span>{m.app_client_request_task_room_type_label()}</span>
											<select bind:value={task.roomType} class={ui.input}>
												{#each roomTypeOptions as option (option.value)}
													<option value={option.value}>{roomTypeLabel(option.value)}</option>
												{/each}
												<option value={CUSTOM_ROOM_TYPE_VALUE}
													>{m.app_room_type_custom_option()}</option
												>
											</select>
										</label>
										{#if task.roomType === CUSTOM_ROOM_TYPE_VALUE}
											<label class={ui.label}>
												<span>{m.app_room_type_custom_label()}</span>
												<input
													type="text"
													class={ui.input}
													required
													bind:value={task.customRoomType}
												/>
											</label>
										{/if}
										<label class={ui.label}>
											<span>{m.app_client_request_task_area_label()}</span>
											<input
												type="number"
												min="1"
												required
												class={ui.input}
												bind:value={task.areaSqm}
											/>
										</label>
										<label class={ui.label}>
											<span>{m.app_client_request_task_note_label()}</span>
											<input type="text" class={ui.input} bind:value={task.note} />
										</label>
									</div>
									<div class="mt-2">
										<button
											type="button"
											class={ui.dangerButton}
											disabled={loading || clientServiceRequestTasks.length <= 1}
											onclick={() => removeClientServiceRequestTask(index)}
										>
											<AppIcon name="trash" class="h-4 w-4" />
											{m.app_client_request_remove_task()}
										</button>
									</div>
								</div>
							{/each}
						</div>
					</div>

					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="message-square" class="h-4 w-4" />
							{m.app_client_request_note_label()}
						</span>
						<input type="text" bind:value={clientServiceRequestForm.clientNote} class={ui.input} />
					</label>
					<div>
						<button type="submit" disabled={loading} class={ui.primaryButton}>
							<AppIcon name="plus" class="h-4 w-4" />
							{m.app_client_request_submit()}
						</button>
					</div>
				</form>

				{#if clientServiceRequestRows.length === 0}
					<p class="mt-4 text-[var(--text-soft)]">{m.app_empty_client_requests()}</p>
				{:else}
					<div class="mt-4 grid gap-3 sm:grid-cols-2">
						{#each clientServiceRequestRows as row (row.id)}
							<article class="surface-soft p-4">
								<div class="flex items-center justify-between gap-2">
									<p class="font-semibold">#{row.id}</p>
									<span class={clientRequestStatusChipClass(row.status)}>
										{clientRequestStatusLabel(row.status)}
									</span>
								</div>
								<p class="mt-2 font-semibold">{row.object_address}</p>
								{#if row.object_description}
									<p class="mt-1 text-sm text-[var(--text-soft)]">{row.object_description}</p>
								{/if}
								{#if row.latitude !== null && row.longitude !== null}
									<p class="mt-1 text-xs text-[var(--text-soft)]">
										{m.app_client_request_gps_label()}: {row.latitude.toFixed(6)},
										{row.longitude.toFixed(6)}
									</p>
								{/if}
								<p class="mt-1 text-xs text-[var(--text-soft)]">
									{m.auth_company_name_label()}: {row.company?.name || m.app_value_na()}
								</p>
								<div class="mt-2 space-y-1">
									{#each row.requested_tasks as task, idx (idx)}
										<p class="text-sm">
											- {roomTypeLabel(task.room_type)} · {task.area_sqm} sqm
										</p>
									{/each}
								</div>
								<p class="mt-2 text-xs text-[var(--text-soft)]">
									{m.app_admin_wizard_recommended_level_label()}
									{cleaningStandardLabel(row.recommended_cleaning_standard)}
								</p>
								{#if row.created_object}
									<p class="mt-2 text-xs text-[var(--text-soft)]">
										{m.app_admin_client_requests_created_object()}: #{row.created_object.id} ·
										{row.created_object.address}
									</p>
								{/if}
							</article>
						{/each}
					</div>
				{/if}

				<div class="mt-8 border-t border-[var(--border)] pt-6">
					<h3 class="text-base font-semibold">{m.app_client_feedback_title_secondary()}</h3>
					<p class="mt-1 text-sm text-[var(--text-soft)]">
						{m.app_client_feedback_body_secondary()}
					</p>
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
											{#each [0, 1, 2, 3, 4] as i (i)}
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
				</div>
			</section>
		{/if}
	{/if}
</main>
