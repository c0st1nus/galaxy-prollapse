import {Elysia, t} from "elysia";
import {db} from "../database";
import {
    geofenceViolations,
    objectPresenceSegments,
    objectSessions,
    objects,
    rooms,
    taskChecklists,
    tasks,
} from "../database/schema";
import {and, asc, desc, eq, gte, inArray, isNull, lt, or} from "drizzle-orm";
import {jwt} from "@elysiajs/jwt";
import {config} from "../utils/config";
import type {JwtPayload} from "../utils/types";
import {normalizeUserRole} from "../utils/roles";
import {geofenceStateForObject, timingForIntervalFromSegments, timingFromSegments} from "../services/time-tracking";

function parseDateOnly(value: string): Date | null {
    const [year, month, day] = value.split("-").map((part) => Number(part));
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function dateWindow(dateQuery?: string) {
    const base = dateQuery ? parseDateOnly(dateQuery) : null;
    const start = base || new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const label = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    return {start, end, label};
}

function numericString(value: number | null | undefined): string | null {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    return String(Math.round(value * 100) / 100);
}

function normalizeChecklistItems(value: unknown): Array<{
    id: string;
    title: string;
    done: boolean;
    note?: string;
    photo_required?: boolean;
    photo_url?: string;
}> {
    if (!Array.isArray(value)) return [];
    const normalized: Array<{
        id: string;
        title: string;
        done: boolean;
        note?: string;
        photo_required?: boolean;
        photo_url?: string;
    }> = [];

    for (let index = 0; index < value.length; index += 1) {
        const item = value[index];
        if (!item || typeof item !== "object") continue;
        const candidate = item as Record<string, unknown>;
        const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
        const row: {
            id: string;
            title: string;
            done: boolean;
            note?: string;
            photo_required?: boolean;
            photo_url?: string;
        } = {
            id: typeof candidate.id === "string" ? candidate.id : `item-${index + 1}`,
            title: title || `Checklist item ${index + 1}`,
            done: Boolean(candidate.done),
        };

        if (typeof candidate.note === "string") row.note = candidate.note;
        row.photo_required = false;
        if (typeof candidate.photo_url === "string") row.photo_url = candidate.photo_url;

        normalized.push(row);
    }

    return normalized;
}

async function pickTaskIdForObject(cleanerId: number, objectId: number): Promise<number | null> {
    const row = await db.select({id: tasks.id})
        .from(tasks)
        .innerJoin(rooms, eq(tasks.room_id, rooms.id))
        .where(and(
            eq(tasks.cleaner_id, cleanerId),
            eq(rooms.object_id, objectId),
            or(eq(tasks.status, "in_progress"), eq(tasks.status, "pending"), eq(tasks.status, "completed")),
        ))
        .orderBy(asc(tasks.id))
        .limit(1);
    return row.length ? row[0].id : null;
}

async function logObjectGeofenceViolation(input: {
    cleanerId: number;
    objectId: number;
    phase: string;
    distanceMeters: number;
    allowedRadiusMeters: number;
    latitude: number;
    longitude: number;
}): Promise<void> {
    const taskId = await pickTaskIdForObject(input.cleanerId, input.objectId);
    if (!taskId) return;
    await db.insert(geofenceViolations).values({
        task_id: taskId,
        cleaner_id: input.cleanerId,
        phase: input.phase,
        distance_meters: numericString(input.distanceMeters) || "0",
        allowed_radius_meters: input.allowedRadiusMeters,
        latitude: String(input.latitude),
        longitude: String(input.longitude),
    });
}

async function activeSessionsForCleaner(cleanerId: number) {
    return db.select()
        .from(objectSessions)
        .where(and(eq(objectSessions.cleaner_id, cleanerId), eq(objectSessions.status, "active")))
        .orderBy(desc(objectSessions.checkin_at));
}

async function activeSessionForObject(cleanerId: number, objectId: number) {
    const rows = await db.select()
        .from(objectSessions)
        .where(and(
            eq(objectSessions.cleaner_id, cleanerId),
            eq(objectSessions.object_id, objectId),
            eq(objectSessions.status, "active"),
        ))
        .orderBy(desc(objectSessions.checkin_at))
        .limit(1);
    return rows[0] || null;
}

async function openSegmentForSession(sessionId: number) {
    const rows = await db.select()
        .from(objectPresenceSegments)
        .where(and(eq(objectPresenceSegments.session_id, sessionId), isNull(objectPresenceSegments.end_at)))
        .orderBy(desc(objectPresenceSegments.start_at))
        .limit(1);
    return rows[0] || null;
}

async function closeOpenSegment(input: {
    sessionId: number;
    endAt: Date;
    distanceMeters?: number | null;
    latitude?: number | null;
    longitude?: number | null;
}) {
    const openSegment = await openSegmentForSession(input.sessionId);
    if (!openSegment) return;
    await db.update(objectPresenceSegments)
        .set({
            end_at: input.endAt,
            end_distance_meters: numericString(input.distanceMeters ?? null),
            end_latitude: input.latitude !== undefined && input.latitude !== null ? String(input.latitude) : null,
            end_longitude: input.longitude !== undefined && input.longitude !== null ? String(input.longitude) : null,
        })
        .where(eq(objectPresenceSegments.id, openSegment.id));
}

async function sessionTimingSummary(sessionId: number, now = new Date()) {
    const segments = await db.select()
        .from(objectPresenceSegments)
        .where(eq(objectPresenceSegments.session_id, sessionId))
        .orderBy(asc(objectPresenceSegments.start_at));
    return timingFromSegments(segments, {now});
}

async function objectForCleaner(objectId: number, cleanerId: number, companyId: number) {
    const rows = await db.select({object: objects})
        .from(objects)
        .innerJoin(rooms, eq(rooms.object_id, objects.id))
        .innerJoin(tasks, eq(tasks.room_id, rooms.id))
        .where(and(
            eq(objects.id, objectId),
            eq(objects.company_id, companyId),
            eq(tasks.cleaner_id, cleanerId),
        ))
        .limit(1);
    return rows[0]?.object || null;
}

export const cleanerFlowRoutes = new Elysia({prefix: "/cleaner-flow"})
    .use(
        jwt({
            name: "jwt",
            secret: config.JWT_SECRET,
        }),
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
        if (!role || role !== "cleaner") {
            set.status = 403;
            throw new Error("Forbidden: only cleaners can access cleaner flow");
        }
        const user: JwtPayload = {
            id: Number(profile.id),
            role,
            company_id: Number(profile.company_id),
        };
        return {user};
    })
    .get("/today", async ({user, query}) => {
        const window = dateWindow(query.date);
        const now = new Date();

        const taskRows = await db.select({
            task: tasks,
            room: rooms,
            object: objects,
        })
            .from(tasks)
            .innerJoin(rooms, eq(tasks.room_id, rooms.id))
            .innerJoin(objects, eq(rooms.object_id, objects.id))
            .where(and(
                eq(tasks.cleaner_id, user.id),
                eq(objects.company_id, user.company_id),
            ))
            .orderBy(asc(objects.id), asc(rooms.id), asc(tasks.id));

        const filteredTasks = taskRows.filter((row) => {
            if (row.task.status === "pending" || row.task.status === "in_progress") return true;
            const start = row.task.timestamp_start;
            const end = row.task.timestamp_end;
            return Boolean(
                (start && start >= window.start && start < window.end) ||
                (end && end >= window.start && end < window.end),
            );
        });

        const taskIds = filteredTasks.map((row) => row.task.id);
        const objectIds = Array.from(new Set(filteredTasks.map((row) => row.object.id)));

        const checklistRows = taskIds.length
            ? await db.select({
                task_id: taskChecklists.task_id,
                items: taskChecklists.items,
                completion_percent: taskChecklists.completion_percent,
            })
                .from(taskChecklists)
                .where(inArray(taskChecklists.task_id, taskIds))
            : [];
        const checklistByTask = new Map(checklistRows.map((row) => [row.task_id, row]));

        const sessionRows = objectIds.length
            ? await db.select()
                .from(objectSessions)
                .where(and(
                    eq(objectSessions.cleaner_id, user.id),
                    inArray(objectSessions.object_id, objectIds),
                    lt(objectSessions.checkin_at, window.end),
                    or(isNull(objectSessions.checkout_at), gte(objectSessions.checkout_at, window.start)),
                ))
                .orderBy(desc(objectSessions.checkin_at))
            : [];

        const sessionIds = sessionRows.map((row) => row.id);
        const segmentRows = sessionIds.length
            ? await db.select()
                .from(objectPresenceSegments)
                .where(and(
                    inArray(objectPresenceSegments.session_id, sessionIds),
                    lt(objectPresenceSegments.start_at, window.end),
                    or(isNull(objectPresenceSegments.end_at), gte(objectPresenceSegments.end_at, window.start)),
                ))
                .orderBy(asc(objectPresenceSegments.start_at))
            : [];

        const segmentsByObject = new Map<number, typeof segmentRows>();
        const segmentsBySession = new Map<number, typeof segmentRows>();
        for (const segment of segmentRows) {
            const objectList = segmentsByObject.get(segment.object_id) || [];
            objectList.push(segment);
            segmentsByObject.set(segment.object_id, objectList);

            const sessionList = segmentsBySession.get(segment.session_id) || [];
            sessionList.push(segment);
            segmentsBySession.set(segment.session_id, sessionList);
        }

        const sessionsByObject = new Map<number, typeof sessionRows>();
        for (const session of sessionRows) {
            const list = sessionsByObject.get(session.object_id) || [];
            list.push(session);
            sessionsByObject.set(session.object_id, list);
        }

        const grouped = new Map<number, {
            object: typeof filteredTasks[number]["object"];
            rooms: Map<number, {
                room: typeof filteredTasks[number]["room"];
                tasks: Array<{
                    task: typeof filteredTasks[number]["task"];
                    timing: ReturnType<typeof timingForIntervalFromSegments>;
                    instructions: string[];
                    checklist: {
                        items: ReturnType<typeof normalizeChecklistItems>;
                        completion_percent: number;
                    } | null;
                }>;
            }>;
        }>();

        for (const row of filteredTasks) {
            if (!grouped.has(row.object.id)) {
                grouped.set(row.object.id, {
                    object: row.object,
                    rooms: new Map(),
                });
            }
            const objectGroup = grouped.get(row.object.id)!;
            if (!objectGroup.rooms.has(row.room.id)) {
                objectGroup.rooms.set(row.room.id, {
                    room: row.room,
                    tasks: [],
                });
            }

            const objectSegments = segmentsByObject.get(row.object.id) || [];
            const taskStart = row.task.timestamp_start ? new Date(row.task.timestamp_start) : null;
            let taskEnd = row.task.timestamp_end ? new Date(row.task.timestamp_end) : null;
            if (row.task.status === "in_progress" && taskStart) taskEnd = now;

            const taskTiming = timingForIntervalFromSegments(objectSegments, taskStart, taskEnd, now);
            const checklist = checklistByTask.get(row.task.id);
            const normalizedItems = normalizeChecklistItems(checklist?.items);

            objectGroup.rooms.get(row.room.id)!.tasks.push({
                task: row.task,
                timing: taskTiming,
                instructions: normalizedItems.map((item) => item.title),
                checklist: checklist
                    ? {
                        items: normalizedItems,
                        completion_percent: checklist.completion_percent,
                    }
                    : null,
            });
        }

        const responseObjects = Array.from(grouped.values()).map((entry) => {
            const objectSegments = segmentsByObject.get(entry.object.id) || [];
            const activeSession = (sessionsByObject.get(entry.object.id) || [])
                .find((session) => session.status === "active") || null;

            const dayTiming = timingFromSegments(objectSegments, {
                now,
                clampStart: window.start,
                clampEnd: window.end,
            });

            const roomsResponse = Array.from(entry.rooms.values()).map((roomEntry) => {
                const roomTiming = roomEntry.tasks.reduce((acc, item) => {
                    acc.elapsed_seconds += item.timing.elapsed_seconds;
                    acc.on_site_seconds += item.timing.on_site_seconds;
                    acc.off_site_seconds += item.timing.off_site_seconds;
                    return acc;
                }, {elapsed_seconds: 0, on_site_seconds: 0, off_site_seconds: 0});

                return {
                    room: roomEntry.room,
                    timing: roomTiming,
                    tasks: roomEntry.tasks,
                };
            });

            let activeSessionResponse: null | {
                id: number;
                status: string;
                checkin_at: Date;
                checkout_at: Date | null;
                current_inside_geofence: boolean;
                last_presence_at: Date;
                last_distance_meters: string | null;
                last_latitude: string | null;
                last_longitude: string | null;
                timing: ReturnType<typeof timingFromSegments>;
            } = null;

            if (activeSession) {
                const activeTiming = timingFromSegments(segmentsBySession.get(activeSession.id) || [], {now});
                activeSessionResponse = {
                    id: activeSession.id,
                    status: activeSession.status,
                    checkin_at: activeSession.checkin_at,
                    checkout_at: activeSession.checkout_at,
                    current_inside_geofence: activeSession.current_inside_geofence,
                    last_presence_at: activeSession.last_presence_at,
                    last_distance_meters: activeSession.last_distance_meters,
                    last_latitude: activeSession.last_latitude,
                    last_longitude: activeSession.last_longitude,
                    timing: activeTiming,
                };
            }

            return {
                object: entry.object,
                timing: dayTiming,
                active_session: activeSessionResponse,
                rooms: roomsResponse,
            };
        });

        return {
            date: window.label,
            objects: responseObjects,
        };
    }, {
        query: t.Object({
            date: t.Optional(t.String()),
        }),
    })
    .post("/objects/:object_id/check-in", async ({params, body, user, set}) => {
        const objectId = Number(params.object_id);
        if (!Number.isInteger(objectId)) {
            set.status = 400;
            return {message: "Invalid object id"};
        }

        const objectRow = await objectForCleaner(objectId, user.id, user.company_id);
        if (!objectRow) {
            set.status = 404;
            return {message: "Object not found or no assigned tasks"};
        }

        const state = geofenceStateForObject(objectRow, body.latitude, body.longitude);
        if (!state.inside) {
            await logObjectGeofenceViolation({
                cleanerId: user.id,
                objectId,
                phase: "object_checkin",
                distanceMeters: state.distance_meters,
                allowedRadiusMeters: objectRow.geofence_radius_meters,
                latitude: body.latitude,
                longitude: body.longitude,
            });
            set.status = 403;
            return {
                message: `Geofence violation: you are ${Math.round(state.distance_meters)}m away (max ${objectRow.geofence_radius_meters}m)`,
            };
        }

        const activeSessions = await activeSessionsForCleaner(user.id);
        const activeSameObject = activeSessions.find((row) => row.object_id === objectId) || null;
        const activeDifferentObject = activeSessions.find((row) => row.object_id !== objectId) || null;
        if (activeDifferentObject) {
            set.status = 409;
            return {
                message: `You are already checked in at object #${activeDifferentObject.object_id}. Check out first.`,
            };
        }
        if (activeSameObject) {
            const timing = await sessionTimingSummary(activeSameObject.id);
            return {
                object_id: objectId,
                session_id: activeSameObject.id,
                status: activeSameObject.status,
                inside_geofence: activeSameObject.current_inside_geofence,
                distance_meters: Number(activeSameObject.last_distance_meters || 0),
                timing,
                checkin_at: activeSameObject.checkin_at,
                checkout_at: activeSameObject.checkout_at,
            };
        }

        const now = new Date();
        const inserted = await db.insert(objectSessions).values({
            object_id: objectId,
            cleaner_id: user.id,
            status: "active",
            checkin_at: now,
            last_presence_at: now,
            current_inside_geofence: true,
            last_distance_meters: numericString(state.distance_meters),
            last_latitude: String(body.latitude),
            last_longitude: String(body.longitude),
        }).returning();

        await db.insert(objectPresenceSegments).values({
            session_id: inserted[0].id,
            object_id: objectId,
            cleaner_id: user.id,
            is_inside: true,
            start_at: now,
            start_distance_meters: numericString(state.distance_meters),
            start_latitude: String(body.latitude),
            start_longitude: String(body.longitude),
        });

        const timing = await sessionTimingSummary(inserted[0].id, now);
        return {
            object_id: objectId,
            session_id: inserted[0].id,
            status: inserted[0].status,
            inside_geofence: true,
            distance_meters: Math.round(state.distance_meters * 100) / 100,
            timing,
            checkin_at: inserted[0].checkin_at,
            checkout_at: inserted[0].checkout_at,
        };
    }, {
        body: t.Object({
            latitude: t.Number(),
            longitude: t.Number(),
        }),
    })
    .post("/objects/:object_id/presence", async ({params, body, user, set}) => {
        const objectId = Number(params.object_id);
        if (!Number.isInteger(objectId)) {
            set.status = 400;
            return {message: "Invalid object id"};
        }

        const objectRow = await objectForCleaner(objectId, user.id, user.company_id);
        if (!objectRow) {
            set.status = 404;
            return {message: "Object not found or no assigned tasks"};
        }

        const active = await activeSessionForObject(user.id, objectId);
        if (!active) {
            set.status = 404;
            return {message: "No active object session. Check in first."};
        }

        const now = new Date();
        const state = geofenceStateForObject(objectRow, body.latitude, body.longitude);
        const openSegment = await openSegmentForSession(active.id);
        if (!openSegment) {
            await db.insert(objectPresenceSegments).values({
                session_id: active.id,
                object_id: objectId,
                cleaner_id: user.id,
                is_inside: state.inside,
                start_at: now,
                start_distance_meters: numericString(state.distance_meters),
                start_latitude: String(body.latitude),
                start_longitude: String(body.longitude),
            });
        } else if (openSegment.is_inside !== state.inside) {
            await db.update(objectPresenceSegments).set({
                end_at: now,
                end_distance_meters: numericString(state.distance_meters),
                end_latitude: String(body.latitude),
                end_longitude: String(body.longitude),
            }).where(eq(objectPresenceSegments.id, openSegment.id));

            await db.insert(objectPresenceSegments).values({
                session_id: active.id,
                object_id: objectId,
                cleaner_id: user.id,
                is_inside: state.inside,
                start_at: now,
                start_distance_meters: numericString(state.distance_meters),
                start_latitude: String(body.latitude),
                start_longitude: String(body.longitude),
            });
        }

        await db.update(objectSessions).set({
            last_presence_at: now,
            current_inside_geofence: state.inside,
            last_distance_meters: numericString(state.distance_meters),
            last_latitude: String(body.latitude),
            last_longitude: String(body.longitude),
        }).where(eq(objectSessions.id, active.id));

        if (!state.inside) {
            await logObjectGeofenceViolation({
                cleanerId: user.id,
                objectId,
                phase: "object_presence",
                distanceMeters: state.distance_meters,
                allowedRadiusMeters: objectRow.geofence_radius_meters,
                latitude: body.latitude,
                longitude: body.longitude,
            });
        }

        const timing = await sessionTimingSummary(active.id, now);
        return {
            object_id: objectId,
            session_id: active.id,
            status: active.status,
            inside_geofence: state.inside,
            distance_meters: Math.round(state.distance_meters * 100) / 100,
            timing,
            checkin_at: active.checkin_at,
            checkout_at: active.checkout_at,
        };
    }, {
        body: t.Object({
            latitude: t.Number(),
            longitude: t.Number(),
        }),
    })
    .post("/objects/:object_id/check-out", async ({params, body, user, set}) => {
        const objectId = Number(params.object_id);
        if (!Number.isInteger(objectId)) {
            set.status = 400;
            return {message: "Invalid object id"};
        }

        const active = await activeSessionForObject(user.id, objectId);
        if (!active) {
            set.status = 404;
            return {message: "No active object session"};
        }

        const now = new Date();
        let currentInside = active.current_inside_geofence;
        let distance = active.last_distance_meters ? Number(active.last_distance_meters) : 0;

        if (body.latitude !== undefined && body.longitude !== undefined) {
            const objectRow = await db.select().from(objects).where(and(
                eq(objects.id, objectId),
                eq(objects.company_id, user.company_id),
            ));
            if (objectRow.length) {
                const state = geofenceStateForObject(objectRow[0], body.latitude, body.longitude);
                currentInside = state.inside;
                distance = state.distance_meters;

                if (!state.inside) {
                    await logObjectGeofenceViolation({
                        cleanerId: user.id,
                        objectId,
                        phase: "object_checkout",
                        distanceMeters: state.distance_meters,
                        allowedRadiusMeters: objectRow[0].geofence_radius_meters,
                        latitude: body.latitude,
                        longitude: body.longitude,
                    });
                }
            }
        }

        await closeOpenSegment({
            sessionId: active.id,
            endAt: now,
            distanceMeters: distance,
            latitude: body.latitude ?? null,
            longitude: body.longitude ?? null,
        });

        await db.update(objectSessions).set({
            status: "closed",
            checkout_at: now,
            last_presence_at: now,
            current_inside_geofence: currentInside,
            last_distance_meters: numericString(distance),
            last_latitude: body.latitude !== undefined ? String(body.latitude) : active.last_latitude,
            last_longitude: body.longitude !== undefined ? String(body.longitude) : active.last_longitude,
        }).where(eq(objectSessions.id, active.id));

        const timing = await sessionTimingSummary(active.id, now);
        return {
            object_id: objectId,
            session_id: active.id,
            status: "closed",
            inside_geofence: currentInside,
            distance_meters: Math.round(distance * 100) / 100,
            timing,
            checkin_at: active.checkin_at,
            checkout_at: now,
        };
    }, {
        body: t.Object({
            latitude: t.Optional(t.Number()),
            longitude: t.Optional(t.Number()),
        }),
    });
