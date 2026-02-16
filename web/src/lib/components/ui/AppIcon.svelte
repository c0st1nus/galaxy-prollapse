<script lang="ts">
	export type IconName =
		| 'arrow-right'
		| 'building'
		| 'calendar'
		| 'camera'
		| 'check-circle'
		| 'checklist'
		| 'chevron-right'
		| 'clipboard'
		| 'filter'
		| 'globe'
		| 'home'
		| 'lock'
		| 'log-out'
		| 'mail'
		| 'menu'
		| 'map-pin'
		| 'message-square'
		| 'moon'
		| 'phone'
		| 'play'
		| 'plus'
		| 'refresh'
		| 'shield'
		| 'sparkles'
		| 'star'
		| 'sun'
		| 'trash'
		| 'upload'
		| 'user'
		| 'users'
		| 'x';

	type PathNode = { tag: 'path'; attrs: { d: string } };
	type CircleNode = { tag: 'circle'; attrs: { cx: number; cy: number; r: number } };
	type RectNode = {
		tag: 'rect';
		attrs: { x: number; y: number; width: number; height: number; rx?: number };
	};
	type IconNode = PathNode | CircleNode | RectNode;

	const p = (d: string): PathNode => ({ tag: 'path', attrs: { d } });
	const c = (cx: number, cy: number, r: number): CircleNode => ({
		tag: 'circle',
		attrs: { cx, cy, r }
	});
	const r = (x: number, y: number, width: number, height: number, rx?: number): RectNode => ({
		tag: 'rect',
		attrs: { x, y, width, height, rx }
	});

	let {
		name,
		class: className = 'h-5 w-5',
		strokeWidth = 1.9
	} = $props<{
		name: IconName;
		class?: string;
		strokeWidth?: number;
	}>();

	const icons: Record<IconName, IconNode[]> = {
		'arrow-right': [p('M5 12h14'), p('m13 5 7 7-7 7')],
		building: [
			p('M3 21h18'),
			p('M5 21V7l8-4v18'),
			p('M19 21V11l-6-4'),
			p('M9 9v1'),
			p('M9 13v1'),
			p('M9 17v1'),
			p('M13 13v1'),
			p('M13 17v1')
		],
		calendar: [p('M8 2v4'), p('M16 2v4'), r(3, 4, 18, 18, 2), p('M3 10h18')],
		camera: [p('M4 7h4l2-3h4l2 3h4v13H4z'), c(12, 13, 4)],
		'check-circle': [c(12, 12, 9), p('m8.5 12.5 2.3 2.3 4.7-4.7')],
		checklist: [
			r(4, 3, 16, 18, 2),
			p('M8 7h8'),
			p('M8 12h8'),
			p('M8 17h5'),
			p('m6 7 .5.5L7.5 6.5'),
			p('m6 12 .5.5 1-1')
		],
		'chevron-right': [p('m9 18 6-6-6-6')],
		clipboard: [r(5, 4, 14, 18, 2), r(9, 4.5, 6, 3), p('M8.5 11h7'), p('M8.5 15h7')],
		filter: [p('M4 6h16'), p('M7 12h10'), p('M10 18h4')],
		globe: [c(12, 12, 9), p('M3 12h18'), p('M12 3a14 14 0 0 1 0 18'), p('M12 3a14 14 0 0 0 0 18')],
		home: [p('M3 10.5 12 3l9 7.5'), p('M5 9.5V21h14V9.5')],
		lock: [r(4, 11, 16, 10, 2), p('M8 11V8a4 4 0 1 1 8 0v3')],
		'log-out': [p('M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4'), p('M10 17l5-5-5-5'), p('M15 12H3')],
		mail: [r(3, 5, 18, 14, 2), p('m3 7 9 6 9-6')],
		menu: [p('M3 6h18'), p('M3 12h18'), p('M3 18h18')],
		'map-pin': [p('M12 22s7-5.5 7-12a7 7 0 1 0-14 0c0 6.5 7 12 7 12Z'), c(12, 10, 2.5)],
		'message-square': [r(3, 4, 18, 14, 2), p('M8 20h8')],
		moon: [p('M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z')],
		phone: [
			p(
				'M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 11.2 19a19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.2 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.8.7a2 2 0 0 1 1.7 2Z'
			)
		],
		play: [p('m8 6 10 6-10 6z')],
		plus: [p('M12 5v14'), p('M5 12h14')],
		refresh: [
			p('M20 11a8 8 0 0 0-14.8-4'),
			p('M4 13a8 8 0 0 0 14.8 4'),
			p('M3 3v5h5'),
			p('M21 21v-5h-5')
		],
		shield: [p('M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z'), p('m9 12 2 2 4-4')],
		sparkles: [
			p('M12 3v4'),
			p('M12 17v4'),
			p('m5.6 5.6 2.8 2.8'),
			p('m15.6 15.6 2.8 2.8'),
			p('M3 12h4'),
			p('M17 12h4'),
			p('m5.6 18.4 2.8-2.8'),
			p('m15.6 8.4 2.8-2.8')
		],
		star: [p('m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z')],
		sun: [
			c(12, 12, 5),
			p('M12 1v2'),
			p('M12 21v2'),
			p('M4.2 4.2l1.4 1.4'),
			p('M18.4 18.4l1.4 1.4'),
			p('M1 12h2'),
			p('M21 12h2'),
			p('M4.2 19.8l1.4-1.4'),
			p('M18.4 5.6l1.4-1.4')
		],
		trash: [p('M3 6h18'), p('M8 6V4h8v2'), p('m8 6 1 14h6l1-14')],
		upload: [p('M12 16V6'), p('m8.5 9.5 3.5-3.5 3.5 3.5'), p('M4 19h16')],
		user: [c(12, 8, 4), p('M4 20a8 8 0 0 1 16 0')],
		users: [
			c(9, 8, 3),
			c(17, 9, 2.5),
			p('M3 20a6 6 0 0 1 12 0'),
			p('M14.5 20a4.5 4.5 0 0 1 6.5-4')
		],
		x: [p('M18 6 6 18'), p('M6 6l12 12')]
	};
</script>

<svg
	class={className}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#each icons[name as IconName] as node, idx (idx)}
		<svelte:element this={node.tag} {...node.attrs} />
	{/each}
</svg>
