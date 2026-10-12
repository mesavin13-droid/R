/**
 * Shared radius policy for nearby driver alerts.
 * Normal road events/questions: 2 km. SOS/help: 5 km.
 */
export const NOTIFY_RADIUS_M = {
  standard: 2_000,
  sos: 5_000,
} as const;

export function notifyRadiusFor(type: string): number {
  return type === 'assistance' ? NOTIFY_RADIUS_M.sos : NOTIFY_RADIUS_M.standard;
}
