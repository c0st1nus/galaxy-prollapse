import { error } from '@sveltejs/kit';
import type { UserRole } from '$lib/api';
import { normalizeUserRole } from '$lib/roles';

const supportedRoles = new Set<UserRole>(['admin', 'supervisor', 'cleaner', 'client']);

export function load({ params }: { params: { role: string } }) {
	const role = normalizeUserRole(params.role);
	if (!role || !supportedRoles.has(role)) {
		throw error(404, 'Not found');
	}

	return {
		role
	};
}
