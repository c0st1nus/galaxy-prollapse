import { localizeHref } from '$lib/paraglide/runtime.js';
import type { UserRole } from '$lib/api';
import { normalizeUserRoleOrDefault } from '$lib/roles';

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

export function roleDashboardRoute(role: UserRole | string): RoleDashboardRoute {
	const normalizedRole = normalizeUserRoleOrDefault(role);
	if (normalizedRole === 'admin') return ROUTES.appAdmin;
	if (normalizedRole === 'supervisor') return ROUTES.appSupervisor;
	if (normalizedRole === 'cleaner') return ROUTES.appCleaner;
	return ROUTES.appClient;
}
