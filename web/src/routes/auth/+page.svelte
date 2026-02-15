<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import FlashMessage from '$lib/components/ui/FlashMessage.svelte';
	import { ROUTES } from '$lib/constants/routes';
	import { ui } from '$lib/constants/ui';
	import { m } from '$lib/paraglide/messages.js';
	import { getApiBaseUrl, login, registerCompany } from '$lib/api';
	import { initSession, readSession, setSession } from '$lib/session';

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

	onMount(() => {
		initSession();
		const existing = readSession();
		if (existing) {
			void goto(resolve(ROUTES.app));
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
			await goto(resolve(ROUTES.app));
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
			await goto(resolve(ROUTES.app));
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

<main class="mx-auto max-w-6xl px-4 pt-8 pb-14 sm:px-6 lg:px-10">
	<section class={ui.panelSm}>
		<h1 class="text-3xl font-extrabold sm:text-4xl">{m.auth_heading()}</h1>
		<p class="mt-3 text-base text-[var(--text-soft)] sm:text-lg">{m.auth_subheading()}</p>
		<p class="mt-2 text-sm text-[var(--text-soft)]">
			{m.auth_backend_hint({ url: getApiBaseUrl() })}
		</p>
	</section>

	{#if error}
		<FlashMessage kind="error" text={error} />
	{/if}

	{#if success}
		<FlashMessage kind="success" text={success} />
	{/if}

	<div class="mt-6 grid gap-6 lg:grid-cols-2">
		<section class={ui.panel}>
			<h2 class="text-2xl font-bold">{m.auth_register_title()}</h2>
			<p class="mt-2 text-sm text-[var(--text-soft)]">{m.auth_register_body()}</p>
			<form class="mt-5 grid gap-4" onsubmit={submitRegister}>
				<label class={ui.label}>
					<span>{m.auth_company_name_label()}</span>
					<input
						required
						type="text"
						bind:value={registerForm.companyName}
						class={ui.input}
						placeholder={m.auth_company_name_placeholder()}
					/>
				</label>
				<label class={ui.label}>
					<span>{m.auth_admin_name_label()}</span>
					<input
						required
						type="text"
						bind:value={registerForm.adminName}
						class={ui.input}
						placeholder={m.auth_admin_name_placeholder()}
					/>
				</label>
				<label class={ui.label}>
					<span>{m.auth_email_label()}</span>
					<input
						required
						type="email"
						bind:value={registerForm.email}
						class={ui.input}
						placeholder={m.auth_email_placeholder()}
					/>
				</label>
				<label class={ui.label}>
					<span>{m.auth_password_label()}</span>
					<input
						required
						type="password"
						bind:value={registerForm.password}
						class={ui.input}
						placeholder={m.auth_password_placeholder()}
					/>
				</label>
				<button
					type="submit"
					disabled={loading !== null}
					class={`mt-2 inline-flex items-center justify-center ${ui.primaryButton}`}
				>
					{loading === 'register' ? m.auth_loading() : m.auth_register_submit()}
				</button>
			</form>
		</section>

		<section class={ui.panel}>
			<h2 class="text-2xl font-bold">{m.auth_login_title()}</h2>
			<p class="mt-2 text-sm text-[var(--text-soft)]">{m.auth_login_body()}</p>
			<form class="mt-5 grid gap-4" onsubmit={submitLogin}>
				<label class={ui.label}>
					<span>{m.auth_email_label()}</span>
					<input
						required
						type="email"
						bind:value={loginForm.email}
						class={ui.input}
						placeholder={m.auth_email_placeholder()}
					/>
				</label>
				<label class={ui.label}>
					<span>{m.auth_password_label()}</span>
					<input
						required
						type="password"
						bind:value={loginForm.password}
						class={ui.input}
						placeholder={m.auth_password_placeholder()}
					/>
				</label>
				<button
					type="submit"
					disabled={loading !== null}
					class={`mt-2 inline-flex items-center justify-center ${ui.primaryButton}`}
				>
					{loading === 'login' ? m.auth_loading() : m.auth_login_submit()}
				</button>
			</form>
		</section>
	</div>
</main>
