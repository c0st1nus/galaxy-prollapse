<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import AppIcon from '$lib/components/ui/AppIcon.svelte';
	import { ROUTES, routeHref } from '$lib/constants/routes';
	import { ui } from '$lib/constants/ui';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale, setLocale } from '$lib/paraglide/runtime.js';

	let currentLocale = $state('en');

	function selectLocale(locale: 'en' | 'ru' | 'kz') {
		currentLocale = locale;
		void setLocale(locale);
	}

	onMount(() => {
		currentLocale = getLocale();
	});
</script>

<svelte:head>
	<title>{m.demo_paraglide_title()}</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-12">
	<section class={`${ui.panel} sm:p-10`}>
		<h1 class={ui.sectionTitle}>
			<AppIcon name="globe" class="h-6 w-6 text-[var(--brand)]" />
			{m.demo_paraglide_heading()}
		</h1>
		<p class="mt-3 text-lg text-[var(--text-soft)]">{m.hello_world({ name: m.app_brand() })}</p>

		<div class="mt-6 flex flex-wrap gap-3">
			<button
				type="button"
				class={currentLocale === 'en' ? ui.primaryButton : ui.secondaryButton}
				onclick={() => selectLocale('en')}
			>
				<AppIcon name="globe" class="h-4 w-4" />
				{m.locale_en()}
			</button>
			<button
				type="button"
				class={currentLocale === 'ru' ? ui.primaryButton : ui.secondaryButton}
				onclick={() => selectLocale('ru')}
			>
				<AppIcon name="globe" class="h-4 w-4" />
				{m.locale_ru()}
			</button>
			<button
				type="button"
				class={currentLocale === 'kz' ? ui.primaryButton : ui.secondaryButton}
				onclick={() => selectLocale('kz')}
			>
				<AppIcon name="globe" class="h-4 w-4" />
				{m.locale_kz()}
			</button>
		</div>

		<p class="mt-8 text-base text-[var(--text-soft)]">{m.demo_paraglide_instructions()}</p>

		<p class="mt-3 text-base text-[var(--text-soft)]">
			{m.demo_paraglide_vscode_tip()}
			<a
				class="ml-1 inline-flex items-center gap-1 font-semibold text-[var(--brand)] underline"
				href="https://marketplace.visualstudio.com/items?itemName=inlang.vs-code-extension"
				target="_blank"
				rel="noreferrer"
			>
				<AppIcon name="sparkles" class="h-4 w-4" />
				{m.demo_paraglide_extension_label()}
			</a>
		</p>

		<a href={resolve(routeHref(ROUTES.demo))} class={`mt-8 ${ui.secondaryButton}`}>
			<AppIcon name="arrow-right" class="h-4 w-4 rotate-180" />
			{m.demo_back()}
		</a>
	</section>
</main>
