export interface GeofenceObject {
    latitude: string | null;
    longitude: string | null;
    geofence_radius_meters: number;
}

export interface PresenceSegmentLike {
    is_inside: boolean;
    start_at: Date;
    end_at: Date | null;
}

export interface TimingSummary {
    elapsed_seconds: number;
    on_site_seconds: number;
    off_site_seconds: number;
}

function toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

export function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const radiusMeters = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return radiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function geofenceStateForObject(
    object: GeofenceObject,
    latitude: number,
    longitude: number,
): { inside: boolean; distance_meters: number } {
    if (!object.latitude || !object.longitude) {
        return {inside: true, distance_meters: 0};
    }

    const distanceMeters = haversineDistanceMeters(
        Number(object.latitude),
        Number(object.longitude),
        latitude,
        longitude,
    );

    return {
        inside: distanceMeters <= object.geofence_radius_meters,
        distance_meters: distanceMeters,
    };
}

function intervalOverlapSeconds(
    intervalStart: Date,
    intervalEnd: Date,
    targetStart: Date,
    targetEnd: Date,
): number {
    const startMs = Math.max(intervalStart.getTime(), targetStart.getTime());
    const endMs = Math.min(intervalEnd.getTime(), targetEnd.getTime());
    if (endMs <= startMs) return 0;
    return Math.floor((endMs - startMs) / 1000);
}

export function timingFromSegments(
    segments: PresenceSegmentLike[],
    options?: {
        now?: Date;
        clampStart?: Date | null;
        clampEnd?: Date | null;
    },
): TimingSummary {
    const now = options?.now || new Date();
    const clampStart = options?.clampStart || null;
    const clampEnd = options?.clampEnd || null;

    let onSiteSeconds = 0;
    let offSiteSeconds = 0;

    for (const segment of segments) {
        const segmentStart = segment.start_at;
        const segmentEnd = segment.end_at || now;
        if (segmentEnd <= segmentStart) continue;

        const effectiveStart = clampStart && clampStart > segmentStart ? clampStart : segmentStart;
        const effectiveEnd = clampEnd && clampEnd < segmentEnd ? clampEnd : segmentEnd;
        if (effectiveEnd <= effectiveStart) continue;

        const seconds = Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / 1000);
        if (seconds <= 0) continue;

        if (segment.is_inside) onSiteSeconds += seconds;
        else offSiteSeconds += seconds;
    }

    return {
        elapsed_seconds: onSiteSeconds + offSiteSeconds,
        on_site_seconds: onSiteSeconds,
        off_site_seconds: offSiteSeconds,
    };
}

export function timingForIntervalFromSegments(
    segments: PresenceSegmentLike[],
    intervalStart: Date | null,
    intervalEnd: Date | null,
    now?: Date,
): TimingSummary {
    if (!intervalStart || !intervalEnd || intervalEnd <= intervalStart) {
        return {
            elapsed_seconds: 0,
            on_site_seconds: 0,
            off_site_seconds: 0,
        };
    }

    const current = now || new Date();
    const safeEnd = intervalEnd > current ? current : intervalEnd;
    if (safeEnd <= intervalStart) {
        return {
            elapsed_seconds: 0,
            on_site_seconds: 0,
            off_site_seconds: 0,
        };
    }

    let onSiteSeconds = 0;
    let offSiteSeconds = 0;

    for (const segment of segments) {
        const segmentStart = segment.start_at;
        const segmentEnd = segment.end_at || current;
        if (segmentEnd <= segmentStart) continue;
        const overlapSeconds = intervalOverlapSeconds(segmentStart, segmentEnd, intervalStart, safeEnd);
        if (!overlapSeconds) continue;
        if (segment.is_inside) onSiteSeconds += overlapSeconds;
        else offSiteSeconds += overlapSeconds;
    }

    return {
        elapsed_seconds: Math.floor((safeEnd.getTime() - intervalStart.getTime()) / 1000),
        on_site_seconds: onSiteSeconds,
        off_site_seconds: offSiteSeconds,
    };
}

