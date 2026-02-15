<script lang="ts">
	import { resolve } from '$app/paths';
	import { ROUTES, routeHref } from '$lib/constants/routes';
	import { ui } from '$lib/constants/ui';
	import { m } from '$lib/paraglide/messages.js';
</script>

<svelte:head>
	<title>{m.demo_title()}</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-12 sm:px-6">
	<section class={`${ui.panel} sm:p-10`}>
		<h1 class="text-3xl font-extrabold sm:text-4xl">{m.demo_heading()}</h1>
		<p class="mt-4 text-base leading-relaxed text-[var(--text-soft)] sm:text-lg">
			{m.demo_description()}
		</p>

		<div class="mt-8 flex flex-wrap gap-3">
			<a
				href={resolve(routeHref(ROUTES.demoParaglide))}
				class="inline-flex items-center rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)] sm:text-base"
			>
				{m.demo_open_paraglide()}
			</a>
			<a
				href={resolve(routeHref(ROUTES.home))}
				class="inline-flex items-center rounded-xl border border-[var(--border)] bg-[var(--bg-muted)] px-5 py-3 text-sm font-semibold text-[var(--text-main)] transition hover:bg-[var(--bg-elevated)] sm:text-base"
			>
				{m.demo_back_home()}
			</a>
		</div>
	</section>
</main>
