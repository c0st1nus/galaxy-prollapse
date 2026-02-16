<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import logo from '$lib/assets/logo.svg';
	import AppIcon from '$lib/components/ui/AppIcon.svelte';
	import FlashMessage from '$lib/components/ui/FlashMessage.svelte';
	import { registerClient } from '$lib/api';
	import { ROUTES, roleDashboardRoute, routeHref } from '$lib/constants/routes';
	import { ui } from '$lib/constants/ui';
	import { m } from '$lib/paraglide/messages.js';
	import { setSession } from '$lib/session';

	let loading = $state(false);
	let error = $state('');

	let form = $state({
		companyName: '',
		firstName: '',
		lastName: '',
		phone: '',
		email: '',
		password: '',
		privacyAccepted: false
	});

	async function submitRegister(event: SubmitEvent) {
		event.preventDefault();
		loading = true;
		error = '';
		try {
			const result = await registerClient({
				companyName: form.companyName.trim(),
				firstName: form.firstName.trim(),
				lastName: form.lastName.trim(),
				phone: form.phone.trim() || undefined,
				email: form.email.trim(),
				password: form.password
			});
			setSession(result);
			await goto(resolve(roleDashboardRoute(result.user.role)));
		} catch (err) {
			error = err instanceof Error ? err.message : m.auth_error_generic();
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>{m.register_title()}</title>
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
		<a href={resolve(routeHref(ROUTES.home))} class="inline-flex flex-col items-center gap-2">
			<div
				class="grid h-14 w-14 place-content-center rounded-2xl border border-[var(--brand-soft)] bg-[var(--bg-elevated)] p-1.5 shadow-sm"
			>
				<img src={logo} alt={m.app_brand()} class="h-full w-full object-contain" />
			</div>
			<span class="text-xl font-extrabold tracking-tight text-[var(--brand)] sm:text-2xl"
				>{m.app_brand()}</span
			>
		</a>
		<p class="text-sm text-[var(--text-soft)]">{m.register_intro()}</p>
	</div>

	{#if error}
		<FlashMessage kind="error" text={error} />
	{/if}

	<div class="surface-card overflow-hidden">
		<div class="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3 sm:px-6">
			<AppIcon name="user" class="h-5 w-5 text-[var(--brand)]" />
			<h2 class="text-base font-bold">{m.register_heading()}</h2>
		</div>

		<form class="grid gap-4 p-3.5 sm:p-6" onsubmit={submitRegister}>
			<label class={ui.label}>
				<span class="label-title">
					<AppIcon name="building" class="h-4 w-4" />{m.auth_company_name_label()}
				</span>
				<div class={ui.inputWithIcon}>
					<AppIcon name="building" class={ui.inputIcon} />
					<input
						required
						class={ui.inputPadded}
						type="text"
						bind:value={form.companyName}
						placeholder={m.auth_company_name_placeholder()}
						autocomplete="organization"
					/>
				</div>
			</label>

			<div class="grid gap-4 sm:grid-cols-2">
				<label class={ui.label}>
					<span class="label-title">
						<AppIcon name="user" class="h-4 w-4" />{m.register_first_name_label()}
					</span>
					<div class={ui.inputWithIcon}>
						<AppIcon name="user" class={ui.inputIcon} />
						<input
							required
							class={ui.inputPadded}
							type="text"
							bind:value={form.firstName}
							placeholder={m.register_first_name_placeholder()}
							autocomplete="given-name"
						/>
					</div>
				</label>

				<label class={ui.label}>
					<span class="label-title">
						<AppIcon name="users" class="h-4 w-4" />{m.register_last_name_label()}
					</span>
					<div class={ui.inputWithIcon}>
						<AppIcon name="users" class={ui.inputIcon} />
						<input
							required
							class={ui.inputPadded}
							type="text"
							bind:value={form.lastName}
							placeholder={m.register_last_name_placeholder()}
							autocomplete="family-name"
						/>
					</div>
				</label>
			</div>

			<label class={ui.label}>
				<span class="label-title">
					<AppIcon name="phone" class="h-4 w-4" />{m.register_phone_label()}
				</span>
				<div class={ui.inputWithIcon}>
					<AppIcon name="phone" class={ui.inputIcon} />
					<input
						class={ui.inputPadded}
						type="tel"
						bind:value={form.phone}
						placeholder={m.register_phone_placeholder()}
						autocomplete="tel"
					/>
				</div>
			</label>

			<label class={ui.label}>
				<span class="label-title">
					<AppIcon name="mail" class="h-4 w-4" />{m.register_email_label()}
				</span>
				<div class={ui.inputWithIcon}>
					<AppIcon name="mail" class={ui.inputIcon} />
					<input
						required
						class={ui.inputPadded}
						type="email"
						bind:value={form.email}
						placeholder={m.register_email_placeholder()}
						autocomplete="email"
					/>
				</div>
			</label>

			<label class={ui.label}>
				<span class="label-title">
					<AppIcon name="lock" class="h-4 w-4" />{m.register_password_label()}
				</span>
				<div class={ui.inputWithIcon}>
					<AppIcon name="lock" class={ui.inputIcon} />
					<input
						required
						minlength="8"
						class={ui.inputPadded}
						type="password"
						bind:value={form.password}
						placeholder={m.register_password_placeholder()}
						autocomplete="new-password"
					/>
				</div>
			</label>

			<label
				class="mt-1 inline-flex items-center gap-3 text-sm font-semibold text-[var(--text-soft)]"
			>
				<input
					type="checkbox"
					bind:checked={form.privacyAccepted}
					class="h-5 w-5 rounded border-[var(--border)] accent-[var(--brand)]"
					required
				/>
				<span class="inline-flex items-center gap-2">
					<AppIcon name="shield" class="h-4 w-4" />{m.register_privacy_consent()}
				</span>
			</label>

			<button type="submit" disabled={loading} class={`mt-1 ${ui.primaryButton}`}>
				<AppIcon name="plus" class="h-4 w-4" />
				{loading ? m.auth_loading() : m.register_create_account()}
			</button>
		</form>
	</div>

	<!-- Sign-in link -->
	<a
		href={resolve(routeHref(ROUTES.auth))}
		class="mt-4 flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-2.5 shadow-sm transition hover:bg-[var(--bg-muted)] sm:px-4 sm:py-3"
	>
		<span class="inline-flex items-center gap-2 text-sm font-semibold">
			<AppIcon name="log-out" class="h-4 w-4 text-[var(--brand)]" />
			{m.register_sign_in()}
		</span>
		<AppIcon name="arrow-right" class="h-4 w-4 text-[var(--text-soft)]" />
	</a>
</main>
