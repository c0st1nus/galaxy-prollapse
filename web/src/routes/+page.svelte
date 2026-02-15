<script lang="ts">
	import { Button } from 'bits-ui';
	import * as m from '$lib/paraglide/messages';
    import Accordion from "$components/accordion.svelte";
</script>

<div
	class="flex h-screen w-full flex-col items-center justify-center space-y-4 bg-gray-50 text-gray-900"
>
	<h1 class="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
		{m.hello_world({ name: 'SvelteKit User' })}
	</h1>

	<p class="max-w-lg text-center text-lg text-gray-600">
		This is a simple landing page demonstrating SvelteKit, Paraglide JS for i18n, and Bits UI
		components.
	</p>

	<Button.Root
		class="inline-flex h-10 items-center justify-center rounded-md bg-gray-900 px-8 text-sm font-medium text-gray-50 shadow transition-colors hover:bg-gray-900/90 focus-visible:ring-1 focus-visible:ring-gray-950 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
	>
		Get Started
	</Button.Root>
    <Accordion />
</div>
