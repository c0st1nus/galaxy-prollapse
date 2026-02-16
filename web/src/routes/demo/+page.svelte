<script lang="ts">
	import { resolve } from '$app/paths';
	import AppIcon from '$lib/components/ui/AppIcon.svelte';
	import { ROUTES, routeHref } from '$lib/constants/routes';
	import { ui } from '$lib/constants/ui';
	import { m } from '$lib/paraglide/messages.js';
</script>

<svelte:head>
	<title>{m.demo_title()}</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-12">
	<section class={`${ui.panel} sm:p-10`}>
		<h1 class={ui.sectionTitle}>
			<AppIcon name="sparkles" class="h-6 w-6 text-[var(--brand)]" />
			{m.demo_heading()}
		</h1>
		<p class="mt-4 text-base leading-relaxed text-[var(--text-soft)] sm:text-lg">
			{m.demo_description()}
		</p>

		<div class="mt-8 flex flex-wrap gap-3">
			<a href={resolve(routeHref(ROUTES.demoParaglide))} class={ui.primaryButton}>
				<AppIcon name="globe" class="h-4 w-4" />
				{m.demo_open_paraglide()}
			</a>
			<a href={resolve(routeHref(ROUTES.home))} class={ui.secondaryButton}>
				<AppIcon name="home" class="h-4 w-4" />
				{m.demo_back_home()}
			</a>
		</div>
	</section>
</main>
