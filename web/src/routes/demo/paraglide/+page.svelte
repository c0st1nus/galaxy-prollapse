<script lang="ts">
	import { resolve } from '$app/paths';
	import { ROUTES, routeHref } from '$lib/constants/routes';
	import { ui } from '$lib/constants/ui';
	import { m } from '$lib/paraglide/messages.js';
	import { setLocale } from '$lib/paraglide/runtime.js';
</script>

<svelte:head>
	<title>{m.demo_paraglide_title()}</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-12 sm:px-6">
	<section class={`${ui.panel} sm:p-10`}>
		<h1 class="text-3xl font-extrabold sm:text-4xl">{m.demo_paraglide_heading()}</h1>
		<p class="mt-3 text-lg text-[var(--text-soft)]">{m.hello_world({ name: m.app_brand() })}</p>

		<div class="mt-6 flex flex-wrap gap-3">
			<button
				type="button"
				class="rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-4 py-2 text-sm font-semibold text-[var(--text-main)] transition hover:bg-[var(--bg-elevated)]"
				onclick={() => setLocale('en')}
			>
				{m.locale_en()}
			</button>
			<button
				type="button"
				class="rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-4 py-2 text-sm font-semibold text-[var(--text-main)] transition hover:bg-[var(--bg-elevated)]"
				onclick={() => setLocale('ru')}
			>
				{m.locale_ru()}
			</button>
			<button
				type="button"
				class="rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-4 py-2 text-sm font-semibold text-[var(--text-main)] transition hover:bg-[var(--bg-elevated)]"
				onclick={() => setLocale('kz')}
			>
				{m.locale_kz()}
			</button>
		</div>

		<p class="mt-8 text-base text-[var(--text-soft)]">
			{m.demo_paraglide_instructions()}
		</p>

		<p class="mt-3 text-base text-[var(--text-soft)]">
			{m.demo_paraglide_vscode_tip()}
			<a
				class="ml-1 font-semibold text-[var(--brand)] underline"
				href="https://marketplace.visualstudio.com/items?itemName=inlang.vs-code-extension"
				target="_blank"
				rel="noreferrer"
			>
				{m.demo_paraglide_extension_label()}
			</a>
		</p>

		<a
			href={resolve(routeHref(ROUTES.demo))}
			class="mt-8 inline-flex rounded-xl border border-[var(--border)] bg-[var(--bg-muted)] px-5 py-3 text-sm font-semibold text-[var(--text-main)] transition hover:bg-[var(--bg-elevated)] sm:text-base"
		>
			{m.demo_back()}
		</a>
	</section>
</main>
