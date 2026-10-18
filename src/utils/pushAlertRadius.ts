/**
 * Server-side spatial Web Push policy. The recipient controls the radius;
 * event authors cannot widen it by changing an incoming request.
 */
export type PushAlertRadiusKm = 5 | 15 | 30 | 50;
export type PushAlertMode = 'live' | 'fixed';

export interface PushAlertTarget {
  mode: PushAlertMode;
  radiusKm: PushAlertRadiusKm;
  lat?: number;
  lng?: number;
  gpsAt?: string;
  fixedLat?: number;
  fixedLng?: number;
}

export const PUSH_GPS_FRESH_MS = 8 * 60_000;

export function haversineMeters(latA: number, lngA: number, latB: number, lngB: number): number {
  const rad = Math.PI / 180;
  const dLat = (latB - latA) * rad;
  const dLng = (lngB - lngA) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
}

export function shouldSendWebPush(
  eventLat: number,
  eventLng: number,
  recipient: PushAlertTarget,
  now = Date.now(),
): boolean {
  if (!Number.isFinite(eventLat) || !Number.isFinite(eventLng) ||
      Math.abs(eventLat) > 85 || Math.abs(eventLng) > 180 ||
      !([5, 15, 30, 50] as number[]).includes(recipient.radiusKm)) return false;

  let lat: number | undefined;
  let lng: number | undefined;

  if (recipient.mode === 'fixed') {
    lat = recipient.fixedLat;
    lng = recipient.fixedLng;
  } else if (recipient.mode === 'live') {
    const gpsAt = recipient.gpsAt ? Date.parse(recipient.gpsAt) : NaN;
    if (!Number.isFinite(gpsAt) || gpsAt > now + 60_000 ||
        now - gpsAt > PUSH_GPS_FRESH_MS) return false;
    lat = recipient.lat;
    lng = recipient.lng;
  } else {
    return false;
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
      Math.abs(lat!) > 85 || Math.abs(lng!) > 180) return false;

  return haversineMeters(eventLat, eventLng, lat!, lng!) <= recipient.radiusKm * 1000;
}
