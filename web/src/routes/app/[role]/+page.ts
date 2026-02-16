import { error } from '@sveltejs/kit';
import type { UserRole } from '$lib/api';

const supportedRoles = new Set<UserRole>(['admin', 'supervisor', 'cleaner', 'client']);

export function load({ params }: { params: { role: string } }) {
	if (!supportedRoles.has(params.role as UserRole)) {
		throw error(404, 'Not found');
	}

	return {
		role: params.role as UserRole
	};
}
