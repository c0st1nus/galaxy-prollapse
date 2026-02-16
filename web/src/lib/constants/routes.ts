import { localizeHref } from '$lib/paraglide/runtime.js';
import type { UserRole } from '$lib/api';

export type RoleDashboardRoute = '/app/admin' | '/app/supervisor' | '/app/cleaner' | '/app/client';

export type AppRoute =
	| '/'
	| '/app'
	| RoleDashboardRoute
	| '/auth'
	| '/dev'
	| '/demo'
	| '/demo/paraglide'
	| '/register'
	| '/register/client';

export const ROUTES = {
	home: '/',
	app: '/app',
	appAdmin: '/app/admin',
	appSupervisor: '/app/supervisor',
	appCleaner: '/app/cleaner',
	appClient: '/app/client',
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

export function roleDashboardRoute(role: UserRole): RoleDashboardRoute {
	if (role === 'admin') return ROUTES.appAdmin;
	if (role === 'supervisor') return ROUTES.appSupervisor;
	if (role === 'cleaner') return ROUTES.appCleaner;
	return ROUTES.appClient;
}
