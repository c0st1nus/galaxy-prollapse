<script lang="ts">
	import { resolve } from '$app/paths';
	import logo from '$lib/assets/logo.svg';
	import AppIcon, { type IconName } from '$lib/components/ui/AppIcon.svelte';
	import { ROUTES, routeHref } from '$lib/constants/routes';
	import { ui } from '$lib/constants/ui';
	import { m } from '$lib/paraglide/messages.js';

	const steps: Array<{ icon: IconName; title: () => string; description: () => string }> = [
		{
			icon: 'users',
			title: () => m.home_step_1_title(),
			description: () => m.home_step_1_desc()
		},
		{
			icon: 'map-pin',
			title: () => m.home_step_2_title(),
			description: () => m.home_step_2_desc()
		},
		{
			icon: 'camera',
			title: () => m.home_step_3_title(),
			description: () => m.home_step_3_desc()
		},
		{
			icon: 'check-circle',
			title: () => m.home_step_4_title(),
			description: () => m.home_step_4_desc()
		}
	];

	const reasons = [
		() => m.home_reason_1(),
		() => m.home_reason_2(),
		() => m.home_reason_3(),
		() => m.home_reason_4()
	];
</script>

<svelte:head>
	<title>{m.home_title()}</title>
</svelte:head>

<main class={`${ui.page} pb-6 sm:pb-10`}>
	<!-- Hero — full-viewport, app-like on mobile -->
	<section
		class="relative flex min-h-[48dvh] flex-col items-center justify-center gap-4 sm:min-h-0 sm:items-start sm:gap-6 lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:gap-10"
	>
		<div
			class="float-in w-full max-w-xl rounded-[1.4rem] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-4 text-left shadow-[var(--shadow)] sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:shadow-none"
		>
			<div
				class="inline-flex items-center gap-2 rounded-full bg-[var(--bg-muted)] px-4 py-1.5 text-sm font-semibold text-[var(--text-soft)]"
			>
				<img src={logo} alt={m.app_brand()} class="h-5 w-5 object-contain" />
				{m.app_brand()}
			</div>
			<h1 class="mt-4 text-[1.75rem] leading-tight font-extrabold sm:mt-5 sm:text-5xl lg:text-6xl">
				{m.home_hero_heading()}
			</h1>
			<p class="mt-3 text-[0.92rem] leading-relaxed text-[var(--text-soft)] sm:mt-4 sm:text-xl">
				{m.home_hero_body()}
			</p>

			<div class="mt-5 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap">
				<a
					href={resolve(routeHref(ROUTES.auth))}
					class="btn btn-primary w-full justify-center text-base sm:w-auto"
				>
					<AppIcon name="users" class="h-5 w-5" />
					{m.home_cta_companies()}
					<AppIcon name="arrow-right" class="h-4 w-4" />
				</a>
			</div>
			<p class="mt-3 text-sm text-[var(--text-soft)] sm:text-base">{m.home_hero_caption()}</p>
		</div>

		<div class="float-in w-full delay-1">
			<div
				class="relative mx-auto grid h-[260px] w-full max-w-[19rem] place-content-center overflow-hidden rounded-[28px] border border-[var(--border)] bg-gradient-to-b from-[var(--bg-muted)] to-[var(--brand-soft)] sm:h-[340px] sm:max-w-md sm:rounded-[34px] lg:h-[420px] lg:max-w-[460px] lg:rounded-[44px]"
			>
				<div
					class="absolute -top-16 left-8 h-32 w-32 rounded-full bg-[var(--brand-soft)]/70 blur-3xl"
				></div>
				<div
					class="absolute right-4 bottom-0 h-36 w-36 rounded-full bg-[var(--brand-soft)]/70 blur-3xl"
				></div>
				<div class="absolute top-7 right-10 h-3 w-3 rounded-full bg-white/80"></div>
				<div class="absolute top-16 right-[6.5rem] h-2 w-2 rounded-full bg-white/60"></div>

				<div
					class="phone-card relative z-10 w-[196px] rounded-[26px] border-[5px] border-[#101626] bg-white p-2 shadow-[0_24px_50px_rgba(26,33,67,0.25)] sm:w-[236px] sm:rounded-[34px] sm:border-[6px] sm:p-3 lg:w-[256px] lg:rounded-[36px] lg:border-[7px]"
				>
					<div class="mx-auto mb-2 h-1.5 w-16 rounded-full bg-[#d9e1f8]"></div>
					<div class="space-y-2 rounded-2xl bg-[#f8f9ff] p-2.5 sm:space-y-2.5 sm:p-3">
						<div class="rounded-xl bg-white p-2 shadow-sm sm:p-2.5">
							<p class="text-sm font-semibold text-slate-800">{m.home_phone_task1_title()}</p>
							<p class="text-xs text-slate-500">{m.home_phone_task1_meta()}</p>
						</div>
						<div class="rounded-xl bg-white p-2 shadow-sm sm:p-2.5">
							<p class="text-sm font-semibold text-slate-800">{m.home_phone_task2_title()}</p>
							<p class="text-xs text-slate-500">{m.home_phone_task2_meta()}</p>
						</div>
						<div class="rounded-xl bg-white p-2 shadow-sm sm:p-2.5">
							<p class="text-sm font-semibold text-slate-800">{m.home_phone_task3_title()}</p>
							<p class="text-xs text-slate-500">{m.home_phone_task3_meta()}</p>
						</div>
						<div class="h-12 rounded-xl bg-white p-2 shadow-sm sm:h-14">
							<div class="h-full rounded-lg bg-gradient-to-r from-[#dbe6ff] to-[#f0f5ff]"></div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- How it works — visual step cards -->
	<section class="mt-10 sm:mt-20">
		<h2 class="text-center text-2xl font-extrabold sm:text-4xl lg:text-5xl">
			{m.home_steps_heading()}
		</h2>
		<div
			class="mt-6 grid grid-cols-1 gap-3 sm:mt-8 sm:grid-cols-2 sm:gap-5 lg:mt-10 lg:grid-cols-4"
		>
			{#each steps as step, index (index)}
				<article
					class="float-in surface-card flex flex-col items-center gap-3 p-4 text-center sm:p-6"
					style={`animation-delay:${index * 80}ms;`}
				>
					<div
						class="grid h-14 w-14 place-content-center rounded-2xl bg-gradient-to-br from-[var(--brand-soft)] to-[var(--bg-muted)]"
					>
						<AppIcon name={step.icon} class="h-7 w-7 text-[var(--brand)]" />
					</div>
					<h3 class="text-base leading-tight font-bold sm:text-lg">{step.title()}</h3>
					<p class="text-sm leading-relaxed text-[var(--text-soft)]">
						{step.description()}
					</p>
				</article>
			{/each}
		</div>
	</section>

	<!-- Why TinyTidy -->
	<section class="mt-10 sm:mt-20">
		<h2 class="text-center text-2xl font-extrabold sm:text-4xl lg:text-5xl">
			{m.home_reasons_heading()}
		</h2>
		<div class="mx-auto mt-6 grid max-w-3xl gap-3 sm:mt-8 sm:grid-cols-2 sm:gap-4">
			{#each reasons as reason, index (index)}
				<div
					class="float-in surface-card flex items-center gap-3 p-4"
					style={`animation-delay:${index * 60}ms;`}
				>
					<div
						class="grid h-9 w-9 shrink-0 place-content-center rounded-full bg-[var(--brand)] text-white"
					>
						<AppIcon name="check-circle" class="h-5 w-5" />
					</div>
					<p class="text-sm font-semibold sm:text-base">{reason()}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- CTA banner -->
	<section
		class="surface-card mt-10 bg-gradient-to-r from-[var(--bg-muted)] to-[var(--brand-soft)] px-4 py-6 text-center sm:mt-16 sm:px-10 sm:py-10 sm:text-left"
	>
		<h2 class="text-2xl leading-tight font-extrabold sm:text-4xl lg:text-5xl">
			{m.home_final_heading()}
		</h2>
		<p class="mt-3 max-w-3xl text-sm text-[var(--text-soft)] sm:text-xl">{m.home_final_body()}</p>
		<div class="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
			<a
				href={resolve(routeHref(ROUTES.auth))}
				class="btn btn-primary w-full justify-center sm:w-auto"
			>
				<AppIcon name="building" class="h-4 w-4" />
				{m.home_cta_companies()}
			</a>
		</div>
	</section>
</main>

<style>
	@keyframes cardDrift {
		0% {
			transform: translateY(0px);
		}
		50% {
			transform: translateY(-7px);
		}
		100% {
			transform: translateY(0px);
		}
	}

	.phone-card {
		animation: cardDrift 4s ease-in-out infinite;
	}
</style>
