<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import AppIcon from './AppIcon.svelte';
	import { readCurrentPosition } from '$lib/native';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';

	let {
		latitude = $bindable(''),
		longitude = $bindable(''),
		address = $bindable(''),
		onLocationChange
	}: {
		latitude: string;
		longitude: string;
		address?: string;
		onLocationChange?: (lat: string, lng: string, addr: string) => void;
	} = $props();

	type LocationSuggestion = {
		display_name: string;
		lat: string;
		lon: string;
		importance?: number;
	};

	let query = $state('');
	let suggestions = $state<LocationSuggestion[]>([]);
	let searching = $state(false);
	let showSuggestions = $state(false);
	let mapContainer = $state<HTMLDivElement | null>(null);
	let mapExpanded = $state(false);
	let locatingGps = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let searchController = $state<AbortController | null>(null);
	let searchSequence = $state(0);

	const SEARCH_LOCAL_LIMIT = 12;
	const SEARCH_GLOBAL_LIMIT = 24;
	const SEARCH_MAX_RESULTS = 20;
	const DEFAULT_MAP_ZOOM = 15;
	const MIN_MAP_ZOOM = 3;
	const MAX_MAP_ZOOM = 19;
	const TILE_SIZE = 256;
	const TILE_COLS = 5;
	const TILE_ROWS = 5;
	const MAX_MERCATOR_LAT = 85.05112878;
	const DEFAULT_LAT = 51.12;
	const DEFAULT_LON = 71.43;
	let mapZoom = $state(DEFAULT_MAP_ZOOM);
	let activePointerId = $state<number | null>(null);
	let mapIsDragging = $state(false);
	let pointerStartX = 0;
	let pointerStartY = 0;
	let pointerStartWorldX = 0;
	let pointerStartWorldY = 0;
	let suppressNextMapClick = false;

	const tileProviders = [
		(z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
		(z: number, x: number, y: number) => `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`,
		(z: number, x: number, y: number) => `https://b.tile.openstreetmap.org/${z}/${x}/${y}.png`,
		(z: number, x: number, y: number) => `https://c.tile.openstreetmap.org/${z}/${x}/${y}.png`,
		(z: number, x: number, y: number) => `https://basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`
	] as const;

	/** Map locale to Nominatim Accept-Language value */
	function nominatimLang(): string {
		const loc = getLocale();
		if (loc === 'ru') return 'ru,en';
		if (loc === 'kz') return 'kk,ru,en';
		return 'en,ru';
	}

	function notifyChange(lat: string, lng: string, addr: string) {
		latitude = lat;
		longitude = lng;
		address = addr;
		onLocationChange?.(lat, lng, addr);
	}

	function normalizeLatitude(value: number): number {
		return Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, value));
	}

	function normalizeLongitude(value: number): number {
		return ((((value + 180) % 360) + 360) % 360) - 180;
	}

	function resolvedLatitude(): number {
		const parsed = Number(latitude);
		if (!Number.isFinite(parsed)) return DEFAULT_LAT;
		return normalizeLatitude(parsed);
	}

	function resolvedLongitude(): number {
		const parsed = Number(longitude);
		if (!Number.isFinite(parsed)) return DEFAULT_LON;
		return normalizeLongitude(parsed);
	}

	function clampMapZoom(zoom: number): number {
		return Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, Math.round(zoom)));
	}

	function zoomBy(delta: number) {
		mapZoom = clampMapZoom(mapZoom + delta);
	}

	function worldSizePx(zoom: number): number {
		return Math.pow(2, zoom) * TILE_SIZE;
	}

	function worldToLatLon(worldX: number, worldY: number, zoom: number): { lat: number; lon: number } {
		const size = worldSizePx(zoom);
		const wrappedX = ((worldX % size) + size) % size;
		const clampedY = Math.max(0, Math.min(size - 1, worldY));
		const tileX = wrappedX / TILE_SIZE;
		const tileY = clampedY / TILE_SIZE;
		return {
			lat: normalizeLatitude(tile2lat(tileY, zoom)),
			lon: normalizeLongitude(tile2lon(tileX, zoom))
		};
	}

	function setCenterFromWorldPixels(worldX: number, worldY: number) {
		const center = worldToLatLon(worldX, worldY, mapZoom);
		notifyChange(center.lat.toFixed(6), center.lon.toFixed(6), address);
	}

	function parseSuggestions(payload: unknown): LocationSuggestion[] {
		if (!Array.isArray(payload)) return [];
		const items: LocationSuggestion[] = [];
		for (const raw of payload) {
			if (!raw || typeof raw !== 'object') continue;
			const row = raw as Record<string, unknown>;
			if (
				typeof row.display_name !== 'string' ||
				typeof row.lat !== 'string' ||
				typeof row.lon !== 'string'
			) {
				continue;
			}
			const item: LocationSuggestion = {
				display_name: row.display_name,
				lat: row.lat,
				lon: row.lon
			};
			if (typeof row.importance === 'number') item.importance = row.importance;
			items.push(item);
		}
		return items;
	}

	function suggestionKey(item: LocationSuggestion): string {
		const latKey = Number(item.lat);
		const lonKey = Number(item.lon);
		const latPart = Number.isFinite(latKey) ? latKey.toFixed(5) : item.lat;
		const lonPart = Number.isFinite(lonKey) ? lonKey.toFixed(5) : item.lon;
		return `${latPart}|${lonPart}|${item.display_name.toLowerCase()}`;
	}

	function mergeSuggestions(local: LocationSuggestion[], global: LocationSuggestion[]): LocationSuggestion[] {
		const merged: LocationSuggestion[] = [];
		const seen = new Set<string>();
		const append = (rows: LocationSuggestion[]) => {
			for (const row of rows) {
				const key = suggestionKey(row);
				if (seen.has(key)) continue;
				seen.add(key);
				merged.push(row);
				if (merged.length >= SEARCH_MAX_RESULTS) return;
			}
		};
		append(local);
		append(global);
		return merged;
	}

	function nominatimSearchParams(q: string, limit: number, countrycodes?: string): URLSearchParams {
		const params = new URLSearchParams({
			format: 'jsonv2',
			q,
			limit: String(limit),
			addressdetails: '0',
			dedupe: '0'
		});
		if (countrycodes) params.set('countrycodes', countrycodes);
		return params;
	}

	async function fetchSuggestions(
		params: URLSearchParams,
		controller: AbortController
	): Promise<LocationSuggestion[]> {
		const url = `https://nominatim.openstreetmap.org/search?${params}`;
		const res = await fetch(url, {
			headers: { 'Accept-Language': nominatimLang() },
			signal: controller.signal
		});
		if (!res.ok) return [];
		return parseSuggestions(await res.json());
	}

	async function searchAddress(q: string) {
		const trimmed = q.trim();
		if (trimmed.length < 2) {
			suggestions = [];
			showSuggestions = false;
			searching = false;
			searchController?.abort();
			searchController = null;
			return;
		}
		searchController?.abort();
		const controller = new AbortController();
		searchController = controller;
		const currentSearch = ++searchSequence;
		searching = true;
		try {
			const [localResult, globalResult] = await Promise.allSettled([
				fetchSuggestions(nominatimSearchParams(trimmed, SEARCH_LOCAL_LIMIT, 'kz'), controller),
				fetchSuggestions(nominatimSearchParams(trimmed, SEARCH_GLOBAL_LIMIT), controller)
			]);
			if (currentSearch !== searchSequence) return;
			const local = localResult.status === 'fulfilled' ? localResult.value : [];
			const global = globalResult.status === 'fulfilled' ? globalResult.value : [];
			suggestions = mergeSuggestions(local, global);
			showSuggestions = suggestions.length > 0;
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			if (currentSearch === searchSequence) {
				suggestions = [];
				showSuggestions = false;
			}
		} finally {
			if (currentSearch === searchSequence) searching = false;
			if (searchController === controller) searchController = null;
		}
	}

	function onInput(value: string) {
		query = value;
		if (debounceTimer) clearTimeout(debounceTimer);
		if (value.trim().length < 2) {
			searchController?.abort();
			searchController = null;
			searching = false;
			suggestions = [];
			showSuggestions = false;
			return;
		}
		showSuggestions = true;
		debounceTimer = setTimeout(() => searchAddress(value), 300);
	}

	function selectSuggestion(item: LocationSuggestion) {
		query = item.display_name;
		showSuggestions = false;
		suggestions = [];
		notifyChange(
			Number(item.lat).toFixed(6),
			Number(item.lon).toFixed(6),
			item.display_name
		);
	}

	async function useDeviceGps() {
		locatingGps = true;
		try {
			const coords = await readCurrentPosition();
			const lat = coords.latitude.toFixed(6);
			const lng = coords.longitude.toFixed(6);
			notifyChange(lat, lng, address);
			query = `${lat}, ${lng}`;
			try {
				const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
				const res = await fetch(url, { headers: { 'Accept-Language': nominatimLang() } });
				if (res.ok) {
					const data = await res.json();
					if (data.display_name) {
						query = data.display_name;
						notifyChange(lat, lng, data.display_name);
					}
				}
			} catch {
				/* reverse geocode is best-effort */
			}
		} catch (err) {
			console.error('GPS error:', err);
		} finally {
			locatingGps = false;
		}
	}

	function reverseGeocode(lat: string, lng: string) {
		fetch(
			`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
			{ headers: { 'Accept-Language': nominatimLang() } }
		)
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (data?.display_name) {
					query = data.display_name;
					notifyChange(lat, lng, data.display_name);
				}
			})
			.catch(() => {});
	}

	function handleMapClick(event: MouseEvent) {
		if (suppressNextMapClick) {
			suppressNextMapClick = false;
			return;
		}
		if (!mapContainer) return;
		const rect = mapContainer.getBoundingClientRect();
		const zoom = mapZoom;
		const latNum = resolvedLatitude();
		const lngNum = resolvedLongitude();
		const size = worldSizePx(zoom);

		const clickOffsetX = event.clientX - rect.left - rect.width / 2;
		const clickOffsetY = event.clientY - rect.top - rect.height / 2;

		const centerWorldX = lon2tile(lngNum, zoom) * TILE_SIZE;
		const centerWorldY = lat2tile(latNum, zoom) * TILE_SIZE;
		const clickWorldX = centerWorldX + clickOffsetX;
		const clickWorldY = centerWorldY + clickOffsetY;

		const wrappedX = ((clickWorldX % size) + size) % size;
		const clampedY = Math.max(0, Math.min(size - 1, clickWorldY));

		const tileX = wrappedX / TILE_SIZE;
		const tileY = clampedY / TILE_SIZE;

		const newLat = normalizeLatitude(tile2lat(tileY, zoom));
		const newLng = normalizeLongitude(tile2lon(tileX, zoom));

		const lat = newLat.toFixed(6);
		const lng = newLng.toFixed(6);
		notifyChange(lat, lng, address);
		reverseGeocode(lat, lng);
	}

	function handleMapPointerDown(event: PointerEvent) {
		if (!mapContainer) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		activePointerId = event.pointerId;
		mapIsDragging = false;
		suppressNextMapClick = false;
		pointerStartX = event.clientX;
		pointerStartY = event.clientY;
		pointerStartWorldX = lon2tile(resolvedLongitude(), mapZoom) * TILE_SIZE;
		pointerStartWorldY = lat2tile(resolvedLatitude(), mapZoom) * TILE_SIZE;
		mapContainer.setPointerCapture(event.pointerId);
	}

	function handleMapPointerMove(event: PointerEvent) {
		if (activePointerId !== event.pointerId) return;
		const dx = event.clientX - pointerStartX;
		const dy = event.clientY - pointerStartY;
		if (!mapIsDragging && Math.hypot(dx, dy) > 3) {
			mapIsDragging = true;
		}
		if (!mapIsDragging) return;
		setCenterFromWorldPixels(pointerStartWorldX - dx, pointerStartWorldY - dy);
		suppressNextMapClick = true;
		event.preventDefault();
	}

	function releaseMapPointer(pointerId: number) {
		if (!mapContainer) return;
		if (mapContainer.hasPointerCapture(pointerId)) {
			mapContainer.releasePointerCapture(pointerId);
		}
	}

	function handleMapPointerUp(event: PointerEvent) {
		if (activePointerId !== event.pointerId) return;
		const dragged = mapIsDragging;
		releaseMapPointer(event.pointerId);
		activePointerId = null;
		mapIsDragging = false;
		if (dragged && latitude && longitude) {
			reverseGeocode(latitude, longitude);
			setTimeout(() => {
				suppressNextMapClick = false;
			}, 0);
		}
	}

	function handleMapPointerCancel(event: PointerEvent) {
		if (activePointerId !== event.pointerId) return;
		releaseMapPointer(event.pointerId);
		activePointerId = null;
		mapIsDragging = false;
		suppressNextMapClick = true;
	}

	function handleMapWheel(event: WheelEvent) {
		event.preventDefault();
		if (event.deltaY < 0) zoomBy(1);
		if (event.deltaY > 0) zoomBy(-1);
	}

	function lon2tile(lon: number, zoom: number) {
		return ((lon + 180) / 360) * Math.pow(2, zoom);
	}

	function lat2tile(lat: number, zoom: number) {
		return (
			((1 -
				Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) /
					Math.PI) /
				2) *
			Math.pow(2, zoom)
		);
	}

	function tile2lon(tileX: number, zoom: number) {
		return (tileX / Math.pow(2, zoom)) * 360 - 180;
	}

	function tile2lat(tileY: number, zoom: number) {
		const n = Math.PI - (2 * Math.PI * tileY) / Math.pow(2, zoom);
		return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
	}

	function buildTileUrl(providerIndex: number, zoom: number, tileX: number, tileY: number): string {
		const provider = tileProviders[Math.max(0, Math.min(providerIndex, tileProviders.length - 1))];
		return provider(zoom, tileX, tileY);
	}

	function handleTileError(event: Event) {
		const image = event.currentTarget as HTMLImageElement;
		const z = Number(image.dataset.z);
		const x = Number(image.dataset.x);
		const y = Number(image.dataset.y);
		let providerIndex = Number(image.dataset.providerIndex ?? '0');
		if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) return;
		if (!Number.isFinite(providerIndex)) providerIndex = 0;
		if (providerIndex >= tileProviders.length - 1) return;
		const nextProvider = providerIndex + 1;
		image.dataset.providerIndex = String(nextProvider);
		image.src = buildTileUrl(nextProvider, z, x, y);
	}

	let mapTiles = $derived.by(() => {
		const lat = resolvedLatitude();
		const lng = resolvedLongitude();
		const zoom = mapZoom;
		const maxTile = Math.pow(2, zoom) - 1;

		const centerTileX = lon2tile(lng, zoom);
		const centerTileY = lat2tile(lat, zoom);

		const centerCol = Math.floor(TILE_COLS / 2);
		const centerRow = Math.floor(TILE_ROWS / 2);
		const baseTileX = Math.floor(centerTileX) - centerCol;
		const baseTileY = Math.floor(centerTileY) - centerRow;

		const fractX = centerTileX - Math.floor(centerTileX);
		const fractY = centerTileY - Math.floor(centerTileY);

		const shiftX = centerCol * TILE_SIZE + fractX * TILE_SIZE;
		const shiftY = centerRow * TILE_SIZE + fractY * TILE_SIZE;

		const worldSize = Math.pow(2, zoom);
		const tiles: Array<{ key: string; url: string; x: number; y: number; z: number; tx: number; ty: number }> = [];
		for (let dy = 0; dy < TILE_ROWS; dy++) {
			for (let dx = 0; dx < TILE_COLS; dx++) {
				const rawX = baseTileX + dx;
				const rawY = baseTileY + dy;
				const tx = ((rawX % worldSize) + worldSize) % worldSize;
				const ty = Math.max(0, Math.min(maxTile, rawY));
				tiles.push({
					key: `${zoom}-${dx}-${dy}-${tx}-${ty}`,
					url: buildTileUrl(0, zoom, tx, ty),
					x: dx * TILE_SIZE,
					y: dy * TILE_SIZE,
					z: zoom,
					tx,
					ty
				});
			}
		}
		return {
			tiles,
			shiftX,
			shiftY,
			gridWidth: TILE_SIZE * TILE_COLS,
			gridHeight: TILE_SIZE * TILE_ROWS
		};
	});

	onMount(() => {
		if (latitude && longitude) {
			query = address || `${latitude}, ${longitude}`;
		}
	});

	onDestroy(() => {
		if (debounceTimer) clearTimeout(debounceTimer);
		searchController?.abort();
		searchController = null;
		if (activePointerId !== null) {
			releaseMapPointer(activePointerId);
			activePointerId = null;
		}
	});
</script>

<div class="location-picker grid gap-3">
	<div class="relative">
		<div class="field-with-icon">
			<AppIcon name="map-pin" class="field-icon h-4 w-4" />
			<input
				type="text"
				class="field-control field-control-with-icon"
				placeholder={m.location_picker_search_placeholder()}
				value={query}
				oninput={(e) => onInput((e.currentTarget as HTMLInputElement).value)}
				onfocus={() => {
					if (suggestions.length) showSuggestions = true;
				}}
				onblur={() => setTimeout(() => (showSuggestions = false), 200)}
			/>
		</div>
		{#if searching}
			<div class="absolute top-1/2 right-3 -translate-y-1/2">
				<AppIcon name="refresh" class="h-4 w-4 animate-spin text-[var(--text-soft)]" />
			</div>
		{/if}
		{#if showSuggestions && suggestions.length > 0}
			<ul
				class="absolute inset-x-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-lg"
			>
				{#each suggestions as item, idx (idx)}
					<li>
						<button
							type="button"
							class="w-full px-3 py-2 text-left text-sm hover:bg-[var(--bg-muted)] transition"
							onmousedown={() => selectSuggestion(item)}
						>
							<AppIcon name="map-pin" class="mr-1.5 inline h-3.5 w-3.5 text-[var(--brand)]" />
							{item.display_name}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<button
			type="button"
			class="btn btn-secondary w-full sm:w-auto"
			onclick={useDeviceGps}
			disabled={locatingGps}
		>
			<AppIcon name="map-pin" class="h-4 w-4" />
			{locatingGps ? m.location_picker_locating() : m.location_picker_use_gps()}
		</button>
		<button
			type="button"
			class="btn btn-ghost w-full sm:w-auto"
			onclick={() => (mapExpanded = !mapExpanded)}
		>
			<AppIcon name="globe" class="h-4 w-4" />
			{mapExpanded ? m.location_picker_hide_map() : m.location_picker_show_map()}
		</button>
		{#if latitude && longitude}
			<span class="chip text-xs">
				{latitude}, {longitude}
			</span>
		{/if}
	</div>

	{#if mapExpanded}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={mapContainer}
			class={`relative h-[250px] w-full touch-none overflow-hidden rounded-xl border border-[var(--border)] ${mapIsDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
			role="application"
			aria-label={m.location_picker_map_aria()}
			onclick={handleMapClick}
			onwheel={handleMapWheel}
			onpointerdown={handleMapPointerDown}
			onpointermove={handleMapPointerMove}
			onpointerup={handleMapPointerUp}
			onpointercancel={handleMapPointerCancel}
		>
			<div class="absolute right-2 top-2 z-10 flex flex-col gap-1">
				<button
					type="button"
					aria-label="Zoom in"
					title="Zoom in"
					class="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-sm font-semibold text-[var(--text-main)] shadow-sm transition hover:bg-[var(--bg-muted)] disabled:cursor-not-allowed disabled:opacity-50"
					disabled={mapZoom >= MAX_MAP_ZOOM}
					onpointerdown={(event) => event.stopPropagation()}
					onclick={(event) => {
						event.stopPropagation();
						zoomBy(1);
					}}
				>
					+
				</button>
				<button
					type="button"
					aria-label="Zoom out"
					title="Zoom out"
					class="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-sm font-semibold text-[var(--text-main)] shadow-sm transition hover:bg-[var(--bg-muted)] disabled:cursor-not-allowed disabled:opacity-50"
					disabled={mapZoom <= MIN_MAP_ZOOM}
					onpointerdown={(event) => event.stopPropagation()}
					onclick={(event) => {
						event.stopPropagation();
						zoomBy(-1);
					}}
				>
					-
				</button>
			</div>
			<span class="absolute left-2 top-2 z-10 rounded-md bg-black/50 px-2 py-0.5 text-xs text-white">
				z{mapZoom}
			</span>
			<div
				class="absolute"
				style="width:{mapTiles.gridWidth}px;height:{mapTiles.gridHeight}px;left:calc(50% - {mapTiles.shiftX}px);top:calc(50% - {mapTiles.shiftY}px)"
			>
				{#each mapTiles.tiles as tile (tile.key)}
					<img
						src={tile.url}
						alt=""
						width={TILE_SIZE}
						height={TILE_SIZE}
						class="absolute"
						style="left:{tile.x}px;top:{tile.y}px"
						draggable="false"
						data-z={tile.z}
						data-x={tile.tx}
						data-y={tile.ty}
						data-provider-index="0"
						referrerpolicy="no-referrer"
						onerror={handleTileError}
					/>
				{/each}
			</div>
			<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
				<div class="flex flex-col items-center">
					<AppIcon name="map-pin" class="h-8 w-8 text-red-600 drop-shadow-lg" />
					<div class="h-1 w-1 rounded-full bg-red-600"></div>
				</div>
			</div>
			<p class="absolute bottom-1 left-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
				{m.location_picker_click_to_adjust()}
			</p>
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
		<label class="grid gap-1 text-sm font-semibold text-[var(--text-soft)]">
			<span>{m.location_picker_latitude()}</span>
			<input
				type="number"
				step="0.000001"
				class="field-control"
				bind:value={latitude}
				oninput={() => notifyChange(latitude, longitude, address)}
			/>
		</label>
		<label class="grid gap-1 text-sm font-semibold text-[var(--text-soft)]">
			<span>{m.location_picker_longitude()}</span>
			<input
				type="number"
				step="0.000001"
				class="field-control"
				bind:value={longitude}
				oninput={() => notifyChange(latitude, longitude, address)}
			/>
		</label>
	</div>
</div>
