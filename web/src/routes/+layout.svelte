<script lang="ts">
	import AppHeader from '$lib/components/layout/AppHeader.svelte';
	import favicon from '$lib/assets/favicon.svg';
	import '../styles/global.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-[var(--bg-app)] text-[var(--text-main)]">
	<AppHeader />

	<div
		class="pt-[calc(4rem+env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))] md:pt-0 md:pb-0"
	>
		{@render children()}
	</div>
</div>
