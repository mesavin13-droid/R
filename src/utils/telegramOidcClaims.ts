/**
 * Telegram's OIDC `sub` is an opaque subject identifier, not necessarily
 * the numeric Telegram account ID. The signed `id` claim from the requested
 * `profile` scope is the ID shared with Mini App initData and Bot API.
 */
export function extractTelegramAccountId(claims: Record<string, unknown>): number {
  if (typeof claims.sub !== 'string' || claims.sub.length === 0 || claims.sub.length > 128) {
    throw new Error('Telegram subject is missing');
  }
  if (typeof claims.id !== 'number' ||
      !Number.isSafeInteger(claims.id) || claims.id <= 0) {
    throw new Error('Invalid signed Telegram profile ID');
  }
  return claims.id;
}
