<script lang="ts">
	import { resolve } from '$app/paths';
	import logo from '$lib/assets/logo.svg';
	import AppIcon, { type IconName } from '$lib/components/ui/AppIcon.svelte';
	import { ROUTES, routeHref, type AppRoute } from '$lib/constants/routes';
	import { ui } from '$lib/constants/ui';
	import { m } from '$lib/paraglide/messages.js';

	const audience: Array<{
		icon: IconName;
		title: () => string;
		description: () => string;
		cta: () => string;
		href: AppRoute;
	}> = [
		{
			icon: 'clipboard',
			title: () => m.home_audience_clients_title(),
			description: () => m.home_audience_clients_desc(),
			cta: () => m.home_audience_clients_cta(),
			href: ROUTES.registerClient
		},
		{
			icon: 'building',
			title: () => m.home_audience_companies_title(),
			description: () => m.home_audience_companies_desc(),
			cta: () => m.home_audience_companies_cta(),
			href: ROUTES.auth
		}
	];

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

<main class={ui.page}>
	<section class="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
		<div class="float-in">
			<div
				class="inline-flex items-center gap-2 rounded-full bg-[var(--bg-muted)] px-3 py-1 text-sm font-semibold text-[var(--text-soft)]"
			>
				<img src={logo} alt={m.app_brand()} class="h-4 w-4 object-contain" />
				{m.app_brand()}
			</div>
			<h1 class="mt-4 max-w-xl text-4xl leading-tight font-extrabold sm:text-5xl lg:text-6xl">
				{m.home_hero_heading()}
			</h1>
			<p class="mt-5 max-w-xl text-lg leading-relaxed text-[var(--text-soft)] sm:text-xl">
				{m.home_hero_body()}
			</p>

			<div class="mt-8 flex flex-wrap gap-3">
				<a href={resolve(routeHref(ROUTES.auth))} class={ui.primaryButton}>
					<AppIcon name="building" class="h-4 w-4" />
					{m.home_cta_companies()}
					<AppIcon name="arrow-right" class="h-4 w-4" />
				</a>
				<a href={resolve(routeHref(ROUTES.registerClient))} class={ui.secondaryButton}>
					<AppIcon name="user" class="h-4 w-4" />
					{m.home_cta_client()}
				</a>
			</div>
			<p class="mt-4 text-base text-[var(--text-soft)] sm:text-lg">{m.home_hero_caption()}</p>
		</div>

		<div class="float-in delay-1">
			<div
				class="relative mx-auto grid h-[420px] w-full max-w-[460px] place-content-center overflow-hidden rounded-[44px] border border-[var(--border)] bg-gradient-to-b from-[var(--bg-muted)] to-[var(--brand-soft)]"
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
					class="phone-card relative z-10 w-[256px] rounded-[36px] border-[7px] border-[#101626] bg-white p-3 shadow-[0_24px_50px_rgba(26,33,67,0.25)]"
				>
					<div class="mx-auto mb-2 h-1.5 w-16 rounded-full bg-[#d9e1f8]"></div>
					<div class="space-y-2.5 rounded-2xl bg-[#f8f9ff] p-3">
						<div class="rounded-xl bg-white p-2.5 shadow-sm">
							<p class="text-sm font-semibold text-slate-800">{m.home_phone_task1_title()}</p>
							<p class="text-xs text-slate-500">{m.home_phone_task1_meta()}</p>
						</div>
						<div class="rounded-xl bg-white p-2.5 shadow-sm">
							<p class="text-sm font-semibold text-slate-800">{m.home_phone_task2_title()}</p>
							<p class="text-xs text-slate-500">{m.home_phone_task2_meta()}</p>
						</div>
						<div class="rounded-xl bg-white p-2.5 shadow-sm">
							<p class="text-sm font-semibold text-slate-800">{m.home_phone_task3_title()}</p>
							<p class="text-xs text-slate-500">{m.home_phone_task3_meta()}</p>
						</div>
						<div class="h-14 rounded-xl bg-white p-2 shadow-sm">
							<div class="h-full rounded-lg bg-gradient-to-r from-[#dbe6ff] to-[#f0f5ff]"></div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section class="mt-16 sm:mt-20">
		<h2 class="text-center text-3xl font-extrabold sm:text-4xl lg:text-5xl">
			{m.home_audience_heading()}
		</h2>
		<div class="mt-8 grid gap-5 md:grid-cols-2">
			{#each audience as item, index (index)}
				<article
					class="float-in surface-card p-6 [animation-delay:calc(var(--idx)*120ms)]"
					style={`--idx:${index};`}
				>
					<div class="mb-5 grid h-14 w-14 place-content-center rounded-2xl bg-[var(--bg-muted)]">
						<AppIcon name={item.icon} class="h-7 w-7 text-[var(--brand)]" />
					</div>
					<h3 class="text-2xl font-bold sm:text-3xl">{item.title()}</h3>
					<p class="mt-3 min-h-24 text-base leading-relaxed text-[var(--text-soft)] sm:text-lg">
						{item.description()}
					</p>
					<a
						href={resolve(routeHref(item.href))}
						class="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[var(--brand)]"
					>
						{item.cta()}
						<AppIcon name="chevron-right" class="h-4 w-4" />
					</a>
				</article>
			{/each}
		</div>
	</section>

	<section class="mt-16 sm:mt-20">
		<h2 class="text-center text-3xl font-extrabold sm:text-4xl lg:text-5xl">
			{m.home_steps_heading()}
		</h2>
		<div class="mt-8 flex flex-col gap-4 sm:gap-5 lg:mt-10 lg:gap-7">
			{#each steps as step, index (index)}
				<article
					class={`step-flow-card p-5 sm:p-6 lg:w-[72%] ${
						index % 2 === 0 ? 'lg:mr-auto' : 'lg:ml-auto'
					}`}
					style={`--step-glow-x:${index % 2 === 0 ? '18%' : '82%'};`}
				>
					<div class="mb-3 grid h-12 w-12 place-content-center rounded-xl bg-[var(--bg-muted)]">
						<AppIcon name={step.icon} class="h-6 w-6 text-[var(--brand)]" />
					</div>
					<h3 class="text-xl leading-tight font-bold sm:text-2xl">{step.title()}</h3>
					<p class="mt-2 text-base leading-relaxed text-[var(--text-soft)] sm:text-lg">
						{step.description()}
					</p>
				</article>
			{/each}
		</div>
	</section>

	<section class="mt-16 sm:mt-20">
		<h2 class="text-center text-3xl font-extrabold sm:text-4xl lg:text-5xl">
			{m.home_reasons_heading()}
		</h2>
		<div class="mx-auto mt-8 grid max-w-4xl gap-4 text-lg font-semibold sm:grid-cols-2 sm:text-xl">
			{#each reasons as reason, index (index)}
				<div class="flex items-center gap-3">
					<div class="grid h-7 w-7 place-content-center rounded-full bg-[var(--brand)] text-white">
						<AppIcon name="check-circle" class="h-4 w-4" />
					</div>
					<p>{reason()}</p>
				</div>
			{/each}
		</div>
	</section>

	<section
		class="surface-card mt-14 bg-gradient-to-r from-[var(--bg-muted)] to-[var(--brand-soft)] px-6 py-10 sm:mt-16 sm:px-10"
	>
		<h2 class="text-3xl leading-tight font-extrabold sm:text-4xl lg:text-5xl">
			{m.home_final_heading()}
		</h2>
		<p class="mt-4 max-w-3xl text-base text-[var(--text-soft)] sm:text-xl">{m.home_final_body()}</p>
		<div class="mt-7 flex flex-wrap gap-3">
			<a href={resolve(routeHref(ROUTES.auth))} class={ui.primaryButton}>
				<AppIcon name="building" class="h-4 w-4" />
				{m.home_cta_companies()}
			</a>
			<a href={resolve(routeHref(ROUTES.registerClient))} class={ui.secondaryButton}>
				<AppIcon name="user" class="h-4 w-4" />
				{m.home_final_cta()}
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

	.step-flow-card {
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow);
		background:
			radial-gradient(140% 100% at var(--step-glow-x) 0%, var(--brand-soft), transparent 55%),
			var(--bg-elevated);
	}
</style>
