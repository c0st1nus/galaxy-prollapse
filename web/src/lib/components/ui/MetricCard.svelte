<script lang="ts">
	import AppIcon, { type IconName } from '$lib/components/ui/AppIcon.svelte';

	let {
		title,
		value,
		detail = '',
		icon
	} = $props<{ title: string; value: string; detail?: string; icon: IconName }>();
</script>

<article class="surface-soft p-4">
	<p
		class="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[var(--text-soft)] uppercase"
	>
		<AppIcon name={icon} class="h-3.5 w-3.5" />
		{title}
	</p>
	<p class="mt-2 text-2xl font-extrabold">{value}</p>
	{#if detail}
		<p class="mt-1 text-sm text-[var(--text-soft)]">{detail}</p>
	{/if}
</article>
