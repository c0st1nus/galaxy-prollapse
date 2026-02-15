import { localizeHref } from '$lib/paraglide/runtime.js';

export type AppRoute =
	| '/'
	| '/app'
	| '/auth'
	| '/dev'
	| '/demo'
	| '/demo/paraglide'
	| '/register'
	| '/register/client';

export const ROUTES = {
	home: '/',
	app: '/app',
	auth: '/auth',
	dev: '/dev',
	demo: '/demo',
	demoParaglide: '/demo/paraglide',
	register: '/register',
	registerClient: '/register/client'
} as const satisfies Record<string, AppRoute>;

export function routeHref(route: AppRoute) {
	return localizeHref(route) as AppRoute;
}
