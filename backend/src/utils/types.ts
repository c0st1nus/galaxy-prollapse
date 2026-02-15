// typed jwt payload used across all route modules
export interface JwtPayload {
    id: number;
    role: "admin" | "supervisor" | "cleaner" | "client";
    company_id: number;
}
