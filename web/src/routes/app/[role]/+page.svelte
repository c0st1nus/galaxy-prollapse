<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import type { UserRole } from '$lib/api';
	import { ROUTES, roleDashboardRoute, routeHref } from '$lib/constants/routes';
	import { ui } from '$lib/constants/ui';
	import { m } from '$lib/paraglide/messages.js';
	import { initSession, readSession } from '$lib/session';

	let { data }: { data: PageData } = $props();

	const utilityAnchorByRole: Record<UserRole, string> = {
		admin: 'admin-users',
		supervisor: 'supervisor-inspections',
		cleaner: 'cleaner-tasks',
		client: 'client-feedback'
	};

	onMount(() => {
		initSession();
		const existing = readSession();
		if (!existing) {
			void goto(resolve(routeHref(ROUTES.auth)));
			return;
		}

		if (existing.user.role !== data.role) {
			void goto(resolve(routeHref(roleDashboardRoute(existing.user.role))));
			return;
		}

		const utilityHref = `${resolve(routeHref(ROUTES.app))}#${utilityAnchorByRole[data.role]}`;
		void goto(utilityHref);
	});
</script>

<svelte:head>
	<title>{m.app_title()}</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-12 sm:px-6">
	<section class={ui.panelSm}>
		<h1 class="text-2xl font-extrabold">{m.app_heading()}</h1>
		<p class="mt-2 text-[var(--text-soft)]">{m.auth_loading()}</p>
	</section>
</main>
