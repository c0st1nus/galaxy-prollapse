<script lang="ts">
	import { resolve } from '$app/paths';
	import { ROUTES, routeHref } from '$lib/constants/routes';
	import { m } from '$lib/paraglide/messages.js';

	const inputClass =
		'mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-base text-[var(--text-main)] placeholder:text-[var(--text-soft)] transition focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-soft)] sm:text-lg';
</script>

<svelte:head>
	<title>{m.register_title()}</title>
</svelte:head>

<main class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
	<div class="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-10">
		<section class="float-in">
			<a
				href={resolve(routeHref(ROUTES.home))}
				class="inline-flex items-center gap-3 text-[var(--brand)]"
			>
				<div
					class="grid h-12 w-12 place-content-center rounded-2xl border border-[var(--brand-soft)] bg-[var(--bg-elevated)] shadow-sm"
				>
					<span class="text-xl font-extrabold">T</span>
				</div>
				<span class="text-3xl font-extrabold tracking-tight sm:text-5xl">{m.app_brand()}</span>
			</a>

			<p
				class="mt-5 text-xl font-semibold tracking-[0.16em] text-[var(--text-soft)] uppercase sm:text-3xl"
			>
				{m.register_heading()}
			</p>

			<p class="mt-8 max-w-xl text-lg leading-relaxed text-[var(--text-soft)] sm:mt-12 sm:text-2xl">
				{m.register_intro()}
			</p>

			<div class="mt-8 grid max-w-xl gap-5">
				<article
					class="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow)]"
				>
					<div class="flex items-center gap-4">
						<div
							class="grid h-12 w-12 place-content-center rounded-2xl bg-[var(--bg-muted)] sm:h-14 sm:w-14"
						>
							<svg
								class="h-6 w-6 text-[var(--brand)]"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<rect x="3" y="5" width="18" height="14" rx="2"></rect>
								<path d="M3 7l9 6 9-6"></path>
							</svg>
						</div>
						<div>
							<p class="text-base text-[var(--brand)] sm:text-xl">
								{m.register_contact_email_label()}
							</p>
							<p class="text-xl font-semibold break-all sm:text-3xl">contact@tinytidy.com</p>
						</div>
					</div>
				</article>

				<article
					class="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow)]"
				>
					<div class="flex items-center gap-4">
						<div
							class="grid h-12 w-12 place-content-center rounded-2xl bg-[var(--bg-muted)] sm:h-14 sm:w-14"
						>
							<svg
								class="h-6 w-6 text-[var(--brand)]"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path
									d="M22 16.92v3a2 2 0 0 1-2.18 2 19.78 19.78 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6A19.78 19.78 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
								></path>
							</svg>
						</div>
						<div>
							<p class="text-base text-[var(--brand)] sm:text-xl">
								{m.register_contact_phone_label()}
							</p>
							<p class="text-xl font-semibold sm:text-3xl">+7 (747) 123-32-13</p>
						</div>
					</div>
				</article>
			</div>
		</section>

		<section
			class="float-in rounded-[2rem] border border-[var(--border)] bg-[var(--bg-elevated)]/90 p-5 shadow-[var(--shadow)] backdrop-blur delay-1 sm:p-8 lg:p-10"
		>
			<form class="grid gap-4" on:submit|preventDefault>
				<label class="text-lg font-medium text-[var(--brand)] sm:text-2xl">
					{m.register_first_name_label()}
					<input
						class={inputClass}
						type="text"
						placeholder={m.register_first_name_placeholder()}
						autocomplete="given-name"
					/>
				</label>

				<label class="text-lg font-medium text-[var(--brand)] sm:text-2xl">
					{m.register_last_name_label()}
					<input
						class={inputClass}
						type="text"
						placeholder={m.register_last_name_placeholder()}
						autocomplete="family-name"
					/>
				</label>

				<label class="text-lg font-medium text-[var(--brand)] sm:text-2xl">
					{m.register_phone_label()}
					<input
						class={inputClass}
						type="tel"
						placeholder={m.register_phone_placeholder()}
						autocomplete="tel"
					/>
				</label>

				<label class="text-lg font-medium text-[var(--brand)] sm:text-2xl">
					{m.register_email_label()}
					<input
						class={inputClass}
						type="email"
						placeholder={m.register_email_placeholder()}
						autocomplete="email"
					/>
				</label>

				<label class="text-lg font-medium text-[var(--brand)] sm:text-2xl">
					{m.register_password_label()}
					<input
						class={inputClass}
						type="password"
						placeholder={m.register_password_placeholder()}
						autocomplete="new-password"
					/>
				</label>

				<label class="mt-2 flex items-center gap-3 text-base text-[var(--brand)] sm:text-xl">
					<input
						type="checkbox"
						class="h-5 w-5 rounded border-[var(--border)] accent-[var(--brand)]"
						required
					/>
					{m.register_privacy_consent()}
				</label>

				<div class="mt-4 grid gap-3 sm:grid-cols-2">
					<button
						type="submit"
						class="inline-flex items-center justify-center rounded-xl bg-[var(--brand)] px-6 py-3 text-base font-semibold text-white transition hover:bg-[var(--brand-strong)] sm:text-xl"
					>
						{m.register_create_account()}
					</button>
					<a
						href={resolve(routeHref(ROUTES.home))}
						class="inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-3 text-base font-semibold text-[var(--brand)] transition hover:bg-[var(--bg-muted)] sm:text-xl"
					>
						{m.register_sign_in()}
					</a>
				</div>
			</form>
		</section>
	</div>
</main>

<style>
	@keyframes riseIn {
		from {
			opacity: 0;
			transform: translateY(18px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.float-in {
		animation: riseIn 0.7s ease both;
	}

	.delay-1 {
		animation-delay: 120ms;
	}
</style>
