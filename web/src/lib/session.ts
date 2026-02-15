import { writable } from 'svelte/store';
import type { AuthResult } from './api';

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

export function readSession(): SessionState | null {
	if (!isBrowser()) return null;
	const raw = window.localStorage.getItem(STORAGE_KEY);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as SessionState;
	} catch {
		window.localStorage.removeItem(STORAGE_KEY);
		return null;
	}
}

export function initSession() {
	session.set(readSession());
}

export function setSession(next: SessionState) {
	if (isBrowser()) {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	}
	session.set(next);
}

export function clearSession() {
	if (isBrowser()) {
		window.localStorage.removeItem(STORAGE_KEY);
	}
	session.set(null);
}
