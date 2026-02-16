// typed jwt payload used across all route modules
export type UserRole = "admin" | "supervisor" | "cleaner" | "client";

export interface JwtPayload {
    id: number;
    role: UserRole;
    company_id: number;
}
