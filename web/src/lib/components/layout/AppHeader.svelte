<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onDestroy, onMount } from 'svelte';
	import logo from '$lib/assets/logo.svg';
	import AppIcon, { type IconName } from '$lib/components/ui/AppIcon.svelte';
	import { ROUTES, roleDashboardRoute, routeHref, type AppRoute } from '$lib/constants/routes';
	import { m } from '$lib/paraglide/messages.js';
	import { deLocalizeUrl, getLocale, locales, setLocale } from '$lib/paraglide/runtime.js';
	import { initSession, session, type SessionState } from '$lib/session';

	type Theme = 'light' | 'dark';
	const showDevUi = env.PUBLIC_ENABLE_DEV_UI === '1';

	let theme = $state<Theme>('light');
	let currentLocale = $state<string>('en');
	let currentSession = $state<SessionState | null>(null);
	let mobileMenuOpen = $state(false);
	let unsubscribe: (() => void) | null = null;

	const navItems = $derived.by(() => {
		const items: Array<{ path: AppRoute; label: () => string; icon: IconName }> = [
			{ path: ROUTES.home, label: () => m.nav_home(), icon: 'home' }
		];

		if (currentSession) {
			items.push({
				path: roleDashboardRoute(currentSession.user.role),
				label: () => m.nav_app(),
				icon: 'clipboard'
			});
		} else {
			items.push({ path: ROUTES.auth, label: () => m.nav_auth(), icon: 'users' });
		}

		items.push({ path: ROUTES.registerClient, label: () => m.nav_register_client(), icon: 'user' });

		if (showDevUi) {
			items.push(
				{ path: ROUTES.demo, label: () => m.nav_demo(), icon: 'sparkles' },
				{ path: ROUTES.dev, label: () => 'DEV', icon: 'filter' }
			);
		}

		return items;
	});

	const mobileTabItems = $derived.by(() => {
		const items: Array<{ path: AppRoute; label: () => string; icon: IconName }> = [
			{ path: ROUTES.home, label: () => m.nav_home(), icon: 'home' }
		];

		if (currentSession) {
			items.push({
				path: roleDashboardRoute(currentSession.user.role),
				label: () => m.nav_app(),
				icon: 'clipboard'
			});
		} else {
			items.push({ path: ROUTES.auth, label: () => m.nav_auth(), icon: 'users' });
		}

		items.push({ path: ROUTES.registerClient, label: () => m.nav_register_client(), icon: 'user' });

		if (showDevUi) {
			items.push({ path: ROUTES.demo, label: () => m.nav_demo(), icon: 'sparkles' });
		}

		return items;
	});

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
			currentLocale = locale;
			void setLocale(locale);
		}
	}

	function localeLabel(locale: string) {
		if (locale === 'en') return m.locale_en();
		if (locale === 'ru') return m.locale_ru();
		if (locale === 'kz') return m.locale_kz();
		return locale.toUpperCase();
	}

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}

	$effect(() => {
		const currentPath = deLocalizeUrl(page.url).pathname;
		if (currentPath !== '') {
			mobileMenuOpen = false;
		}
	});

	onMount(() => {
		initSession();
		unsubscribe = session.subscribe((next) => {
			currentSession = next;
		});

		const saved = window.localStorage.getItem('tt-theme');
		const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		const initial: Theme =
			saved === 'dark' || saved === 'light' ? saved : systemPrefersDark ? 'dark' : 'light';
		applyTheme(initial, false);
		currentLocale = getLocale();
	});

	onDestroy(() => {
		if (unsubscribe) unsubscribe();
	});
</script>

<header
	class="fixed inset-x-0 top-0 z-50 border-b border-[var(--border)] bg-[var(--bg-app)]/90 pt-[env(safe-area-inset-top)] backdrop-blur-md md:sticky md:pt-0"
>
	<div class="mx-auto max-w-6xl px-3 sm:px-4 md:px-6">
		<div class="flex h-16 items-center justify-between gap-2 md:hidden">
			<button
				type="button"
				class="grid h-10 w-10 place-content-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] shadow-sm"
				onclick={() => (mobileMenuOpen = true)}
				aria-label="open menu"
			>
				<AppIcon name="menu" class="h-5 w-5" />
			</button>

			<a class="inline-flex items-center gap-2" href={resolve(routeHref(ROUTES.home))}>
				<span
					class="grid h-9 w-9 place-content-center rounded-xl border border-[var(--brand-soft)] bg-[var(--bg-elevated)] p-1 shadow-sm"
				>
					<img src={logo} alt={m.app_brand()} class="h-full w-full object-contain" />
				</span>
				<span class="text-lg font-extrabold tracking-tight text-[var(--brand)]"
					>{m.app_brand()}</span
				>
			</a>

			<button
				type="button"
				class="grid h-10 w-10 place-content-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] shadow-sm"
				onclick={toggleTheme}
				aria-label={theme === 'light' ? m.theme_toggle_to_dark() : m.theme_toggle_to_light()}
			>
				{#if theme === 'light'}
					<AppIcon name="moon" class="h-5 w-5" />
				{:else}
					<AppIcon name="sun" class="h-5 w-5" />
				{/if}
			</button>
		</div>

		<div class="relative hidden h-[68px] items-center justify-between gap-3 md:flex">
			<a class="inline-flex items-center gap-3" href={resolve(routeHref(ROUTES.home))}>
				<span
					class="grid h-10 w-10 place-content-center rounded-xl border border-[var(--brand-soft)] bg-[var(--bg-elevated)] p-1 shadow-sm"
				>
					<img src={logo} alt={m.app_brand()} class="h-full w-full object-contain" />
				</span>
				<span class="text-xl font-extrabold tracking-tight text-[var(--brand)]"
					>{m.app_brand()}</span
				>
			</a>

			<nav
				class="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 text-sm font-semibold lg:text-base"
			>
				{#each navItems as item (item.path)}
					<a
						href={resolve(routeHref(item.path))}
						class={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition ${
							isActive(item.path)
								? 'bg-[var(--brand)] text-white'
								: 'text-[var(--text-soft)] hover:bg-[var(--bg-muted)]'
						}`}
					>
						<AppIcon name={item.icon} class="h-4 w-4" />
						<span>{item.label()}</span>
					</a>
				{/each}
			</nav>

			<div class="flex items-center justify-end gap-2">
				<div
					class="inline-flex rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-sm"
				>
					{#each locales as locale (locale)}
						<button
							type="button"
							onclick={() => switchLocale(locale)}
							class={`rounded-lg px-2.5 py-1 text-xs font-semibold transition sm:text-sm ${
								currentLocale === locale
									? 'bg-[var(--brand)] text-white'
									: 'text-[var(--text-soft)] hover:bg-[var(--bg-muted)]'
							}`}
						>
							{localeLabel(locale)}
						</button>
					{/each}
				</div>

				<button
					type="button"
					class="btn btn-secondary"
					onclick={toggleTheme}
					aria-label={theme === 'light' ? m.theme_toggle_to_dark() : m.theme_toggle_to_light()}
					title={theme === 'light' ? m.theme_toggle_to_dark() : m.theme_toggle_to_light()}
				>
					{#if theme === 'light'}
						<AppIcon name="moon" class="h-4 w-4" />
						{m.theme_dark()}
					{:else}
						<AppIcon name="sun" class="h-4 w-4" />
						{m.theme_light()}
					{/if}
				</button>
			</div>
		</div>
	</div>
</header>

{#if mobileMenuOpen}
	<button
		type="button"
		class="fixed inset-0 z-40 bg-[#0f1e42]/45 backdrop-blur-[1px] md:hidden"
		onclick={closeMobileMenu}
		aria-label="close menu"
	></button>
{/if}

<aside
	class={`fixed top-0 left-0 z-50 h-dvh w-[82%] max-w-sm border-r border-[var(--border)] bg-[var(--bg-elevated)] p-4 pt-[calc(env(safe-area-inset-top)+1rem)] shadow-[var(--shadow)] transition-transform md:hidden ${
		mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
	}`}
>
	<div class="flex items-center justify-between">
		<a
			class="inline-flex items-center gap-2"
			href={resolve(routeHref(ROUTES.home))}
			onclick={closeMobileMenu}
		>
			<img
				src={logo}
				alt={m.app_brand()}
				class="h-9 w-9 rounded-lg border border-[var(--brand-soft)] bg-[var(--bg-elevated)] p-1"
			/>
			<span class="text-lg font-extrabold tracking-tight text-[var(--brand)]">{m.app_brand()}</span>
		</a>
		<button
			type="button"
			class="grid h-9 w-9 place-content-center rounded-xl border border-[var(--border)] bg-[var(--bg-muted)]"
			onclick={closeMobileMenu}
			aria-label="close menu"
		>
			<AppIcon name="x" class="h-5 w-5" />
		</button>
	</div>

	<nav class="mt-5 grid gap-2">
		{#each navItems as item (item.path)}
			<a
				href={resolve(routeHref(item.path))}
				onclick={closeMobileMenu}
				class={`inline-flex items-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
					isActive(item.path)
						? 'border-[var(--brand)] bg-[var(--brand-soft)]/25 text-[var(--brand)]'
						: 'border-[var(--border)] bg-[var(--bg-muted)] text-[var(--text-main)]'
				}`}
			>
				<AppIcon name={item.icon} class="h-4 w-4" />
				{item.label()}
			</a>
		{/each}
	</nav>

	<div class="surface-soft mt-5 p-3">
		<p class="mb-2 text-xs font-semibold tracking-wide text-[var(--text-soft)] uppercase">
			language
		</p>
		<div class="grid grid-cols-3 gap-2">
			{#each locales as locale (locale)}
				<button
					type="button"
					onclick={() => switchLocale(locale)}
					class={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
						currentLocale === locale
							? 'border-[var(--brand)] bg-[var(--brand)] text-white'
							: 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)]'
					}`}
				>
					{localeLabel(locale)}
				</button>
			{/each}
		</div>
	</div>

	<button type="button" class="btn btn-secondary mt-4 w-full" onclick={toggleTheme}>
		{#if theme === 'light'}
			<AppIcon name="moon" class="h-4 w-4" />
			{m.theme_dark()}
		{:else}
			<AppIcon name="sun" class="h-4 w-4" />
			{m.theme_light()}
		{/if}
	</button>
</aside>

<nav
	class="mobile-tabbar fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--bg-elevated)]/95 shadow-[0_-10px_30px_rgba(24,46,98,0.16)] backdrop-blur-sm md:hidden"
>
	<div class="mx-auto max-w-6xl px-2 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+0.35rem)]">
		<div
			class="grid gap-1"
			style={`grid-template-columns: repeat(${mobileTabItems.length}, minmax(0, 1fr));`}
		>
			{#each mobileTabItems as item (item.path)}
				<a
					href={resolve(routeHref(item.path))}
					class={`flex min-h-14 flex-col items-center justify-center rounded-xl px-1 text-[11px] leading-tight font-semibold transition ${
						isActive(item.path)
							? 'bg-[var(--brand)] text-white'
							: 'text-[var(--text-soft)] hover:bg-[var(--bg-muted)]'
					}`}
				>
					<AppIcon name={item.icon} class="mb-0.5 h-4 w-4" />
					<span class="max-w-[5.6rem] text-center">{item.label()}</span>
				</a>
			{/each}
		</div>
	</div>
</nav>
