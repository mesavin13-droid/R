import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractTelegramAccountId } from '../src/utils/telegramOidcClaims';

test('Telegram OIDC ID comes from signed profile id, not opaque sub', () => {
  const id = extractTelegramAccountId({
    sub: '1234123412341234123', // official OIDC docs example: > JS safe integer
    id: 987654321,
  });
  assert.equal(id, 987654321);
});

test('reject missing or forged-looking profile claim instead of using sub as a fallback', () => {
  assert.throws(() => extractTelegramAccountId({ sub: '987654321' }));
  assert.throws(() => extractTelegramAccountId({ sub: '987654321', id: '987654321' }));
  assert.throws(() => extractTelegramAccountId({ sub: '987654321', id: 0 }));
  assert.throws(() => extractTelegramAccountId({ sub: '987654321', id: Number.MAX_SAFE_INTEGER + 1 }));
  assert.throws(() => extractTelegramAccountId({ sub: '', id: 99 }));
});
