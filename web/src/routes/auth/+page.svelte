<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import logo from '$lib/assets/logo.svg';
	import AppIcon from '$lib/components/ui/AppIcon.svelte';
	import FlashMessage from '$lib/components/ui/FlashMessage.svelte';
	import { ROUTES, roleDashboardRoute, routeHref } from '$lib/constants/routes';
	import { ui } from '$lib/constants/ui';
	import { m } from '$lib/paraglide/messages.js';
	import { getApiBaseUrl, login, registerCompany } from '$lib/api';
	import { initSession, readSession, setSession } from '$lib/session';

	const showDevUi = env.PUBLIC_ENABLE_DEV_UI === '1';

	let mode = $state<'login' | 'register'>('login');
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

<main
	class="mx-auto flex min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-md flex-col justify-start px-3 py-3 sm:justify-center sm:px-4 sm:py-10"
>
	<a
		href={resolve(routeHref(ROUTES.home))}
		class="mb-4 inline-flex w-fit items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm font-semibold text-[var(--text-soft)] shadow-sm transition hover:bg-[var(--bg-muted)]"
	>
		<AppIcon name="chevron-right" class="h-4 w-4 rotate-180" />
		{m.nav_home()}
	</a>

	<!-- Brand mark -->
	<div class="mb-5 flex flex-col items-center gap-2 text-center sm:mb-8">
		<div
			class="grid h-14 w-14 place-content-center rounded-2xl border border-[var(--brand-soft)] bg-[var(--bg-elevated)] p-1.5 shadow-sm"
		>
			<img src={logo} alt={m.app_brand()} class="h-full w-full object-contain" />
		</div>
		<h1 class="text-xl font-extrabold tracking-tight sm:text-2xl">{m.app_brand()}</h1>
		<p class="text-sm text-[var(--text-soft)]">{m.auth_subheading()}</p>
		{#if showDevUi}
			<p class="text-xs text-[var(--text-soft)]">
				{m.auth_backend_hint({ url: getApiBaseUrl() })}
			</p>
		{/if}
	</div>

	<!-- Flash messages -->
	{#if error}
		<FlashMessage kind="error" text={error} />
	{/if}
	{#if success}
		<FlashMessage kind="success" text={success} />
	{/if}

	<!-- Tab switcher -->
	<div class="surface-card overflow-hidden">
		<div class="flex border-b border-[var(--border)]">
			<button
				type="button"
				onclick={() => selectMode('login')}
				class={`flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-bold transition ${
					mode === 'login'
						? 'border-b-2 border-[var(--brand)] text-[var(--brand)]'
						: 'text-[var(--text-soft)] hover:bg-[var(--bg-muted)]'
				}`}
			>
				<AppIcon name="log-out" class="h-4 w-4" />
				{m.auth_login_title()}
			</button>
			<button
				type="button"
				onclick={() => selectMode('register')}
				class={`flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-bold transition ${
					mode === 'register'
						? 'border-b-2 border-[var(--brand)] text-[var(--brand)]'
						: 'text-[var(--text-soft)] hover:bg-[var(--bg-muted)]'
				}`}
			>
				<AppIcon name="building" class="h-4 w-4" />
				{m.auth_register_title()}
			</button>
		</div>

		<div class="p-3.5 sm:p-6">
			{#if mode === 'login'}
				<form class="grid gap-4" onsubmit={submitLogin}>
					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="mail" class="h-4 w-4" />{m.auth_email_label()}
						</span>
						<div class={ui.inputWithIcon}>
							<AppIcon name="mail" class={ui.inputIcon} />
							<input
								required
								type="email"
								bind:value={loginForm.email}
								class={ui.inputPadded}
								placeholder={m.auth_email_placeholder()}
								autocomplete="email"
							/>
						</div>
					</label>
					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="lock" class="h-4 w-4" />{m.auth_password_label()}
						</span>
						<div class={ui.inputWithIcon}>
							<AppIcon name="lock" class={ui.inputIcon} />
							<input
								required
								type="password"
								bind:value={loginForm.password}
								class={ui.inputPadded}
								placeholder={m.auth_password_placeholder()}
								autocomplete="current-password"
							/>
						</div>
					</label>
					<button type="submit" disabled={loading !== null} class={`mt-1 ${ui.primaryButton}`}>
						<AppIcon name="log-out" class="h-4 w-4" />
						{loading === 'login' ? m.auth_loading() : m.auth_login_submit()}
					</button>
				</form>
			{:else}
				<form class="grid gap-4" onsubmit={submitRegister}>
					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="building" class="h-4 w-4" />{m.auth_company_name_label()}
						</span>
						<div class={ui.inputWithIcon}>
							<AppIcon name="building" class={ui.inputIcon} />
							<input
								required
								type="text"
								bind:value={registerForm.companyName}
								class={ui.inputPadded}
								placeholder={m.auth_company_name_placeholder()}
								autocomplete="organization"
							/>
						</div>
					</label>
					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="user" class="h-4 w-4" />{m.auth_admin_name_label()}
						</span>
						<div class={ui.inputWithIcon}>
							<AppIcon name="user" class={ui.inputIcon} />
							<input
								required
								type="text"
								bind:value={registerForm.adminName}
								class={ui.inputPadded}
								placeholder={m.auth_admin_name_placeholder()}
								autocomplete="name"
							/>
						</div>
					</label>
					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="mail" class="h-4 w-4" />{m.auth_email_label()}
						</span>
						<div class={ui.inputWithIcon}>
							<AppIcon name="mail" class={ui.inputIcon} />
							<input
								required
								type="email"
								bind:value={registerForm.email}
								class={ui.inputPadded}
								placeholder={m.auth_email_placeholder()}
								autocomplete="email"
							/>
						</div>
					</label>
					<label class={ui.label}>
						<span class="label-title">
							<AppIcon name="lock" class="h-4 w-4" />{m.auth_password_label()}
						</span>
						<div class={ui.inputWithIcon}>
							<AppIcon name="lock" class={ui.inputIcon} />
							<input
								required
								type="password"
								bind:value={registerForm.password}
								class={ui.inputPadded}
								placeholder={m.auth_password_placeholder()}
								autocomplete="new-password"
							/>
						</div>
					</label>
					<button type="submit" disabled={loading !== null} class={`mt-1 ${ui.primaryButton}`}>
						<AppIcon name="plus" class="h-4 w-4" />
						{loading === 'register' ? m.auth_loading() : m.auth_register_submit()}
					</button>
				</form>
			{/if}
		</div>
	</div>

	<!-- Client registration link -->
	<a
		href={resolve(routeHref(ROUTES.registerClient))}
		class="mt-4 flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-2.5 shadow-sm transition hover:bg-[var(--bg-muted)] sm:px-4 sm:py-3"
	>
		<span class="inline-flex items-center gap-2 text-sm font-semibold">
			<AppIcon name="user" class="h-4 w-4 text-[var(--brand)]" />
			{m.auth_path_client_label()}
		</span>
		<AppIcon name="arrow-right" class="h-4 w-4 text-[var(--text-soft)]" />
	</a>
</main>
