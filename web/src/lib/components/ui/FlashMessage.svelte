<script lang="ts">
	import AppIcon from '$lib/components/ui/AppIcon.svelte';
	import { ui } from '$lib/constants/ui';

	type Kind = 'error' | 'success';

	let { kind, text } = $props<{ kind: Kind; text: string }>();
</script>

<div class={kind === 'error' ? ui.alertError : ui.alertSuccess}>
	<div class="flex items-start gap-2">
		<AppIcon name={kind === 'error' ? 'shield' : 'check-circle'} class="mt-0.5 h-4 w-4" />
		<span>{text}</span>
	</div>
</div>
