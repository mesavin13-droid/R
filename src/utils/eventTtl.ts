/**
 * Shared event lifetime policy for the browser and server.
 * New reports get a short verification window; a confirmation by another
 * driver then extends the event to its category-specific lifetime.
 */
export function getEventTtlMinutes(type: string, subType?: string | null): number {
  switch (type) {
    case 'crossing': return 20;
    case 'accident': return subType === 'road_blocked' ? 60 : 45;
    case 'patrol': return 25;
    case 'fuel': return 25;
    case 'traffic_light': return 90;
    case 'road': return subType === 'repair' || subType === 'pothole' ? 2880 : 360;
    case 'hazard': return 40;
    case 'assistance': return 60;
    default: return 30;
  }
}

export function getUnconfirmedEventTtlMinutes(type: string, subType?: string | null): number {
  switch (type) {
    case 'crossing': return 8;
    case 'accident': return subType === 'road_blocked' ? 20 : 15;
    case 'patrol': return 8;
    case 'fuel': return 10;
    case 'traffic_light': return 30;
    case 'road': return subType === 'repair' || subType === 'pothole' ? 120 : 30;
    case 'hazard': return 10;
    case 'assistance': return 20;
    default: return 10;
  }
}

/** Questions are transient map markers: unanswered ones live for an hour. */
export const UNANSWERED_QUESTION_TTL_MINUTES = 60;
/** Once answered, a question can remain on the map for up to six hours. */
export const ANSWERED_QUESTION_MAP_TTL_MINUTES = 360;
/** Reported fuel-queue information is considered fresh for 30 minutes. */
export const FUEL_QUEUE_TTL_MINUTES = 30;
