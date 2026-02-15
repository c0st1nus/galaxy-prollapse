<script lang="ts">
	import { ui } from '$lib/constants/ui';

	type Kind = 'error' | 'success';

	let { kind, text } = $props<{ kind: Kind; text: string }>();
</script>

<div class={kind === 'error' ? ui.alertError : ui.alertSuccess}>
	{text}
</div>
