<script lang="ts">
	import { Button } from 'bits-ui';
	import * as m from '$lib/paraglide/messages';
    import Accordion from "$components/accordion.svelte";
</script>

<div class="flex h-screen items-center justify-center">
	<button 
		class="bg-black text-white px-6 py-3 rounded-lg"
		on:click={() => goto('/login')}
	>
		Войти
	</button>
</div>
