<script lang="ts">
	import AppHeader from '$lib/components/layout/AppHeader.svelte';
	import { page } from '$app/state';
	import { ROUTES } from '$lib/constants/routes';
	import { deLocalizeUrl } from '$lib/paraglide/runtime.js';
	import favicon from '$lib/assets/favicon.svg';
	import '../styles/global.css';

	const isImmersiveRoute = $derived.by(() => {
		const path = deLocalizeUrl(page.url).pathname;
		return path === ROUTES.auth || path === ROUTES.register || path === ROUTES.registerClient;
	});

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-[var(--bg-app)] text-[var(--text-main)]">
	{#if !isImmersiveRoute}
		<AppHeader />
	{/if}

	<div
		class={isImmersiveRoute
			? 'min-h-[100dvh] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]'
			: 'pt-[calc(4rem+env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:pt-0 md:pb-0'}
	>
		{@render children()}
	</div>
</div>
