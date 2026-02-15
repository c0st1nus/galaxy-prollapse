<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { getApiBaseUrl } from '$lib/api';
	import { ROUTES, routeHref } from '$lib/constants/routes';
	import { ui } from '$lib/constants/ui';
	import { clearSession, readSession } from '$lib/session';

	const links = [
		{ label: 'home', path: ROUTES.home },
		{ label: 'auth', path: ROUTES.auth },
		{ label: 'app', path: ROUTES.app },
		{ label: 'register client', path: ROUTES.registerClient },
		{ label: 'demo', path: ROUTES.demo },
		{ label: 'paraglide demo', path: ROUTES.demoParaglide }
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

<main class="mx-auto max-w-6xl px-4 pt-8 pb-14 sm:px-6 lg:px-10">
	<section class={ui.panelSm}>
		<h1 class="text-3xl font-extrabold sm:text-4xl">dev lab</h1>
		<p class="mt-3 text-[var(--text-soft)]">
			quick testing workspace. this route is enabled only in quick mode.
		</p>
		<p class="mt-2 text-sm text-[var(--text-soft)]">api base: {getApiBaseUrl()}</p>
	</section>

	<section class={`mt-6 ${ui.panel}`}>
		<h2 class="text-2xl font-bold">quick links</h2>
		<div class="mt-4 flex flex-wrap gap-2">
			{#each links as item (item.path)}
				<a
					href={resolve(routeHref(item.path))}
					class="inline-flex rounded-xl border border-[var(--border)] bg-[var(--bg-muted)] px-4 py-2 font-semibold transition hover:bg-[var(--bg-elevated)]"
				>
					{item.label}
				</a>
			{/each}
		</div>
	</section>

	<section class={`mt-6 ${ui.panel}`}>
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-2xl font-bold">session tools</h2>
			<div class="flex gap-2">
				<button type="button" class={ui.secondaryButton} onclick={refreshSession}>refresh</button>
				<button type="button" class={ui.primaryButton} onclick={clearAndRefresh}
					>clear session</button
				>
			</div>
		</div>
		<pre
			class="mt-4 overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-muted)] p-4 text-sm">{sessionSnapshot}</pre>
	</section>
</main>
