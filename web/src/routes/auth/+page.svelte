<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import AppIcon from '$lib/components/ui/AppIcon.svelte';
	import FlashMessage from '$lib/components/ui/FlashMessage.svelte';
	import { ROUTES, roleDashboardRoute, routeHref } from '$lib/constants/routes';
	import { ui } from '$lib/constants/ui';
	import { m } from '$lib/paraglide/messages.js';
	import { getApiBaseUrl, login, registerCompany } from '$lib/api';
	import { initSession, readSession, setSession } from '$lib/session';

	const showDevUi = env.PUBLIC_ENABLE_DEV_UI === '1';

	let mode = $state<'register' | 'login'>('register');
	let loading = $state<'register' | 'login' | null>(null);
	let error = $state('');
	let success = $state('');

	let registerForm = $state({
		companyName: '',
		adminName: '',
		email: '',
		password: ''
	});

	let loginForm = $state({
		email: '',
		password: ''
	});

	function selectMode(next: 'register' | 'login') {
		mode = next;
		error = '';
		success = '';
	}

	onMount(() => {
		initSession();
		const existing = readSession();
		if (existing) {
			void goto(resolve(roleDashboardRoute(existing.user.role)));
		}
	});

	async function submitRegister(event: SubmitEvent) {
		event.preventDefault();
		loading = 'register';
		error = '';
		success = '';
		try {
			const result = await registerCompany({
				companyName: registerForm.companyName.trim(),
				adminName: registerForm.adminName.trim(),
				email: registerForm.email.trim(),
				password: registerForm.password
			});
			setSession(result);
			success = m.auth_success_register();
			await goto(resolve(roleDashboardRoute(result.user.role)));
		} catch (err) {
			error = err instanceof Error ? err.message : m.auth_error_generic();
		} finally {
			loading = null;
		}
	}

	async function submitLogin(event: SubmitEvent) {
		event.preventDefault();
		loading = 'login';
		error = '';
		success = '';
		try {
			const result = await login({
				email: loginForm.email.trim(),
				password: loginForm.password
			});
			setSession(result);
			success = m.auth_success_login();
			await goto(resolve(roleDashboardRoute(result.user.role)));
		} catch (err) {
			error = err instanceof Error ? err.message : m.auth_error_generic();
		} finally {
			loading = null;
		}
	}
</script>

<svelte:head>
	<title>{m.auth_title()}</title>
</svelte:head>

<main class={ui.page}>
	<section class={ui.panelSm}>
		<div
			class="inline-flex items-center gap-2 rounded-full bg-[var(--bg-muted)] px-3 py-1 text-sm font-semibold text-[var(--text-soft)]"
		>
			<AppIcon name="building" class="h-4 w-4 text-[var(--brand)]" />
			{m.auth_heading()}
		</div>
		<p class="mt-4 text-base text-[var(--text-soft)] sm:text-lg">{m.auth_subheading()}</p>
		{#if showDevUi}
			<p class="mt-2 text-sm text-[var(--text-soft)]">
				{m.auth_backend_hint({ url: getApiBaseUrl() })}
			</p>
		{/if}
	</section>

	{#if error}
		<FlashMessage kind="error" text={error} />
	{/if}

	{#if success}
		<FlashMessage kind="success" text={success} />
	{/if}

	<div class="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
		<section class={ui.panel}>
			<h2 class={ui.sectionTitle}>
				<AppIcon name="checklist" class="h-5 w-5 text-[var(--brand)]" />
				{m.auth_path_heading()}
			</h2>
			<div class="mt-4 grid gap-3">
				<button
					type="button"
					onclick={() => selectMode('register')}
					class={`rounded-2xl border p-4 text-left transition ${
						mode === 'register'
							? 'border-[var(--brand)] bg-[var(--brand-soft)]/25'
							: 'border-[var(--border)] bg-[var(--bg-muted)] hover:bg-[var(--bg-elevated)]'
					}`}
				>
					<p class="inline-flex items-center gap-2 font-semibold">
						<AppIcon name="plus" class="h-4 w-4 text-[var(--brand)]" />
						{m.auth_path_register_label()}
					</p>
					<p class="mt-1 text-sm text-[var(--text-soft)]">{m.auth_path_register_desc()}</p>
				</button>

				<button
					type="button"
					onclick={() => selectMode('login')}
					class={`rounded-2xl border p-4 text-left transition ${
						mode === 'login'
							? 'border-[var(--brand)] bg-[var(--brand-soft)]/25'
							: 'border-[var(--border)] bg-[var(--bg-muted)] hover:bg-[var(--bg-elevated)]'
					}`}
				>
					<p class="inline-flex items-center gap-2 font-semibold">
						<AppIcon name="log-out" class="h-4 w-4 text-[var(--brand)]" />
						{m.auth_path_login_label()}
					</p>
					<p class="mt-1 text-sm text-[var(--text-soft)]">{m.auth_path_login_desc()}</p>
				</button>

				<a
					href={resolve(routeHref(ROUTES.registerClient))}
					class="rounded-2xl border border-[var(--border)] bg-[var(--bg-muted)] p-4 transition hover:bg-[var(--bg-elevated)]"
				>
					<p class="inline-flex items-center gap-2 font-semibold">
						<AppIcon name="user" class="h-4 w-4 text-[var(--brand)]" />
						{m.auth_path_client_label()}
					</p>
					<p class="mt-1 text-sm text-[var(--text-soft)]">{m.auth_path_client_desc()}</p>
					<p class="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[var(--brand)]">
						{m.auth_path_client_cta()}
						<AppIcon name="arrow-right" class="h-4 w-4" />
					</p>
				</a>
			</div>

			<div class="surface-soft mt-5 p-4">
				<p class="inline-flex items-center gap-2 font-semibold">
					<AppIcon name="sparkles" class="h-4 w-4 text-[var(--brand)]" />
					{m.auth_next_heading()}
				</p>
				<ol class="mt-2 grid gap-1 text-sm text-[var(--text-soft)]">
					<li>{m.auth_next_step_1()}</li>
					<li>{m.auth_next_step_2()}</li>
					<li>{m.auth_next_step_3()}</li>
				</ol>
			</div>
		</section>

		<section class={ui.panel}>
			<div class="inline-flex rounded-xl border border-[var(--border)] bg-[var(--bg-muted)] p-1">
				<button
					type="button"
					onclick={() => selectMode('register')}
					class={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
						mode === 'register'
							? 'bg-[var(--brand)] text-white'
							: 'text-[var(--text-soft)] hover:bg-[var(--bg-elevated)]'
					}`}
				>
					{m.auth_register_title()}
				</button>
				<button
					type="button"
					onclick={() => selectMode('login')}
					class={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
						mode === 'login'
							? 'bg-[var(--brand)] text-white'
							: 'text-[var(--text-soft)] hover:bg-[var(--bg-elevated)]'
					}`}
				>
					{m.auth_login_title()}
				</button>
			</div>

			{#if mode === 'register'}
				<h2 class="mt-5 text-2xl font-bold">{m.auth_register_title()}</h2>
				<p class="mt-2 text-sm text-[var(--text-soft)]">{m.auth_register_body()}</p>
				<form class="mt-5 grid gap-4" onsubmit={submitRegister}>
					<label class={ui.label}>
						<span class="label-title"
							><AppIcon name="building" class="h-4 w-4" />{m.auth_company_name_label()}</span
						>
						<div class={ui.inputWithIcon}>
							<AppIcon name="building" class={ui.inputIcon} />
							<input
								required
								type="text"
								bind:value={registerForm.companyName}
								class={ui.inputPadded}
								placeholder={m.auth_company_name_placeholder()}
							/>
						</div>
					</label>
					<label class={ui.label}>
						<span class="label-title"
							><AppIcon name="user" class="h-4 w-4" />{m.auth_admin_name_label()}</span
						>
						<div class={ui.inputWithIcon}>
							<AppIcon name="user" class={ui.inputIcon} />
							<input
								required
								type="text"
								bind:value={registerForm.adminName}
								class={ui.inputPadded}
								placeholder={m.auth_admin_name_placeholder()}
							/>
						</div>
					</label>
					<label class={ui.label}>
						<span class="label-title"
							><AppIcon name="mail" class="h-4 w-4" />{m.auth_email_label()}</span
						>
						<div class={ui.inputWithIcon}>
							<AppIcon name="mail" class={ui.inputIcon} />
							<input
								required
								type="email"
								bind:value={registerForm.email}
								class={ui.inputPadded}
								placeholder={m.auth_email_placeholder()}
							/>
						</div>
					</label>
					<label class={ui.label}>
						<span class="label-title"
							><AppIcon name="lock" class="h-4 w-4" />{m.auth_password_label()}</span
						>
						<div class={ui.inputWithIcon}>
							<AppIcon name="lock" class={ui.inputIcon} />
							<input
								required
								type="password"
								bind:value={registerForm.password}
								class={ui.inputPadded}
								placeholder={m.auth_password_placeholder()}
							/>
						</div>
					</label>
					<button type="submit" disabled={loading !== null} class={`mt-2 ${ui.primaryButton}`}>
						<AppIcon name="plus" class="h-4 w-4" />
						{loading === 'register' ? m.auth_loading() : m.auth_register_submit()}
					</button>
				</form>
			{:else}
				<h2 class="mt-5 text-2xl font-bold">{m.auth_login_title()}</h2>
				<p class="mt-2 text-sm text-[var(--text-soft)]">{m.auth_login_body()}</p>
				<form class="mt-5 grid gap-4" onsubmit={submitLogin}>
					<label class={ui.label}>
						<span class="label-title"
							><AppIcon name="mail" class="h-4 w-4" />{m.auth_email_label()}</span
						>
						<div class={ui.inputWithIcon}>
							<AppIcon name="mail" class={ui.inputIcon} />
							<input
								required
								type="email"
								bind:value={loginForm.email}
								class={ui.inputPadded}
								placeholder={m.auth_email_placeholder()}
							/>
						</div>
					</label>
					<label class={ui.label}>
						<span class="label-title"
							><AppIcon name="lock" class="h-4 w-4" />{m.auth_password_label()}</span
						>
						<div class={ui.inputWithIcon}>
							<AppIcon name="lock" class={ui.inputIcon} />
							<input
								required
								type="password"
								bind:value={loginForm.password}
								class={ui.inputPadded}
								placeholder={m.auth_password_placeholder()}
							/>
						</div>
					</label>
					<button type="submit" disabled={loading !== null} class={`mt-2 ${ui.primaryButton}`}>
						<AppIcon name="log-out" class="h-4 w-4" />
						{loading === 'login' ? m.auth_loading() : m.auth_login_submit()}
					</button>
				</form>
			{/if}
		</section>
	</div>
</main>
