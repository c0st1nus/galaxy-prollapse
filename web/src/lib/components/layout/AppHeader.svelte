<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { ROUTES, routeHref, type AppRoute } from '$lib/constants/routes';
	import { m } from '$lib/paraglide/messages.js';
	import { deLocalizeUrl, locales, setLocale } from '$lib/paraglide/runtime.js';

	type Theme = 'light' | 'dark';

	const navItems: Array<{ path: AppRoute; label: () => string }> = [
		{ path: ROUTES.home, label: () => m.nav_home() },
		{ path: ROUTES.auth, label: () => m.nav_auth() },
		{ path: ROUTES.app, label: () => m.nav_app() },
		{ path: ROUTES.registerClient, label: () => m.nav_register_client() },
		{ path: ROUTES.demo, label: () => m.nav_demo() },
		...(env.PUBLIC_ENABLE_DEV_UI === '1' ? [{ path: ROUTES.dev, label: () => 'DEV' }] : [])
	];

	let theme = $state<Theme>('light');

	function applyTheme(next: Theme, persist = true) {
		theme = next;
		document.documentElement.dataset.theme = next;
		if (persist) {
			window.localStorage.setItem('tt-theme', next);
		}
	}

	function toggleTheme() {
		applyTheme(theme === 'light' ? 'dark' : 'light');
	}

	function isActive(path: AppRoute) {
		return deLocalizeUrl(page.url).pathname === path;
	}

	function switchLocale(locale: string) {
		if (locale === 'en' || locale === 'ru' || locale === 'kz') {
			setLocale(locale);
		}
	}

	function localeLabel(locale: string) {
		if (locale === 'en') return m.locale_en();
		if (locale === 'ru') return m.locale_ru();
		if (locale === 'kz') return m.locale_kz();
		return locale.toUpperCase();
	}

	onMount(() => {
		// sync theme with saved choice and system preference on first paint.
		const saved = window.localStorage.getItem('tt-theme');
		const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		const initial: Theme =
			saved === 'dark' || saved === 'light' ? saved : systemPrefersDark ? 'dark' : 'light';
		applyTheme(initial, false);
	});
</script>

<header
	class="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg-app)]/90 backdrop-blur-md"
>
	<div
		class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6"
	>
		<a class="inline-flex items-center gap-3" href={resolve(routeHref(ROUTES.home))}>
			<span
				class="grid h-9 w-9 place-content-center rounded-xl border border-[var(--brand-soft)] bg-[var(--bg-elevated)] font-extrabold text-[var(--brand)] shadow-sm"
			>
				T
			</span>
			<span class="text-xl font-extrabold tracking-tight text-[var(--brand)]">{m.app_brand()}</span>
		</a>

		<nav class="flex items-center gap-2 text-sm font-semibold sm:text-base">
			{#each navItems as item (item.path)}
				<a
					href={resolve(routeHref(item.path))}
					class={`rounded-lg px-3 py-1.5 transition ${
						isActive(item.path)
							? 'bg-[var(--brand)] text-white'
							: 'text-[var(--text-soft)] hover:bg-[var(--bg-muted)]'
					}`}
				>
					{item.label()}
				</a>
			{/each}
		</nav>

		<div class="flex items-center gap-2">
			<div
				class="inline-flex rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-sm"
			>
				{#each locales as locale (locale)}
					<button
						type="button"
						onclick={() => switchLocale(locale)}
						class="rounded-lg px-2.5 py-1 text-xs font-semibold text-[var(--text-soft)] transition hover:bg-[var(--bg-muted)] sm:text-sm"
					>
						{localeLabel(locale)}
					</button>
				{/each}
			</div>

			<button
				type="button"
				class="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text-soft)] shadow-sm transition hover:bg-[var(--bg-muted)] sm:text-sm"
				onclick={toggleTheme}
				aria-label={theme === 'light' ? m.theme_toggle_to_dark() : m.theme_toggle_to_light()}
				title={theme === 'light' ? m.theme_toggle_to_dark() : m.theme_toggle_to_light()}
			>
				{#if theme === 'light'}
					<svg
						class="h-4 w-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"></path>
					</svg>
					{m.theme_dark()}
				{:else}
					<svg
						class="h-4 w-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="12" cy="12" r="5"></circle>
						<path
							d="M12 1v2m0 18v2m11-11h-2M3 12H1m18.36 7.78-1.41-1.41M6.05 6.05 4.64 4.64m14.72 0-1.41 1.41M6.05 17.95l-1.41 1.41"
						></path>
					</svg>
					{m.theme_light()}
				{/if}
			</button>
		</div>
	</div>
</header>
