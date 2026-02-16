import type {UserRole} from "./types";

const ROLE_ALIASES: Record<string, UserRole> = {
    admin: "admin",
    admins: "admin",
    supervisor: "supervisor",
    supervisors: "supervisor",
    superviser: "supervisor",
    supervisers: "supervisor",
    cleaner: "cleaner",
    cleaners: "cleaner",
    client: "client",
    clients: "client",
};

export function normalizeUserRole(rawRole: unknown): UserRole | null {
    if (typeof rawRole !== "string") return null;
    const normalized = rawRole.trim().toLowerCase();
    return ROLE_ALIASES[normalized] ?? null;
}

export function isCleanerRole(rawRole: unknown): boolean {
    return normalizeUserRole(rawRole) === "cleaner";
}
