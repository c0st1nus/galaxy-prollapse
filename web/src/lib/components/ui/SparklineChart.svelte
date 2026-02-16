<script lang="ts">
	let {
		title,
		labels,
		values,
		color = 'var(--brand)',
		emptyText = 'no data yet'
	} = $props<{
		title: string;
		labels: string[];
		values: number[];
		color?: string;
		emptyText?: string;
	}>();

	const width = 420;
	const height = 150;
	const inset = 22;

	const points = $derived.by(() => {
		if (values.length === 0) return '';
		const max = Math.max(...values, 1);
		const min = Math.min(...values, 0);
		const range = Math.max(1, max - min);
		return values
			.map((value: number, index: number) => {
				const x = inset + (index * (width - inset * 2)) / Math.max(values.length - 1, 1);
				const y = height - inset - ((value - min) / range) * (height - inset * 2);
				return `${x},${y}`;
			})
			.join(' ');
	});
</script>

<article class="surface-soft p-3.5 sm:p-4">
	<p class="text-sm font-semibold text-[var(--text-soft)]">{title}</p>
	{#if values.length === 0}
		<p class="mt-3 text-sm text-[var(--text-soft)]">{emptyText}</p>
	{:else}
		<svg
			class="mt-3 h-32 w-full sm:h-36"
			viewBox={`0 0 ${width} ${height}`}
			role="img"
			aria-label={title}
		>
			<polyline
				{points}
				fill="none"
				stroke={color}
				stroke-width="3"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
			{#each values as value, index (index)}
				{@const x = inset + (index * (width - inset * 2)) / Math.max(values.length - 1, 1)}
				{@const max = Math.max(...values, 1)}
				{@const min = Math.min(...values, 0)}
				{@const range = Math.max(1, max - min)}
				{@const y = height - inset - ((value - min) / range) * (height - inset * 2)}
				<circle cx={x} cy={y} r="3" fill={color} />
			{/each}
		</svg>
		<div class="mt-2 flex flex-wrap gap-2 text-[10px] text-[var(--text-soft)] sm:text-[11px]">
			{#each labels as label, index (index)}
				<span class="chip">{label}: {values[index] ?? 0}</span>
			{/each}
		</div>
	{/if}
</article>
