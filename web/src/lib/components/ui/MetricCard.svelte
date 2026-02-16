<script lang="ts">
	import AppIcon, { type IconName } from '$lib/components/ui/AppIcon.svelte';

	let {
		title,
		value,
		detail = '',
		icon
	} = $props<{ title: string; value: string; detail?: string; icon: IconName }>();
</script>

<article class="surface-soft p-3.5 sm:p-4">
	<p
		class="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--text-soft)] uppercase sm:text-xs"
	>
		<AppIcon name={icon} class="h-3.5 w-3.5" />
		{title}
	</p>
	<p class="mt-2 text-[1.55rem] leading-tight font-extrabold sm:text-2xl">{value}</p>
	{#if detail}
		<p class="mt-1 text-xs text-[var(--text-soft)] sm:text-sm">{detail}</p>
	{/if}
</article>
