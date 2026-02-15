<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onDestroy, onMount } from 'svelte';
	import FlashMessage from '$lib/components/ui/FlashMessage.svelte';
	import { ROUTES, routeHref } from '$lib/constants/routes';
	import { ui } from '$lib/constants/ui';
	import { m } from '$lib/paraglide/messages.js';
	import {
		adminCreateObject,
		adminCreateRoom,
		adminCreateTask,
		adminCreateUser,
		adminDeleteCompany,
		adminGetCompany,
		adminGetEfficiency,
		adminGetObjectsStatus,
		adminPatchCompany,
		cleanerCompleteTask,
		cleanerGetTasks,
		cleanerStartTask,
		feedbackCreate,
		feedbackDelete,
		feedbackGetMy,
		feedbackUpdate,
		inspectionsCreate,
		inspectionsGetPending,
		type AdminEfficiencyRow,
		type CleanerTaskFilters,
		type CleanerTaskRow,
		type ClientFeedbackRow,
		type Company,
		type ObjectStatusRow,
		type PendingInspectionRow,
		type UserRole
	} from '$lib/api';
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

	let clientFeedbackRows = $state<ClientFeedbackRow[]>([]);
	const feedbackDrafts: Record<number, { rating: string; text: string }> = $state({});

	const beforeFiles: Record<number, File | null> = $state({});
	const afterFiles: Record<number, File | null> = $state({});

	let unsubscribe: (() => void) | null = null;

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
	}

	async function loadCleanerData() {
		const token = tokenOrThrow();
		cleanerTasks = await cleanerGetTasks(token, activeCleanerFilters());
	}

	async function loadSupervisorData() {
		const token = tokenOrThrow();
		inspectionsPending = await inspectionsGetPending(token);
	}

	async function loadClientData() {
		const token = tokenOrThrow();
		clientFeedbackRows = await feedbackGetMy(token);
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
			success = m.app_success_cleaner_tasks_loaded();
		});
	}

	async function onStartCleanerTask(taskId: number) {
		await withAction(async () => {
			await cleanerStartTask(tokenOrThrow(), taskId, beforeFiles[taskId]);
			cleanerTasks = await cleanerGetTasks(tokenOrThrow(), activeCleanerFilters());
			success = m.app_success_task_started();
		});
	}

	async function onCompleteCleanerTask(taskId: number) {
		await withAction(async () => {
			await cleanerCompleteTask(tokenOrThrow(), taskId, afterFiles[taskId]);
			cleanerTasks = await cleanerGetTasks(tokenOrThrow(), activeCleanerFilters());
			success = m.app_success_task_completed();
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
			if (!currentSession) {
				await goto(resolve(ROUTES.auth));
				return;
			}
			await refreshByRole();
		});
	});

	onDestroy(() => {
		if (unsubscribe) unsubscribe();
	});
</script>

<svelte:head>
	<title>{m.app_title()}</title>
</svelte:head>

<main class="mx-auto max-w-6xl px-4 pt-8 pb-14 sm:px-6 lg:px-10">
	{#if !currentSession}
		<section
			class="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-8 shadow-[var(--shadow)]"
		>
			<h1 class="text-2xl font-extrabold">{m.app_not_authenticated_title()}</h1>
			<p class="mt-2 text-[var(--text-soft)]">{m.app_not_authenticated_body()}</p>
			<a
				class="mt-5 inline-flex rounded-xl bg-[var(--brand)] px-5 py-2.5 font-semibold text-white"
				href={resolve(routeHref(ROUTES.auth))}
			>
				{m.app_not_authenticated_cta()}
			</a>
		</section>
	{:else}
		<section class={ui.panelSm}>
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 class="text-3xl font-extrabold sm:text-4xl">{m.app_heading()}</h1>
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
						{m.app_refresh()}
					</button>
					<button type="button" class={ui.primaryButton} onclick={onLogout}>
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
				<section class={ui.panel}>
					<h2 class="text-2xl font-bold">{m.app_admin_company_title()}</h2>
					<div class="mt-4 flex flex-wrap gap-2">
						<button
							type="button"
							onclick={onLoadCompany}
							class={ui.secondaryButton}
							disabled={loading}
						>
							{m.app_admin_company_load()}
						</button>
					</div>
					<form class="mt-4 grid gap-3 sm:max-w-xl" onsubmit={onUpdateCompany}>
						<label class={ui.label}>
							<span>{m.app_admin_company_name_label()}</span>
							<input required type="text" bind:value={companyNameDraft} class={ui.input} />
						</label>
						<div class="flex flex-wrap gap-2">
							<button type="submit" disabled={loading} class={ui.primaryButton}>
								{m.app_admin_company_update()}
							</button>
							<button
								type="button"
								disabled={loading}
								onclick={onDeleteCompany}
								class="rounded-xl border border-red-300 bg-red-50 px-4 py-2 font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
							>
								{m.app_admin_company_delete()}
							</button>
						</div>
					</form>
				</section>

				<section class={ui.panel}>
					<h2 class="text-2xl font-bold">{m.app_admin_users_title()}</h2>
					<form class="mt-4 grid gap-3 md:grid-cols-2" onsubmit={onCreateUser}>
						<label class={ui.label}>
							<span>{m.app_name_label()}</span>
							<input required bind:value={userForm.name} type="text" class={ui.input} />
						</label>
						<label class={ui.label}>
							<span>{m.app_email_label()}</span>
							<input required bind:value={userForm.email} type="email" class={ui.input} />
						</label>
						<label class={ui.label}>
							<span>{m.app_role_label()}</span>
							<select bind:value={userForm.role} class={ui.input}>
								<option value="admin">{m.role_admin()}</option>
								<option value="supervisor">{m.role_supervisor()}</option>
								<option value="cleaner">{m.role_cleaner()}</option>
								<option value="client">{m.role_client()}</option>
							</select>
						</label>
						<label class={ui.label}>
							<span>{m.auth_password_label()}</span>
							<input required bind:value={userForm.password} type="password" class={ui.input} />
						</label>
						<div class="md:col-span-2">
							<button type="submit" disabled={loading} class={ui.primaryButton}>
								{m.app_admin_users_create()}
							</button>
						</div>
					</form>
				</section>

				<section class={ui.panel}>
					<h2 class="text-2xl font-bold">{m.app_admin_objects_title()}</h2>
					<form class="mt-4 grid gap-3 md:grid-cols-2" onsubmit={onCreateObject}>
						<label class={`${ui.label} md:col-span-2`}>
							<span>{m.app_admin_object_address_label()}</span>
							<input required bind:value={objectForm.address} type="text" class={ui.input} />
						</label>
						<label class={`${ui.label} md:col-span-2`}>
							<span>{m.app_admin_object_description_label()}</span>
							<input bind:value={objectForm.description} type="text" class={ui.input} />
						</label>
						<div class="flex flex-wrap gap-2 md:col-span-2">
							<button type="submit" disabled={loading} class={ui.primaryButton}>
								{m.app_admin_objects_create()}
							</button>
							<button
								type="button"
								disabled={loading}
								onclick={onLoadObjects}
								class={ui.secondaryButton}
							>
								{m.app_admin_objects_fetch()}
							</button>
						</div>
					</form>
					<div class="mt-4 overflow-x-auto">
						<table class="min-w-full text-sm">
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

				<section class={ui.panel}>
					<h2 class="text-2xl font-bold">{m.app_admin_rooms_title()}</h2>
					<form class="mt-4 grid gap-3 md:grid-cols-3" onsubmit={onCreateRoom}>
						<label class={ui.label}>
							<span>{m.app_admin_room_object_id_label()}</span>
							<input
								required
								type="number"
								min="1"
								bind:value={roomForm.objectId}
								class={ui.input}
							/>
						</label>
						<label class={ui.label}>
							<span>{m.app_admin_room_type_label()}</span>
							<select bind:value={roomForm.type} class={ui.input}>
								<option value="office">{m.room_type_office()}</option>
								<option value="bathroom">{m.room_type_bathroom()}</option>
								<option value="corridor">{m.room_type_corridor()}</option>
							</select>
						</label>
						<label class={ui.label}>
							<span>{m.app_admin_room_area_label()}</span>
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
								{m.app_admin_rooms_create()}
							</button>
						</div>
					</form>
				</section>

				<section class={ui.panel}>
					<h2 class="text-2xl font-bold">{m.app_admin_tasks_title()}</h2>
					<form class="mt-4 grid gap-3 md:grid-cols-2" onsubmit={onCreateTask}>
						<label class={ui.label}>
							<span>{m.app_admin_task_room_id_label()}</span>
							<input required type="number" min="1" bind:value={taskForm.roomId} class={ui.input} />
						</label>
						<label class={ui.label}>
							<span>{m.app_admin_task_cleaner_id_label()}</span>
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
								{m.app_admin_tasks_create()}
							</button>
						</div>
					</form>
				</section>

				<section class={ui.panel}>
					<h2 class="text-2xl font-bold">{m.app_admin_analytics_title()}</h2>
					<div class="mt-3">
						<button
							type="button"
							disabled={loading}
							onclick={onLoadEfficiency}
							class={ui.secondaryButton}
						>
							{m.app_admin_analytics_fetch()}
						</button>
					</div>
					<div class="mt-4 overflow-x-auto">
						<table class="min-w-full text-sm">
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
			</div>
		{/if}

		{#if currentSession.user.role === 'cleaner'}
			<section class={`mt-6 ${ui.panel}`}>
				<h2 class="text-2xl font-bold">{m.app_cleaner_title()}</h2>
				<form
					class="mt-3 grid gap-3 md:grid-cols-4"
					onsubmit={(event) => {
						event.preventDefault();
						void onLoadCleanerTasks();
					}}
				>
					<label class={ui.label}>
						<span>{m.app_cleaner_filter_status_label()}</span>
						<select bind:value={cleanerFilters.status} class={ui.input}>
							<option value="">{m.app_cleaner_filter_any_status()}</option>
							<option value="pending">pending</option>
							<option value="in_progress">in_progress</option>
							<option value="completed">completed</option>
						</select>
					</label>
					<label class={ui.label}>
						<span>{m.app_cleaner_filter_date_from_label()}</span>
						<input type="date" bind:value={cleanerFilters.date_from} class={ui.input} />
					</label>
					<label class={ui.label}>
						<span>{m.app_cleaner_filter_date_to_label()}</span>
						<input type="date" bind:value={cleanerFilters.date_to} class={ui.input} />
					</label>
					<div class="flex items-end">
						<button type="submit" disabled={loading} class={ui.secondaryButton}>
							{m.app_cleaner_fetch()}
						</button>
					</div>
				</form>

				{#if cleanerTasks.length === 0}
					<p class="mt-4 text-[var(--text-soft)]">{m.app_empty_cleaner_tasks()}</p>
				{:else}
					<div class="mt-4 grid gap-4">
						{#each cleanerTasks as row (row.task.id)}
							<article class="rounded-2xl border border-[var(--border)] p-4">
								<p class="text-sm text-[var(--text-soft)]">
									{m.app_cleaner_task_id({ id: String(row.task.id) })}
								</p>
								<p class="mt-1 font-semibold">
									{m.app_cleaner_task_status({ status: row.task.status })}
								</p>
								<p class="text-sm text-[var(--text-soft)]">
									{m.app_cleaner_task_room({
										room: String(row.room.id),
										type: row.room.type,
										area: String(row.room.area_sqm)
									})}
								</p>
								<p class="text-sm text-[var(--text-soft)]">
									{m.app_cleaner_task_object({ address: row.object.address })}
								</p>

								<div class="mt-3 grid gap-2 md:grid-cols-2">
									<label class={ui.label}>
										<span>{m.app_cleaner_photo_before()}</span>
										<input
											type="file"
											accept="image/*"
											onchange={(event) => {
												const input = event.currentTarget as HTMLInputElement;
												beforeFiles[row.task.id] = input.files?.[0] || null;
											}}
										/>
									</label>
									<label class={ui.label}>
										<span>{m.app_cleaner_photo_after()}</span>
										<input
											type="file"
											accept="image/*"
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
										class="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)] disabled:opacity-60"
									>
										{m.app_cleaner_start()}
									</button>
									<button
										type="button"
										disabled={loading}
										onclick={() => onCompleteCleanerTask(row.task.id)}
										class="rounded-xl border border-[var(--border)] bg-[var(--bg-muted)] px-4 py-2 text-sm font-semibold transition hover:bg-[var(--bg-elevated)] disabled:opacity-60"
									>
										{m.app_cleaner_complete()}
									</button>
								</div>
							</article>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		{#if currentSession.user.role === 'supervisor' || currentSession.user.role === 'admin'}
			<section class={`mt-6 ${ui.panel}`}>
				<h2 class="text-2xl font-bold">{m.app_inspections_title()}</h2>
				<div class="mt-3">
					<button
						type="button"
						disabled={loading}
						onclick={onLoadInspections}
						class={ui.secondaryButton}
					>
						{m.app_inspections_fetch()}
					</button>
				</div>

				<form class="mt-4 grid gap-3 md:grid-cols-3" onsubmit={onCreateInspection}>
					<label class={ui.label}>
						<span>{m.app_inspection_task_id_label()}</span>
						<input
							required
							type="number"
							min="1"
							bind:value={inspectionForm.taskId}
							class={ui.input}
						/>
					</label>
					<label class={ui.label}>
						<span>{m.app_inspection_score_label()}</span>
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
						<span>{m.app_inspection_comment_label()}</span>
						<input type="text" bind:value={inspectionForm.comment} class={ui.input} />
					</label>
					<div class="md:col-span-3">
						<button type="submit" disabled={loading} class={ui.primaryButton}>
							{m.app_inspection_create()}
						</button>
					</div>
				</form>

				<div class="mt-4 overflow-x-auto">
					<table class="min-w-full text-sm">
						<thead class="text-left text-[var(--text-soft)]">
							<tr>
								<th class="py-2 pr-4">{m.app_inspection_task_id_label()}</th>
								<th class="py-2 pr-4">{m.app_inspections_room()}</th>
								<th class="py-2 pr-4">{m.app_inspections_object()}</th>
								<th class="py-2 pr-4">{m.app_inspections_status()}</th>
							</tr>
						</thead>
						<tbody>
							{#if inspectionsPending.length === 0}
								<tr>
									<td colspan="4" class="py-3 text-[var(--text-soft)]"
										>{m.app_empty_inspections()}</td
									>
								</tr>
							{:else}
								{#each inspectionsPending as row (row.task.id)}
									<tr class="border-t border-[var(--border)]">
										<td class="py-2 pr-4">{row.task.id}</td>
										<td class="py-2 pr-4">
											{row.room.id} · {row.room.type} · {row.room.area_sqm}
										</td>
										<td class="py-2 pr-4">{row.object.address}</td>
										<td class="py-2 pr-4">{row.task.status}</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>
			</section>
		{/if}

		{#if currentSession.user.role === 'client'}
			<section class={`mt-6 ${ui.panel}`}>
				<h2 class="text-2xl font-bold">{m.app_client_title()}</h2>
				<p class="mt-2 text-[var(--text-soft)]">{m.app_client_body()}</p>
				<div class="mt-3">
					<button
						type="button"
						disabled={loading}
						onclick={onLoadClientFeedback}
						class={ui.secondaryButton}
					>
						{m.app_client_feedback_fetch()}
					</button>
				</div>

				<form class="mt-4 grid gap-3 md:grid-cols-3" onsubmit={onCreateClientFeedback}>
					<label class={ui.label}>
						<span>{m.app_client_feedback_object_id_label()}</span>
						<input
							required
							type="number"
							min="1"
							bind:value={feedbackForm.objectId}
							class={ui.input}
						/>
					</label>
					<label class={ui.label}>
						<span>{m.app_client_feedback_rating_label()}</span>
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
						<span>{m.app_client_feedback_text_label()}</span>
						<input type="text" bind:value={feedbackForm.text} class={ui.input} />
					</label>
					<div class="md:col-span-3">
						<button type="submit" disabled={loading} class={ui.primaryButton}>
							{m.app_client_feedback_create()}
						</button>
					</div>
				</form>

				<div class="mt-4 overflow-x-auto">
					<table class="min-w-full text-sm">
						<thead class="text-left text-[var(--text-soft)]">
							<tr>
								<th class="py-2 pr-4">ID</th>
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
													{m.app_client_feedback_update()}
												</button>
												<button
													type="button"
													disabled={loading}
													onclick={() => onDeleteClientFeedback(row.feedback.id)}
													class="rounded-xl border border-red-300 bg-red-50 px-4 py-2 font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
												>
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
