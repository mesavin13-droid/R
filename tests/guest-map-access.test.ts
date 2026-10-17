import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test, after } from 'node:test';

// Run the actual Express application without starting the websocket listener,
// production Vite middleware, or requiring a service-role key.
process.env.VERCEL = '1';
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.TELEGRAM_BOT_TOKEN = '';

const { default: app } = await import('../server.ts');
const httpServer = app.listen(0, '127.0.0.1');
await once(httpServer, 'listening');
const address = httpServer.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

test('guests can request live map and questions without Telegram credentials', async () => {
  const [events, questions] = await Promise.all([
    fetch(base + '/api/public/events'),
    fetch(base + '/api/public/questions'),
  ]);
  // In test there is no Supabase key. 503 is an expected storage error,
  // and demonstrates these reads are not blocked with a 401 auth challenge.
  assert.equal(events.status, 503);
  assert.equal(questions.status, 503);
  assert.match(events.headers.get('cache-control') || '', /no-store/);
  assert.match(questions.headers.get('cache-control') || '', /no-store/);
  assert.equal((await events.json()).error !== undefined, true);
});

test('unauthenticated writes and private data endpoints are forbidden', async () => {
  const requests: Array<[string, string]> = [
    ['GET', '/api/events'],
    ['GET', '/api/questions'],
    ['POST', '/api/events'],
    ['POST', '/api/questions'],
    ['POST', '/api/push/subscribe'],
    ['POST', '/api/drivers/location'],
  ];
  for (const [method, url] of requests) {
    const response = await fetch(base + url, {
      method, headers: { 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    assert.equal(response.status, 401, `${method} ${url} must require a verified Telegram session`);
  }
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    httpServer.close(err => err ? reject(err) : resolve()),
  );
});
