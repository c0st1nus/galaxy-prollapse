import type { UserRole } from '$lib/api';

const roleAliases: Record<string, UserRole> = {
	admin: 'admin',
	admins: 'admin',
	supervisor: 'supervisor',
	supervisors: 'supervisor',
	superviser: 'supervisor',
	supervisers: 'supervisor',
	cleaner: 'cleaner',
	cleaners: 'cleaner',
	client: 'client',
	clients: 'client'
};

export function normalizeUserRole(role: unknown): UserRole | null {
	if (typeof role !== 'string') return null;
	return roleAliases[role.trim().toLowerCase()] ?? null;
}

export function normalizeUserRoleOrDefault(role: unknown, fallback: UserRole = 'client'): UserRole {
	return normalizeUserRole(role) ?? fallback;
}
