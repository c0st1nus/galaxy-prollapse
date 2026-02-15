<script lang="ts">
	import { resolve } from '$app/paths';
	import { ROUTES, routeHref } from '$lib/constants/routes';
	import { m } from '$lib/paraglide/messages.js';

	const audience = [
		{
			icon: '🧾',
			title: () => m.home_audience_clients_title(),
			description: () => m.home_audience_clients_desc()
		},
		{
			icon: '🏢',
			title: () => m.home_audience_companies_title(),
			description: () => m.home_audience_companies_desc()
		}
	];

	const steps = [
		{
			icon: '🪪',
			title: () => m.home_step_1_title(),
			description: () => m.home_step_1_desc()
		},
		{
			icon: '📍',
			title: () => m.home_step_2_title(),
			description: () => m.home_step_2_desc()
		},
		{
			icon: '📷',
			title: () => m.home_step_3_title(),
			description: () => m.home_step_3_desc()
		},
		{
			icon: '✅',
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

<main class="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6 sm:pb-20 lg:px-10">
	<section class="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
		<div class="float-in">
			<h1 class="max-w-xl text-4xl leading-tight font-extrabold sm:text-5xl lg:text-6xl">
				{m.home_hero_heading()}
			</h1>
			<p class="mt-5 max-w-xl text-lg leading-relaxed text-[var(--text-soft)] sm:text-xl">
				{m.home_hero_body()}
			</p>

			<div
				class="mt-8 inline-flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow)] sm:flex-row"
			>
				<a
					href={resolve(routeHref(ROUTES.auth))}
					class="inline-flex items-center justify-center bg-[var(--brand)] px-6 py-4 text-base font-semibold text-white transition hover:bg-[var(--brand-strong)]"
				>
					{m.home_cta_companies()}
				</a>
				<a
					href={resolve(routeHref(ROUTES.registerClient))}
					class="inline-flex items-center justify-center px-5 py-3 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-[var(--bg-muted)] sm:py-0"
				>
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
					class="float-in rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-[var(--shadow)] [animation-delay:calc(var(--idx)*120ms)]"
					style={`--idx:${index};`}
				>
					<div
						class="mb-5 grid h-16 w-16 place-content-center rounded-2xl bg-[var(--bg-muted)] text-3xl"
					>
						{item.icon}
					</div>
					<h3 class="text-2xl font-bold sm:text-3xl">{item.title()}</h3>
					<p class="mt-3 min-h-24 text-base leading-relaxed text-[var(--text-soft)] sm:text-lg">
						{item.description()}
					</p>
				</article>
			{/each}
		</div>
	</section>

	<section class="mt-16 sm:mt-20">
		<h2 class="text-center text-3xl font-extrabold sm:text-4xl lg:text-5xl">
			{m.home_steps_heading()}
		</h2>
		<div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each steps as step, index (index)}
				<article
					class="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm"
				>
					<div
						class="mb-3 grid h-12 w-12 place-content-center rounded-xl bg-[var(--bg-muted)] text-xl"
					>
						{step.icon}
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
					<div class="grid h-6 w-6 place-content-center rounded-full bg-[var(--brand)] text-white">
						✓
					</div>
					<p>{reason()}</p>
				</div>
			{/each}
		</div>
	</section>

	<section
		class="mt-14 rounded-3xl border border-[var(--brand-soft)] bg-gradient-to-r from-[var(--bg-muted)] to-[var(--brand-soft)] px-6 py-10 shadow-[var(--shadow)] sm:mt-16 sm:px-10"
	>
		<h2 class="text-3xl leading-tight font-extrabold sm:text-4xl lg:text-5xl">
			{m.home_final_heading()}
		</h2>
		<p class="mt-4 max-w-3xl text-base text-[var(--text-soft)] sm:text-xl">{m.home_final_body()}</p>
		<div class="mt-7 flex flex-wrap gap-3">
			<a
				href={resolve(routeHref(ROUTES.auth))}
				class="inline-flex rounded-xl bg-[var(--brand)] px-7 py-3 text-base font-semibold text-white transition hover:bg-[var(--brand-strong)] sm:text-lg"
			>
				{m.home_cta_companies()}
			</a>
			<a
				href={resolve(routeHref(ROUTES.registerClient))}
				class="inline-flex rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-7 py-3 text-base font-semibold transition hover:bg-[var(--bg-muted)] sm:text-lg"
			>
				{m.home_final_cta()}
			</a>
		</div>
	</section>
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

	.float-in {
		animation: riseIn 0.7s ease both;
	}

	.delay-1 {
		animation-delay: 120ms;
	}

	.phone-card {
		animation: cardDrift 4s ease-in-out infinite;
	}
</style>
