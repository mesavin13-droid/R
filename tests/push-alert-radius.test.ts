import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldSendWebPush } from '../src/utils/pushAlertRadius';

const now = new Date('2026-10-18T00:00:00Z').getTime();
const gpsAt = new Date(now - 30_000).toISOString();
const spot = { mode: 'live' as const, lat: 55, lng: 82.9, gpsAt };

test('push respects each subscriber radius independently', () => {
  assert.equal(shouldSendWebPush(55, 82.94, { ...spot, radiusKm: 5 }, now), true);
  assert.equal(shouldSendWebPush(55, 83.0, { ...spot, radiusKm: 5 }, now), false);
  assert.equal(shouldSendWebPush(55, 83.0, { ...spot, radiusKm: 15 }, now), true);
  assert.equal(shouldSendWebPush(55, 83.2, { ...spot, radiusKm: 15 }, now), false);
  assert.equal(shouldSendWebPush(55, 83.2, { ...spot, radiusKm: 30 }, now), true);
  assert.equal(shouldSendWebPush(55, 83.6, { ...spot, radiusKm: 50 }, now), true);
  assert.equal(shouldSendWebPush(55, 83.9, { ...spot, radiusKm: 50 }, now), false);
});

test('moving alerts require fresh GPS: no background position forgery', () => {
  assert.equal(shouldSendWebPush(55, 82.9, { ...spot, radiusKm: 5, gpsAt: new Date(now - 9 * 60_000).toISOString() }, now), false);
  assert.equal(shouldSendWebPush(55, 82.9, { ...spot, radiusKm: 5, gpsAt: new Date(now + 90_000).toISOString() }, now), false);
  assert.equal(shouldSendWebPush(55, 82.9, { ...spot, radiusKm: 5, gpsAt: undefined }, now), false);
  assert.equal(shouldSendWebPush(55, 82.9, { ...spot, radiusKm: 5, lat: undefined }, now), false);
});

test('pinned area continues receiving alerts even when the PWA is closed', () => {
  const fixed = {
    ...spot, mode: 'fixed' as const,
    radiusKm: 5 as const,
    fixedLat: 55, fixedLng: 82.9,
    gpsAt: new Date(now - 24 * 60 * 60_000).toISOString(),
  };
  assert.equal(shouldSendWebPush(55, 82.94, fixed, now), true);
  assert.equal(shouldSendWebPush(55, 83.1, fixed, now), false);
  assert.equal(shouldSendWebPush(55, 82.9, { ...fixed, fixedLat: undefined }, now), false);
});

test('invalid coordinates and radius fail closed', () => {
  assert.equal(shouldSendWebPush(NaN, 82.9, { ...spot, radiusKm: 5 }, now), false);
  assert.equal(shouldSendWebPush(55, 181, { ...spot, radiusKm: 5 }, now), false);
  assert.equal(shouldSendWebPush(55, 82.9, { ...spot, radiusKm: 100 as 5 }, now), false);
  assert.equal(shouldSendWebPush(55, 82.9, { ...spot, radiusKm: 5, lng: null as unknown as number }, now), false);
});
