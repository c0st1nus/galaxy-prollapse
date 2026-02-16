import type { Reroute, Transport } from '@sveltejs/kit';
import { deLocalizeUrl } from '$lib/paraglide/runtime.js';

export const reroute: Reroute = (request) => deLocalizeUrl(request.url).pathname;
export const transport: Transport = {};
