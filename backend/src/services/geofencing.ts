export interface GeofenceCheckInput {
  objectLatitude: number | string | null | undefined;
  objectLongitude: number | string | null | undefined;
  allowedRadiusMeters: number | null | undefined;
  latitude: number | string | null | undefined;
  longitude: number | string | null | undefined;
}

export interface GeofenceCheckResult {
  enforced: boolean;
  allowed: boolean;
  distanceMeters: number | null;
  allowedRadiusMeters: number;
  reason?: "missing_coordinates" | "outside_geofence";
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// calculate distance in meters between two coordinates.
export function haversineMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const earthRadius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(latitudeB - latitudeA);
  const dLon = toRad(longitudeB - longitudeA);
  const lat1 = toRad(latitudeA);
  const lat2 = toRad(latitudeB);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

export function evaluateGeofence(input: GeofenceCheckInput): GeofenceCheckResult {
  const objectLatitude = toNumber(input.objectLatitude);
  const objectLongitude = toNumber(input.objectLongitude);
  const cleanerLatitude = toNumber(input.latitude);
  const cleanerLongitude = toNumber(input.longitude);
  const allowedRadiusMeters = input.allowedRadiusMeters ?? 100;

  // if object has no coordinates configured yet, geofence is not enforced.
  if (objectLatitude === null || objectLongitude === null) {
    return {
      enforced: false,
      allowed: true,
      distanceMeters: null,
      allowedRadiusMeters,
    };
  }

  if (cleanerLatitude === null || cleanerLongitude === null) {
    return {
      enforced: true,
      allowed: false,
      distanceMeters: null,
      allowedRadiusMeters,
      reason: "missing_coordinates",
    };
  }

  const distanceMeters = haversineMeters(
    cleanerLatitude,
    cleanerLongitude,
    objectLatitude,
    objectLongitude,
  );

  if (distanceMeters > allowedRadiusMeters) {
    return {
      enforced: true,
      allowed: false,
      distanceMeters,
      allowedRadiusMeters,
      reason: "outside_geofence",
    };
  }

  return {
    enforced: true,
    allowed: true,
    distanceMeters,
    allowedRadiusMeters,
  };
}

export function parseCoordinate(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
