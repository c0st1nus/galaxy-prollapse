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

<main class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
	<div class="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start lg:gap-10">
		<section class="float-in">
			<a
				href={resolve(routeHref(ROUTES.home))}
				class="inline-flex items-center gap-3 text-[var(--brand)]"
			>
				<div
					class="grid h-12 w-12 place-content-center rounded-2xl border border-[var(--brand-soft)] bg-[var(--bg-elevated)] p-1 shadow-sm"
				>
					<img src={logo} alt={m.app_brand()} class="h-full w-full object-contain" />
				</div>
				<span class="text-3xl font-extrabold tracking-tight sm:text-5xl">{m.app_brand()}</span>
			</a>

			<p
				class="mt-5 text-xl font-semibold tracking-[0.16em] text-[var(--text-soft)] uppercase sm:text-3xl"
			>
				{m.register_heading()}
			</p>

			<p class="mt-8 max-w-xl text-lg leading-relaxed text-[var(--text-soft)] sm:mt-10 sm:text-xl">
				{m.register_intro()}
			</p>

			<div class="mt-8 grid max-w-xl gap-5">
				<article class="surface-card p-5">
					<div class="flex items-center gap-4">
						<div class="grid h-12 w-12 place-content-center rounded-2xl bg-[var(--bg-muted)]">
							<AppIcon name="mail" class="h-6 w-6 text-[var(--brand)]" />
						</div>
						<div>
							<p class="text-sm text-[var(--brand)] sm:text-base">
								{m.register_contact_email_label()}
							</p>
							<p class="text-xl font-semibold break-all sm:text-2xl">contact@tinytidy.com</p>
						</div>
					</div>
				</article>

				<article class="surface-card p-5">
					<div class="flex items-center gap-4">
						<div class="grid h-12 w-12 place-content-center rounded-2xl bg-[var(--bg-muted)]">
							<AppIcon name="phone" class="h-6 w-6 text-[var(--brand)]" />
						</div>
						<div>
							<p class="text-sm text-[var(--brand)] sm:text-base">
								{m.register_contact_phone_label()}
							</p>
							<p class="text-xl font-semibold sm:text-2xl">+7 (747) 123-32-13</p>
						</div>
					</div>
				</article>
			</div>
		</section>

		<section
			class="float-in surface-card bg-[var(--bg-elevated)]/90 p-5 backdrop-blur delay-1 sm:p-8 lg:p-10"
		>
			{#if error}
				<FlashMessage kind="error" text={error} />
			{/if}

			<form class="mt-4 grid gap-4" onsubmit={submitRegister}>
				<label class={ui.label}>
					<span class="label-title"
						><AppIcon name="building" class="h-4 w-4" />{m.auth_company_name_label()}</span
					>
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

				<label class={ui.label}>
					<span class="label-title"
						><AppIcon name="user" class="h-4 w-4" />{m.register_first_name_label()}</span
					>
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
					<span class="label-title"
						><AppIcon name="users" class="h-4 w-4" />{m.register_last_name_label()}</span
					>
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

				<label class={ui.label}>
					<span class="label-title"
						><AppIcon name="phone" class="h-4 w-4" />{m.register_phone_label()}</span
					>
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
					<span class="label-title"
						><AppIcon name="mail" class="h-4 w-4" />{m.register_email_label()}</span
					>
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
					<span class="label-title"
						><AppIcon name="lock" class="h-4 w-4" />{m.register_password_label()}</span
					>
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
					class="mt-2 inline-flex items-center gap-3 text-sm font-semibold text-[var(--text-soft)] sm:text-base"
				>
					<input
						type="checkbox"
						bind:checked={form.privacyAccepted}
						class="h-5 w-5 rounded border-[var(--border)] accent-[var(--brand)]"
						required
					/>
					<span class="inline-flex items-center gap-2"
						><AppIcon name="shield" class="h-4 w-4" />{m.register_privacy_consent()}</span
					>
				</label>

				<div class="mt-4 grid gap-3 sm:grid-cols-2">
					<button type="submit" disabled={loading} class={ui.primaryButton}>
						<AppIcon name="plus" class="h-4 w-4" />
						{loading ? m.auth_loading() : m.register_create_account()}
					</button>
					<a href={resolve(routeHref(ROUTES.auth))} class={ui.secondaryButton}>
						<AppIcon name="log-out" class="h-4 w-4" />
						{m.register_sign_in()}
					</a>
				</div>
			</form>
		</section>
	</div>
</main>
