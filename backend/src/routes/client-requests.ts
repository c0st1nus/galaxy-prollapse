import {Elysia, t} from "elysia";
import {db} from "../database";
import {clientServiceRequests, companies, objects} from "../database/schema";
import {and, desc, eq} from "drizzle-orm";
import {jwt} from "@elysiajs/jwt";
import {config} from "../utils/config";
import type {JwtPayload} from "../utils/types";
import {normalizeUserRole} from "../utils/roles";

type RequestedTask = {
    room_type: string;
    area_sqm: number;
    note?: string;
};

type EasySetupUsage = "quiet" | "normal" | "busy";

function baseLevelForRoomType(roomType: string): number {
    if (roomType === "bathroom") return 2;
    if (roomType === "corridor") return 4;
    if (roomType === "lobby" || roomType === "stairwell" || roomType === "elevator") return 4;
    return 3;
}

function recommendedCleaningStandard(tasks: RequestedTask[], usage: EasySetupUsage): string {
    let level = 3;
    if (tasks.length) {
        level = tasks.reduce((acc, task) => {
            return Math.min(acc, baseLevelForRoomType(task.room_type));
        }, 5);
    }

    if (usage === "busy") level = Math.max(1, level - 1);
    if (usage === "quiet") level = Math.min(5, level + 1);
    return `appa_${level}`;
}

function toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const next = Number(value);
    return Number.isFinite(next) ? next : null;
}

function normalizeRequestedTasks(value: unknown): RequestedTask[] {
    if (!Array.isArray(value)) return [];
    const normalized: RequestedTask[] = [];
    for (const raw of value) {
        if (!raw || typeof raw !== "object") continue;
        const row = raw as Record<string, unknown>;
        const roomType = typeof row.room_type === "string" ? row.room_type.trim() : "";
        const area = Number(row.area_sqm);
        const note = typeof row.note === "string" ? row.note.trim() : "";
        if (!roomType || !Number.isInteger(area) || area <= 0) continue;
        normalized.push({
            room_type: roomType,
            area_sqm: area,
            note: note || undefined,
        });
    }
    return normalized;
}

export const clientRequestsRoutes = new Elysia({prefix: "/client-requests"})
    .use(
        jwt({
            name: "jwt",
            secret: config.JWT_SECRET,
        })
    )
    .derive(async ({headers, jwt, set}) => {
        const auth = headers["authorization"];
        if (!auth) {
            set.status = 401;
            throw new Error("Unauthorized");
        }
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
        const profile = await jwt.verify(token);
        if (!profile) {
            set.status = 401;
            throw new Error("Unauthorized");
        }
        const role = normalizeUserRole(profile.role);
        if (!role || role !== "client") {
            set.status = 403;
            throw new Error("Forbidden: only clients can manage service requests");
        }
        const user: JwtPayload = {
            id: Number(profile.id),
            role,
            company_id: Number(profile.company_id),
        };
        return {user};
    })
    .get("/my", async ({user, query}) => {
        const conditions = [eq(clientServiceRequests.client_id, user.id)];
        if (query.company_id !== undefined) {
            conditions.push(eq(clientServiceRequests.company_id, query.company_id));
        }

        const result = await db.select({
            request: clientServiceRequests,
            company: {
                id: companies.id,
                name: companies.name,
            },
            createdObject: {
                id: objects.id,
                address: objects.address,
            },
        })
            .from(clientServiceRequests)
            .innerJoin(companies, eq(clientServiceRequests.company_id, companies.id))
            .leftJoin(objects, eq(clientServiceRequests.created_object_id, objects.id))
            .where(and(...conditions))
            .orderBy(desc(clientServiceRequests.created_at), desc(clientServiceRequests.id));

        return result.map((row) => ({
            ...row.request,
            requested_tasks: normalizeRequestedTasks(row.request.requested_tasks),
            latitude: toNumberOrNull(row.request.latitude),
            longitude: toNumberOrNull(row.request.longitude),
            location_accuracy_meters: toNumberOrNull(row.request.location_accuracy_meters),
            company: row.company,
            created_object: row.createdObject && row.createdObject.id ? row.createdObject : null,
        }));
    }, {
        query: t.Object({
            company_id: t.Optional(t.Integer()),
        }),
    })
    .post("/", async ({body, user, set}) => {
        const objectAddress = body.object_address.trim();
        if (!objectAddress) {
            set.status = 400;
            return {message: "Object address is required"};
        }

        const companyRows = await db.select({
            id: companies.id,
            name: companies.name,
        }).from(companies).where(eq(companies.id, body.company_id)).limit(1);
        if (!companyRows.length) {
            set.status = 404;
            return {message: "Company not found"};
        }

        const tasks = body.tasks
            .map((task) => ({
                room_type: task.room_type.trim(),
                area_sqm: task.area_sqm,
                note: task.note?.trim() || undefined,
            }))
            .filter((task) => task.room_type.length > 0 && Number.isInteger(task.area_sqm) && task.area_sqm > 0);

        if (!tasks.length) {
            set.status = 400;
            return {message: "At least one requested task is required"};
        }

        const easySetupUsage: EasySetupUsage = body.easy_setup_usage ?? "normal";
        const recommendedStandard = recommendedCleaningStandard(tasks, easySetupUsage);

        const inserted = await db.insert(clientServiceRequests).values({
            client_id: user.id,
            company_id: body.company_id,
            status: "pending",
            object_address: objectAddress,
            object_description: body.object_description?.trim() || null,
            latitude: body.latitude !== undefined ? String(body.latitude) : null,
            longitude: body.longitude !== undefined ? String(body.longitude) : null,
            location_accuracy_meters:
                body.location_accuracy_meters !== undefined ? String(body.location_accuracy_meters) : null,
            geofence_radius_meters: 100,
            easy_setup_usage: easySetupUsage,
            recommended_cleaning_standard: recommendedStandard,
            requested_tasks: tasks,
            client_note: body.client_note?.trim() || null,
        }).returning();

        const row = inserted[0];
        return {
            ...row,
            requested_tasks: normalizeRequestedTasks(row.requested_tasks),
            latitude: toNumberOrNull(row.latitude),
            longitude: toNumberOrNull(row.longitude),
            location_accuracy_meters: toNumberOrNull(row.location_accuracy_meters),
            company: companyRows[0],
        };
    }, {
        body: t.Object({
            company_id: t.Integer(),
            object_address: t.String(),
            object_description: t.Optional(t.String()),
            latitude: t.Optional(t.Number()),
            longitude: t.Optional(t.Number()),
            location_accuracy_meters: t.Optional(t.Number({minimum: 0})),
            easy_setup_usage: t.Optional(t.Union([
                t.Literal("quiet"),
                t.Literal("normal"),
                t.Literal("busy"),
            ])),
            tasks: t.Array(t.Object({
                room_type: t.String(),
                area_sqm: t.Integer({minimum: 1}),
                note: t.Optional(t.String()),
            }), {minItems: 1}),
            client_note: t.Optional(t.String()),
        })
    });
