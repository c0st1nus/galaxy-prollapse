<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import AppIcon from '$lib/components/ui/AppIcon.svelte';
	import { getApiBaseUrl } from '$lib/api';
	import { ROUTES, routeHref } from '$lib/constants/routes';
	import { ui } from '$lib/constants/ui';
	import { clearSession, readSession } from '$lib/session';

	const links = [
		{ label: 'home', path: ROUTES.home, icon: 'home' as const },
		{ label: 'auth', path: ROUTES.auth, icon: 'users' as const },
		{ label: 'app', path: ROUTES.app, icon: 'clipboard' as const },
		{ label: 'register client', path: ROUTES.registerClient, icon: 'user' as const },
		{ label: 'demo', path: ROUTES.demo, icon: 'sparkles' as const },
		{ label: 'paraglide demo', path: ROUTES.demoParaglide, icon: 'globe' as const }
	];

	let sessionSnapshot = $state('empty');

	function refreshSession() {
		const session = readSession();
		sessionSnapshot = session ? JSON.stringify(session, null, 2) : 'empty';
	}

	function clearAndRefresh() {
		clearSession();
		refreshSession();
	}

	onMount(() => {
		refreshSession();
	});
</script>

<svelte:head>
	<title>dev lab</title>
</svelte:head>

<main class={ui.page}>
	<section class={ui.panelSm}>
		<h1 class={ui.sectionTitle}>
			<AppIcon name="filter" class="h-5 w-5 text-[var(--brand)]" />
			dev lab
		</h1>
		<p class="mt-3 text-[var(--text-soft)]">
			quick testing workspace. this route is enabled only in quick mode.
		</p>
		<p class="mt-2 text-sm text-[var(--text-soft)]">api base: {getApiBaseUrl()}</p>
	</section>

	<section class={`mt-6 ${ui.panel}`}>
		<h2 class={ui.sectionTitle}>
			<AppIcon name="arrow-right" class="h-5 w-5 text-[var(--brand)]" />
			quick links
		</h2>
		<div class="mt-4 flex flex-wrap gap-2">
			{#each links as item (item.path)}
				<a href={resolve(routeHref(item.path))} class={ui.secondaryButton}>
					<AppIcon name={item.icon} class="h-4 w-4" />
					{item.label}
				</a>
			{/each}
		</div>
	</section>

	<section class={`mt-6 ${ui.panel}`}>
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 class={ui.sectionTitle}>
				<AppIcon name="shield" class="h-5 w-5 text-[var(--brand)]" />
				session tools
			</h2>
			<div class="flex flex-wrap gap-2">
				<button type="button" class={ui.secondaryButton} onclick={refreshSession}>
					<AppIcon name="refresh" class="h-4 w-4" />
					refresh
				</button>
				<button type="button" class={ui.primaryButton} onclick={clearAndRefresh}>
					<AppIcon name="trash" class="h-4 w-4" />
					clear session
				</button>
			</div>
		</div>
		<pre class="surface-soft mt-4 overflow-auto p-4 text-sm">{sessionSnapshot}</pre>
	</section>
</main>
