<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onDestroy, onMount } from 'svelte';
	import AppIcon from '$lib/components/ui/AppIcon.svelte';
	import FlashMessage from '$lib/components/ui/FlashMessage.svelte';
	import MetricCard from '$lib/components/ui/MetricCard.svelte';
	import SparklineChart from '$lib/components/ui/SparklineChart.svelte';
	import { ROUTES, routeHref } from '$lib/constants/routes';
	import { ui } from '$lib/constants/ui';
	import { m } from '$lib/paraglide/messages.js';
	import {
		adminCreateChecklistTemplate,
		adminCreateObject,
		adminCreateRoom,
		adminCreateTask,
		adminCreateUser,
		adminDeleteCompany,
		adminGetAnalyticsAICost,
		adminGetAnalyticsQuality,
		adminGetAnalyticsSync,
		adminGetCompany,
		adminGetChecklistTemplates,
		adminGetEfficiency,
		adminGetObjectsStatus,
		adminPatchChecklistTemplate,
		adminPatchObjectCleaningStandard,
		adminPatchCompany,
		adminPatchObjectLocation,
		cleanerGetTaskAiRating,
		cleanerGetTaskChecklist,
		cleanerCompleteTask,
		cleanerGetTasks,
		cleanerPatchTaskChecklist,
		cleanerStartTask,
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
		type AdminEfficiencyRow,
		type ChecklistTemplateRow,
		type CleanerTaskFilters,
		type CleanerTaskRow,
		type ClientFeedbackObject,
		type ClientFeedbackRow,
		type Company,
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

	let company = $state<Company | null>(null);
	let companyNameDraft = $state('');

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

	let checklistTemplates = $state<ChecklistTemplateRow[]>([]);
	let selectedTemplateId = $state('');

	let userForm = $state({
		name: '',
		email: '',
		role: 'cleaner' as UserRole,
		password: ''
	});

	let objectForm = $state({
		address: '',
		description: ''
	});

	let roomForm = $state({
		objectId: '',
		type: 'office' as 'office' | 'bathroom' | 'corridor',
		areaSqm: ''
	});

	let taskForm = $state({
		roomId: '',
		cleanerId: ''
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
		geofenceRadiusMeters: '100',
		cleaningStandard: 'appa_2'
	});

	let checklistTemplateForm = $state({
		roomType: 'office' as 'office' | 'bathroom' | 'corridor',
		cleaningStandard: 'appa_2',
		version: '1',
		itemsRaw: '[]'
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
		const [companyPayload, objectsPayload, efficiencyPayload, pendingPayload] = await Promise.all([
			adminGetCompany(token),
			adminGetObjectsStatus(token),
			adminGetEfficiency(token),
			inspectionsGetPending(token)
		]);
		company = companyPayload;
		companyNameDraft = companyPayload.name;
		objectsStatus = objectsPayload;
		efficiency = efficiencyPayload;
		inspectionsPending = pendingPayload;
		if (!inspectionForm.taskId && pendingPayload.length) {
			inspectionForm.taskId = String(pendingPayload[0].task.id);
		}
		if (!objectSettingsForm.objectId && objectsPayload.length) {
			objectSettingsForm.objectId = String(objectsPayload[0].objectId);
		}

		const settled = await Promise.allSettled([
			adminGetChecklistTemplates(token),
			adminGetAnalyticsQuality(token),
			adminGetAnalyticsSync(token),
			adminGetAnalyticsAICost(token),
			inspectionsGetAnalyticsQuality(token),
			inspectionsGetAnalyticsGeofence(token),
			inspectionsGetAnalyticsSync(token)
		]);
		if (settled[0].status === 'fulfilled') {
			checklistTemplates = settled[0].value;
			if (!selectedTemplateId && settled[0].value.length) {
				selectedTemplateId = String(settled[0].value[0].id);
			}
		}
		if (settled[1].status === 'fulfilled') adminQualityAnalytics = settled[1].value;
		if (settled[2].status === 'fulfilled') adminSyncAnalytics = settled[2].value;
		if (settled[3].status === 'fulfilled') adminAICostAnalytics = settled[3].value;
		if (settled[4].status === 'fulfilled') supervisorQualityAnalytics = settled[4].value;
		if (settled[5].status === 'fulfilled') supervisorGeofenceAnalytics = settled[5].value;
		if (settled[6].status === 'fulfilled') supervisorSyncAnalytics = settled[6].value;
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
			await adminCreateUser(tokenOrThrow(), {
				name: userForm.name.trim(),
				email: userForm.email.trim(),
				role: userForm.role,
				password: userForm.password
			});
			userForm = { name: '', email: '', role: 'cleaner', password: '' };
			success = m.app_success_user_created();
		});
	}

	async function onCreateObject(event: SubmitEvent) {
		event.preventDefault();
		await withAction(async () => {
			await adminCreateObject(tokenOrThrow(), {
				address: objectForm.address.trim(),
				description: objectForm.description.trim() || undefined
			});
			objectForm = { address: '', description: '' };
			objectsStatus = await adminGetObjectsStatus(tokenOrThrow());
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
			success = m.app_success_task_created();
		});
	}

	async function onLoadCompany() {
		await withAction(async () => {
			company = await adminGetCompany(tokenOrThrow());
			companyNameDraft = company.name;
			success = m.app_success_company_loaded();
		});
	}

	async function onUpdateCompany(event: SubmitEvent) {
		event.preventDefault();
		await withAction(async () => {
			company = await adminPatchCompany(tokenOrThrow(), companyNameDraft.trim());
			success = m.app_success_company_updated();
		});
	}

	async function onDeleteCompany() {
		await withAction(async () => {
			await adminDeleteCompany(tokenOrThrow());
			clearSession();
			await goto(resolve(ROUTES.auth));
		});
	}

	async function onLoadObjects() {
		await withAction(async () => {
			objectsStatus = await adminGetObjectsStatus(tokenOrThrow());
			success = m.app_success_objects_loaded();
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

	async function onUpdateObjectStandard(event: SubmitEvent) {
		event.preventDefault();
		await withAction(async () => {
			await adminPatchObjectCleaningStandard(
				tokenOrThrow(),
				Number(objectSettingsForm.objectId),
				objectSettingsForm.cleaningStandard.trim()
			);
			success = m.app_success_object_standard_updated();
		});
	}

	async function onLoadChecklistTemplates() {
		await withAction(async () => {
			checklistTemplates = await adminGetChecklistTemplates(tokenOrThrow());
			if (!selectedTemplateId && checklistTemplates.length) {
				selectedTemplateId = String(checklistTemplates[0].id);
			}
			success = m.app_success_templates_loaded();
		});
	}

	async function onCreateChecklistTemplate(event: SubmitEvent) {
		event.preventDefault();
		await withAction(async () => {
			const created = await adminCreateChecklistTemplate(tokenOrThrow(), {
				room_type: checklistTemplateForm.roomType,
				cleaning_standard: checklistTemplateForm.cleaningStandard.trim(),
				version: Number(checklistTemplateForm.version),
				items: parseChecklistItems(checklistTemplateForm.itemsRaw)
			});
			checklistTemplates = [created, ...checklistTemplates];
			selectedTemplateId = String(created.id);
			success = m.app_success_template_created();
		});
	}

	async function onUpdateChecklistTemplate(event: SubmitEvent) {
		event.preventDefault();
		await withAction(async () => {
			if (!selectedTemplateId) throw new Error(m.app_error_select_template_first());
			const updated = await adminPatchChecklistTemplate(
				tokenOrThrow(),
				Number(selectedTemplateId),
				{
					version: Number(checklistTemplateForm.version),
					items: parseChecklistItems(checklistTemplateForm.itemsRaw)
				}
			);
			checklistTemplates = checklistTemplates.map((item) =>
				item.id === updated.id ? updated : item
			);
			success = m.app_success_template_updated();
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
					<h1 class="flex items-center gap-2 text-3xl font-extrabold sm:text-4xl">
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
				<div class="flex gap-2">
					<button type="button" class={ui.secondaryButton} onclick={refreshAll} disabled={loading}>
						<AppIcon name="refresh" class="h-4 w-4" />
						{m.app_refresh()}
					</button>
					{#if currentSession.user.role === 'admin' || currentSession.user.role === 'supervisor'}
						<button
							type="button"
							class={ui.secondaryButton}
							onclick={onRefreshAnalytics}
							disabled={loading}
						>
							<AppIcon name="star" class="h-4 w-4" />
							{m.app_analytics_refresh()}
						</button>
					{/if}
					<button type="button" class={ui.primaryButton} onclick={onLogout}>
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
					<div class="mt-4 flex flex-wrap gap-2">
						<button
							type="button"
							onclick={onLoadCompany}
							class={ui.secondaryButton}
							disabled={loading}
						>
							<AppIcon name="refresh" class="h-4 w-4" />
							{m.app_admin_company_load()}
						</button>
					</div>
					<form class="mt-4 grid gap-3 sm:max-w-xl" onsubmit={onUpdateCompany}>
						<label class={ui.label}>
							<span class="label-title">
								<AppIcon name="building" class="h-4 w-4" />
								{m.app_admin_company_name_label()}
							</span>
							<div class={ui.inputWithIcon}>
								<AppIcon name="building" class={ui.inputIcon} />
								<input required type="text" bind:value={companyNameDraft} class={ui.inputPadded} />
							</div>
						</label>
						<div class="flex flex-wrap gap-2">
							<button type="submit" disabled={loading} class={ui.primaryButton}>
								<AppIcon name="check-circle" class="h-4 w-4" />
								{m.app_admin_company_update()}
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
					</form>
				</section>

				<section id="admin-users" class={ui.panel}>
					<h2 class={ui.sectionTitle}>
						<AppIcon name="users" class="h-5 w-5 text-[var(--brand)]" />
						{m.app_admin_users_title()}
					</h2>
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
							<div class={ui.inputWithIcon}>
								<AppIcon name="map-pin" class={ui.inputIcon} />
								<input
									required
									bind:value={objectForm.address}
									type="text"
									class={ui.inputPadded}
								/>
							</div>
						</label>
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
					<div class={ui.tableWrap}>
						<table class={ui.table}>
							<thead class="text-left text-[var(--text-soft)]">
								<tr>
									<th class="py-2 pr-4">{m.app_admin_object_id_label()}</th>
									<th class="py-2 pr-4">{m.app_admin_object_address_label()}</th>
									<th class="py-2 pr-4">{m.app_admin_object_description_label()}</th>
									<th class="py-2 pr-4">{m.app_admin_objects_total_tasks()}</th>
									<th class="py-2 pr-4">{m.app_admin_objects_pending_tasks()}</th>
									<th class="py-2 pr-4">{m.app_admin_objects_in_progress_tasks()}</th>
									<th class="py-2 pr-4">{m.app_admin_objects_completed_tasks()}</th>
								</tr>
							</thead>
							<tbody>
								{#if objectsStatus.length === 0}
									<tr>
										<td colspan="7" class="py-3 text-[var(--text-soft)]">{m.app_empty_objects()}</td
										>
									</tr>
								{:else}
									{#each objectsStatus as item (item.objectId)}
										<tr class="border-t border-[var(--border)]">
											<td class="py-2 pr-4">{item.objectId}</td>
											<td class="py-2 pr-4">{item.address}</td>
											<td class="py-2 pr-4">{item.description || '—'}</td>
											<td class="py-2 pr-4">{item.totalTasks}</td>
											<td class="py-2 pr-4">{item.pendingTasks}</td>
											<td class="py-2 pr-4">{item.inProgressTasks}</td>
											<td class="py-2 pr-4">{item.completedTasks}</td>
										</tr>
									{/each}
								{/if}
							</tbody>
						</table>
					</div>
				</section>

				<section id="admin-object-settings" class={ui.panel}>
					<h2 class={ui.sectionTitle}>
						<AppIcon name="map-pin" class="h-5 w-5 text-[var(--brand)]" />
						{m.app_admin_object_settings_title()}
					</h2>
					<p class="mt-2 text-sm text-[var(--text-soft)]">
						{m.app_admin_object_settings_desc()}
					</p>
					<form class="mt-4 grid gap-3 md:grid-cols-4" onsubmit={onUpdateObjectLocation}>
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
							<span>{m.app_admin_object_settings_latitude_label()}</span>
							<input
								type="number"
								step="0.00000001"
								bind:value={objectSettingsForm.latitude}
								class={ui.input}
								required
							/>
						</label>
						<label class={ui.label}>
							<span>{m.app_admin_object_settings_longitude_label()}</span>
							<input
								type="number"
								step="0.00000001"
								bind:value={objectSettingsForm.longitude}
								class={ui.input}
								required
							/>
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
						<div class="md:col-span-4">
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
					<form
						class="mt-4 grid gap-3 md:grid-cols-[1fr_220px_auto]"
						onsubmit={onUpdateObjectStandard}
					>
						<label class={ui.label}>
							<span>{m.app_admin_object_settings_standard_label()}</span>
							<input
								type="text"
								bind:value={objectSettingsForm.cleaningStandard}
								class={ui.input}
								placeholder={m.app_admin_object_settings_standard_placeholder()}
								required
							/>
						</label>
						<div class="hidden md:block"></div>
						<div class="md:self-end">
							<button
								type="submit"
								class={ui.secondaryButton}
								disabled={loading || !objectSettingsForm.objectId}
							>
								<AppIcon name="checklist" class="h-4 w-4" />
								{m.app_admin_object_settings_update_standard()}
							</button>
						</div>
					</form>
				</section>

				<section id="admin-checklist-templates" class={ui.panel}>
					<div class="flex flex-wrap items-center justify-between gap-2">
						<h2 class={ui.sectionTitle}>
							<AppIcon name="checklist" class="h-5 w-5 text-[var(--brand)]" />
							{m.app_admin_templates_title()}
						</h2>
						<button
							type="button"
							class={ui.secondaryButton}
							onclick={onLoadChecklistTemplates}
							disabled={loading}
						>
							<AppIcon name="refresh" class="h-4 w-4" />
							{m.app_admin_templates_load()}
						</button>
					</div>
					<form class="mt-4 grid gap-3 md:grid-cols-4" onsubmit={onCreateChecklistTemplate}>
						<label class={ui.label}>
							<span>{m.app_admin_templates_room_type_label()}</span>
							<select bind:value={checklistTemplateForm.roomType} class={ui.input}>
								<option value="office">{m.room_type_office()}</option>
								<option value="bathroom">{m.room_type_bathroom()}</option>
								<option value="corridor">{m.room_type_corridor()}</option>
							</select>
						</label>
						<label class={ui.label}>
							<span>{m.app_admin_templates_standard_label()}</span>
							<input bind:value={checklistTemplateForm.cleaningStandard} class={ui.input} />
						</label>
						<label class={ui.label}>
							<span>{m.app_admin_templates_version_label()}</span>
							<input
								type="number"
								min="1"
								bind:value={checklistTemplateForm.version}
								class={ui.input}
							/>
						</label>
						<div class="md:self-end">
							<button type="submit" class={ui.primaryButton} disabled={loading}>
								<AppIcon name="plus" class="h-4 w-4" />
								{m.app_admin_templates_create()}
							</button>
						</div>
						<label class={`${ui.label} md:col-span-4`}>
							<span>{m.app_admin_templates_items_json_label()}</span>
							<textarea bind:value={checklistTemplateForm.itemsRaw} class={ui.textarea}></textarea>
						</label>
					</form>
					<form
						class="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"
						onsubmit={onUpdateChecklistTemplate}
					>
						<label class={ui.label}>
							<span>{m.app_admin_templates_selected_label()}</span>
							<select bind:value={selectedTemplateId} class={ui.input}>
								<option value="" disabled>{m.app_admin_templates_select()}</option>
								{#each checklistTemplates as template (template.id)}
									<option value={String(template.id)}>
										#{template.id} · {roomTypeLabel(template.room_type)} · {template.cleaning_standard}
										· v{template.version}
									</option>
								{/each}
							</select>
						</label>
						<div class="md:self-end">
							<button
								type="submit"
								class={ui.secondaryButton}
								disabled={loading || !selectedTemplateId}
							>
								<AppIcon name="check-circle" class="h-4 w-4" />
								{m.app_admin_templates_update_selected()}
							</button>
						</div>
					</form>
					{#if checklistTemplates.length > 0}
						<div class={ui.tableWrap}>
							<table class={ui.table}>
								<thead>
									<tr>
										<th>{m.app_table_id()}</th>
										<th>{m.app_admin_templates_col_room()}</th>
										<th>{m.app_admin_templates_col_standard()}</th>
										<th>{m.app_admin_templates_col_version()}</th>
										<th>{m.app_admin_templates_col_items()}</th>
									</tr>
								</thead>
								<tbody>
									{#each checklistTemplates as template (template.id)}
										<tr>
											<td>{template.id}</td>
											<td>{roomTypeLabel(template.room_type)}</td>
											<td>{template.cleaning_standard}</td>
											<td>{template.version}</td>
											<td>{template.items.length}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</section>

				<section id="admin-rooms" class={ui.panel}>
					<h2 class={ui.sectionTitle}>
						<AppIcon name="building" class="h-5 w-5 text-[var(--brand)]" />
						{m.app_admin_rooms_title()}
					</h2>
					<form class="mt-4 grid gap-3 md:grid-cols-3" onsubmit={onCreateRoom}>
						<label class={ui.label}>
							<span class="label-title">
								<AppIcon name="building" class="h-4 w-4" />
								{m.app_admin_room_object_id_label()}
							</span>
							<input
								required
								type="number"
								min="1"
								bind:value={roomForm.objectId}
								class={ui.input}
							/>
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
				</section>

				<section id="admin-tasks" class={ui.panel}>
					<h2 class={ui.sectionTitle}>
						<AppIcon name="checklist" class="h-5 w-5 text-[var(--brand)]" />
						{m.app_admin_tasks_title()}
					</h2>
					<form class="mt-4 grid gap-3 md:grid-cols-2" onsubmit={onCreateTask}>
						<label class={ui.label}>
							<span class="label-title">
								<AppIcon name="building" class="h-4 w-4" />
								{m.app_admin_task_room_id_label()}
							</span>
							<input required type="number" min="1" bind:value={taskForm.roomId} class={ui.input} />
						</label>
						<label class={ui.label}>
							<span class="label-title">
								<AppIcon name="user" class="h-4 w-4" />
								{m.app_admin_task_cleaner_id_label()}
							</span>
							<input
								required
								type="number"
								min="1"
								bind:value={taskForm.cleanerId}
								class={ui.input}
							/>
						</label>
						<div class="md:col-span-2">
							<button type="submit" disabled={loading} class={ui.primaryButton}>
								<AppIcon name="plus" class="h-4 w-4" />
								{m.app_admin_tasks_create()}
							</button>
						</div>
					</form>
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
						<button type="submit" disabled={loading} class={ui.secondaryButton}>
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
															<span class="text-sm font-medium">{item.title}</span>
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

				<div class={ui.tableWrap}>
					<table class={ui.table}>
						<thead class="text-left text-[var(--text-soft)]">
							<tr>
								<th class="py-2 pr-4">{m.app_inspection_task_id_label()}</th>
								<th class="py-2 pr-4">{m.app_inspections_room()}</th>
								<th class="py-2 pr-4">{m.app_inspections_object()}</th>
								<th class="py-2 pr-4">{m.app_inspections_status()}</th>
								<th class="py-2 pr-4">{m.app_inspections_ai_score()}</th>
								<th class="py-2 pr-4">{m.app_inspections_ai_actions()}</th>
							</tr>
						</thead>
						<tbody>
							{#if inspectionsPending.length === 0}
								<tr>
									<td colspan="6" class="py-3 text-[var(--text-soft)]"
										>{m.app_empty_inspections()}</td
									>
								</tr>
							{:else}
								{#each inspectionsPending as row (row.task.id)}
									<tr class="border-t border-[var(--border)]">
										<td class="py-2 pr-4">{row.task.id}</td>
										<td class="py-2 pr-4">
											{row.room.id} · {roomTypeLabel(row.room.type)} · {row.room.area_sqm}
										</td>
										<td class="py-2 pr-4">{row.object.address}</td>
										<td class="py-2 pr-4">{taskStatusLabel(row.task.status)}</td>
										<td class="py-2 pr-4"
											>{aiRatingsByTask[row.task.id]?.ai_score ?? m.app_value_na()}</td
										>
										<td class="py-2 pr-4">
											<button
												type="button"
												class={ui.ghostButton}
												disabled={loading}
												onclick={() => onRunTaskAiRating(row.task.id)}
											>
												<AppIcon name="sparkles" class="h-4 w-4" />
												{m.app_action_rerun()}
											</button>
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>
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

				<div class={ui.tableWrap}>
					<table class={ui.table}>
						<thead class="text-left text-[var(--text-soft)]">
							<tr>
								<th class="py-2 pr-4">{m.app_table_id()}</th>
								<th class="py-2 pr-4">{m.app_client_feedback_object_label()}</th>
								<th class="py-2 pr-4">{m.app_client_feedback_rating_label()}</th>
								<th class="py-2 pr-4">{m.app_client_feedback_text_label()}</th>
								<th class="py-2 pr-4">{m.app_client_feedback_actions_label()}</th>
							</tr>
						</thead>
						<tbody>
							{#if clientFeedbackRows.length === 0}
								<tr>
									<td colspan="5" class="py-3 text-[var(--text-soft)]">
										{m.app_empty_client_feedback()}
									</td>
								</tr>
							{:else}
								{#each clientFeedbackRows as row (row.feedback.id)}
									<tr class="border-t border-[var(--border)]">
										<td class="py-2 pr-4">{row.feedback.id}</td>
										<td class="py-2 pr-4">{row.object.address}</td>
										<td class="w-28 py-2 pr-4">
											<input
												type="number"
												min="1"
												max="5"
												bind:value={feedbackDrafts[row.feedback.id].rating}
												class={ui.input}
											/>
										</td>
										<td class="min-w-64 py-2 pr-4">
											<input
												type="text"
												bind:value={feedbackDrafts[row.feedback.id].text}
												class={ui.input}
											/>
										</td>
										<td class="py-2 pr-4">
											<div class="flex flex-wrap gap-2">
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
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>
			</section>
		{/if}
	{/if}
</main>
