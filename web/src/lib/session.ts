import { writable } from 'svelte/store';
import type { AuthResult } from './api';
import { normalizeUserRoleOrDefault } from './roles';

const STORAGE_KEY = 'tt-auth-session-v1';

export type SessionState = {
	token: string;
	user: AuthResult['user'];
	company: AuthResult['company'];
};

export const session = writable<SessionState | null>(null);

function isBrowser() {
	return typeof window !== 'undefined';
}

function normalizeSession(next: SessionState | null): SessionState | null {
	if (!next || typeof next !== 'object') return null;
	if (!next.user || typeof next.user !== 'object') return null;
	return {
		...next,
		user: {
			...next.user,
			role: normalizeUserRoleOrDefault(next.user.role)
		}
	};
}

export function readSession(): SessionState | null {
	if (!isBrowser()) return null;
	const raw = window.localStorage.getItem(STORAGE_KEY);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as SessionState;
		return normalizeSession(parsed);
	} catch {
		window.localStorage.removeItem(STORAGE_KEY);
		return null;
	}
}

export function initSession() {
	session.set(readSession());
}

export function setSession(next: SessionState) {
	const normalized = normalizeSession(next);
	if (!normalized) {
		clearSession();
		return;
	}
	if (isBrowser()) {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
	}
	session.set(normalized);
}

export function clearSession() {
	if (isBrowser()) {
		window.localStorage.removeItem(STORAGE_KEY);
	}
	session.set(null);
}
