import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket as WsClient } from 'ws';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import webpush from 'web-push';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const serverSupabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

if (isProd && !serverSupabase) {
  console.warn('⚠️ Server-side Supabase persistence is not configured; chat will use temporary memory only.');
}

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
// Basic production hardening
app.disable('x-powered-by');
app.use((_req: Request, res: Response, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(), camera=(self)');
  next();
});

// Keep request bodies bounded to reduce accidental/abusive memory usage.
app.use(express.json({ limit: '64kb' }));

// Lightweight per-IP rate limiter for write endpoints. For multi-instance production,
// move this to a shared store (e.g. Redis/Supabase) rather than process memory.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: Function) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const current = rateBuckets.get(key);
    if (!current || current.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    current.count += 1;
    if (current.count > max) return res.status(429).json({ error: 'Слишком много запросов. Попробуйте позже.' });
    next();
  };
}


const userRateBuckets = new Map<string, { count: number; resetAt: number }>();
function userRateLimit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: Function) => {
    const userId = (req as any).telegramSession?.userId;
    if (!userId) return res.status(401).json({ error: 'Требуется авторизация Telegram' });
    const now = Date.now();
    const key = userId;
    const current = userRateBuckets.get(key);
    if (!current || current.resetAt <= now) {
      userRateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    current.count += 1;
    if (current.count > max) return res.status(429).json({ error: 'Слишком много действий. Попробуйте позже.' });
    next();
  };
}

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, service: 'roadlive', timestamp: new Date().toISOString() });
});

// VAPID Configuration
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@roadlive.app';

if (isProd && (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY)) {
  console.warn('⚠️ Web Push is disabled: VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are not configured.');
}

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log('✅ WebPush configured with VAPID details.');
} catch (err) {
  console.error('❌ Failed to configure WebPush VAPID details:', err);
}

// In-Memory & File-backed Push Subscriptions
interface StoredSubscription {
  subscription: webpush.PushSubscription;
  userId?: string;
  districtId?: string;
  createdAt: string;
}

const SUBS_FILE = path.resolve(process.cwd(), 'dev-dist/push_subscriptions.json');
let subscriptions = new Map<string, StoredSubscription>();

async function loadSubscriptions() {
  if (serverSupabase) {
    const { data, error } = await serverSupabase
      .from('push_subscriptions')
      .select('endpoint,user_id,subscription,district_id,created_at');
    if (!error && data) {
      subscriptions = new Map(
        data.map((row) => [
          row.endpoint,
          {
            subscription: row.subscription as webpush.PushSubscription,
            userId: row.user_id,
            districtId: row.district_id || undefined,
            createdAt: row.created_at,
          },
        ]),
      );
      console.log(`Loaded ${subscriptions.size} push subscriptions from Supabase.`);
      return;
    }
    if (error) console.warn('[Push] Supabase subscription load failed:', error.message);
  }

  try {
    if (fs.existsSync(SUBS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf-8'));
      subscriptions = new Map(Object.entries(data));
      console.log(`Loaded ${subscriptions.size} push subscriptions from disk fallback.`);
    }
  } catch (err) {
    console.warn('Could not read subscriptions file, starting empty.', err);
  }
}

function saveSubscriptions() {
  if (serverSupabase) return;
  try {
    const dir = path.dirname(SUBS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const obj = Object.fromEntries(subscriptions.entries());
    fs.writeFileSync(SUBS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not save subscriptions file.', err);
  }
}

async function persistPushSubscription(endpoint: string, item: StoredSubscription): Promise<boolean> {
  if (!serverSupabase) return false;
  const { error } = await serverSupabase.from('push_subscriptions').upsert({
    endpoint,
    user_id: item.userId,
    subscription: item.subscription,
    district_id: item.districtId || null,
    created_at: item.createdAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  if (error) {
    console.warn('[Push] Supabase subscription write failed:', error.message);
    return false;
  }
  return true;
}

async function deletePushSubscription(endpoint: string): Promise<boolean> {
  if (!serverSupabase) return false;
  const { error } = await serverSupabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) {
    console.warn('[Push] Supabase subscription delete failed:', error.message);
    return false;
  }
  return true;
}



// --- TELEGRAM SERVER AUTHENTICATION ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
if (isProd && !TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN must be configured in production');
}
const ROADLIVE_ADMIN_TELEGRAM_IDS = new Set(
  (process.env.ROADLIVE_ADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const TELEGRAM_SESSION_TTL_SECONDS = Math.max(
  300,
  parseInt(process.env.TELEGRAM_SESSION_TTL_SECONDS || '86400', 10),
);

type TelegramAuthUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

type TelegramSession = {
  tgId: number;
  userId: string;
  user: TelegramAuthUser;
  role: 'driver' | 'admin';
  iat: number;
  exp: number;
};

function safeEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

function validateTelegramInitData(initData: string): TelegramAuthUser {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('Telegram bot token is not configured on the server');
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const authDate = Number(params.get('auth_date') || '0');
  const userRaw = params.get('user');

  if (!receivedHash || !authDate || !userRaw) {
    throw new Error('Invalid Telegram initData payload');
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - authDate) > 86400) {
    throw new Error('Telegram initData has expired');
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(TELEGRAM_BOT_TOKEN)
    .digest();
  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (!safeEqualHex(calculatedHash, receivedHash)) {
    throw new Error('Telegram initData signature mismatch');
  }

  let user: TelegramAuthUser;
  try {
    user = JSON.parse(userRaw);
  } catch {
    throw new Error('Invalid Telegram user payload');
  }

  if (!user?.id || !user.first_name) {
    throw new Error('Telegram user data is incomplete');
  }

  return user;
}

function sessionSecret(): Buffer {
  return crypto
    .createHmac('sha256', TELEGRAM_BOT_TOKEN)
    .update('ROADLIVE_SESSION_SECRET')
    .digest();
}

function encodeSession(session: TelegramSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySessionToken(token: string): TelegramSession | null {
  if (!TELEGRAM_BOT_TOKEN) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  if (expected.length !== signature.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TelegramSession;
    if (!session?.tgId || !session?.userId || !session.exp || session.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function getBearerToken(req: Request): string | null {
  const value = req.header('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : null;
}

function requireTelegramAuth(req: Request, res: Response, next: Function) {
  const token = getBearerToken(req);
  const session = token ? verifySessionToken(token) : null;
  if (!session) {
    return res.status(401).json({ error: 'Требуется авторизация Telegram' });
  }
  (req as any).telegramSession = session;
  next();
}

app.post('/api/telegram/auth', rateLimit(20, 60_000), (req: Request, res: Response) => {
  try {
    if (!req.body?.initData || typeof req.body.initData !== 'string') {
      return res.status(400).json({ error: 'Telegram initData обязателен' });
    }

    const user = validateTelegramInitData(req.body.initData);
    const now = Math.floor(Date.now() / 1000);
    const isAdmin = ROADLIVE_ADMIN_TELEGRAM_IDS.has(String(user.id));
    const session: TelegramSession = {
      tgId: user.id,
      userId: `tg-${user.id}`,
      user,
      role: isAdmin ? 'admin' : 'driver',
      iat: now,
      exp: now + TELEGRAM_SESSION_TTL_SECONDS,
    };

    return res.json({
      authenticated: true,
      sessionToken: encodeSession(session),
      expiresAt: session.exp,
      user,
      role: session.role,
      isAdmin,
    });
  } catch (error: any) {
    return res.status(401).json({ error: error?.message || 'Telegram authentication failed' });
  }
});

// --- API ROUTES ---

// 1. Current authenticated user / server-authoritative role
app.get('/api/auth/me', requireTelegramAuth, (req: Request, res: Response) => {
  const session = (req as any).telegramSession as TelegramSession;
  const isAdmin = ROADLIVE_ADMIN_TELEGRAM_IDS.has(String(session.tgId));
  res.json({
    authenticated: true,
    userId: session.userId,
    telegramId: session.tgId,
    expiresAt: session.exp,
    role: isAdmin ? 'admin' : 'driver',
    isAdmin,
  });
});

// Server-authoritative admin API guard. UI visibility is not a security boundary.
function requireAdmin(req: Request, res: Response, next: Function) {
  const session = (req as any).telegramSession as TelegramSession | undefined;
  if (!session || !ROADLIVE_ADMIN_TELEGRAM_IDS.has(String(session.tgId))) {
    return res.status(403).json({ error: 'Требуются права администратора' });
  }
  next();
}

function requireSameOrigin(req: Request, res: Response, next: Function) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.header('origin');
  const host = req.header('host');
  if (!origin || !host) return next();
  try {
    if (new URL(origin).host !== host) {
      return res.status(403).json({ error: 'Недопустимый origin' });
    }
  } catch {
    return res.status(403).json({ error: 'Недопустимый origin' });
  }
  next();
}

app.use(requireSameOrigin);

// 2. Get VAPID Public Key
app.get('/api/push/public-key', (_req: Request, res: Response) => {
  res.json({
    publicKey: VAPID_PUBLIC_KEY,
    configured: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
  });
});

// 3. Get Push Status & Subscribers Count
app.get('/api/push/status', rateLimit(60, 60_000), requireTelegramAuth, (req: Request, res: Response) => {
  const userId = (req as any).telegramSession.userId;
  const ownSubscriptions = Array.from(subscriptions.values()).filter((item) => item.userId === userId).length;
  res.json({
    configured: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
    subscribersCount: ownSubscriptions,
  });
});

function isValidPushSubscription(subscription: any): boolean {
  if (!subscription || typeof subscription !== 'object') return false;
  if (typeof subscription.endpoint !== 'string' || subscription.endpoint.length < 20 || subscription.endpoint.length > 2048) return false;
  if (!subscription.keys || typeof subscription.keys !== 'object') return false;
  if (typeof subscription.keys.p256dh !== 'string' || subscription.keys.p256dh.length > 512) return false;
  if (typeof subscription.keys.auth !== 'string' || subscription.keys.auth.length > 512) return false;
  return true;
}

function sanitizePushEvent(event: any, userId: string) {
  if (!event || typeof event !== 'object' || event.userId !== userId) return null;
  const title = typeof event.title === 'string' ? event.title.trim().slice(0, 200) : '';
  const address = typeof event.address === 'string' ? event.address.trim().slice(0, 255) : '';
  const description = typeof event.description === 'string' ? event.description.trim().slice(0, 1000) : '';
  const type = typeof event.type === 'string' ? event.type.slice(0, 50) : '';
  const subType = typeof event.subType === 'string' ? event.subType.slice(0, 100) : undefined;
  const id = typeof event.id === 'string' ? event.id.slice(0, 100) : '';
  if (!title || !id || !address) return null;
  return { id, userId, title, address, description, type, subType };
}

// 3. Register or Update Push Subscription
app.post('/api/push/subscribe', rateLimit(30, 60_000), requireTelegramAuth, async (req: Request, res: Response) => {
  const { subscription, districtId } = req.body;
  const userId = (req as any).telegramSession.userId;

  if (!isValidPushSubscription(subscription)) {
    return res.status(400).json({ error: 'Неверный формат подписки Web Push' });
  }

  const endpoint = subscription.endpoint;
  const existing = subscriptions.get(endpoint);
  if (existing?.userId && existing.userId !== userId) {
    return res.status(403).json({ error: 'Эта push-подписка принадлежит другому пользователю' });
  }
  const item: StoredSubscription = {
    subscription,
    userId,
    districtId,
    createdAt: new Date().toISOString(),
  };
  const persisted = await persistPushSubscription(endpoint, item);
  subscriptions.set(endpoint, item);

  saveSubscriptions();
  console.log(`[Push] Registered subscriber (total: ${subscriptions.size})`);

  res.json({
    success: true,
    persistent: persisted || !serverSupabase,
    message: 'Успешно подписан на критические уведомления ROADLIVE',
    subscribersCount: subscriptions.size,
  });
});

// 4. Unsubscribe
app.post('/api/push/unsubscribe', rateLimit(30, 60_000), requireTelegramAuth, async (req: Request, res: Response) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint обязателен' });
  }

  const current = subscriptions.get(endpoint);
  if (current && current.userId && current.userId !== (req as any).telegramSession.userId) {
    return res.status(403).json({ error: 'Эта push-подписка принадлежит другому пользователю' });
  }

  const deleted = subscriptions.delete(endpoint);
  const persisted = await deletePushSubscription(endpoint);
  if (deleted) {
    saveSubscriptions();
    console.log(`[Push] Unsubscribed (remaining: ${subscriptions.size})`);
  }

  res.json({ success: true, deleted, persistent: persisted || !serverSupabase, subscribersCount: subscriptions.size });
});

// 5. Broadcast Critical Road Event
app.post('/api/push/broadcast-critical', rateLimit(10, 60_000), requireTelegramAuth, userRateLimit(3, 60 * 60_000), async (req: Request, res: Response) => {
  const userId = (req as any).telegramSession.userId;
  const event = sanitizePushEvent(req.body?.event, userId);
  if (!event) {
    return res.status(400).json({ error: 'Недопустимые данные события' });
  }

  // Criticality is derived on the server. Client input cannot force a mass alert.
  const isCritical =
    (event.type === 'accident' && (event.subType === 'road_blocked' || event.subType === 'major')) ||
    (event.type === 'crossing' && event.subType === 'closed') ||
    (event.type === 'road' && (event.subType === 'closure' || event.subType === 'ice')) ||
    event.type === 'hazard';

  // Construct Notification Payload
  const emoji =
    event.type === 'accident'
      ? '🚗'
      : event.type === 'crossing'
      ? '🚧'
      : event.type === 'road'
      ? '🛣️'
      : '⚠️';

  const payload = JSON.stringify({
    title: `🚨 ROADLIVE: ${event.title}`,
    body: `${emoji} ${event.address}${event.description ? `. ${event.description}` : ''}`,
    icon: '/pwa-192x192.png',
    badge: '/icon.svg',
    tag: `road-critical-${event.id}`,
    data: {
      url: `/?event=${event.id}`,
      eventId: event.id,
      type: event.type,
      isCritical,
      timestamp: Date.now(),
    },
  });

  const endpoints = Array.from(subscriptions.keys());
  if (endpoints.length === 0) {
    return res.json({
      success: true,
      sentCount: 0,
      failureCount: 0,
      totalSubscribers: 0,
      isCritical,
      message: 'Нет активных подписчиков Web Push',
    });
  }

  let sentCount = 0;
  let failureCount = 0;
  const expiredEndpoints: string[] = [];

  const promises = endpoints.map(async (ep) => {
    const item = subscriptions.get(ep);
    if (!item) return;

    // Skip sending push notification to the creator of this event!
    if (item.userId && event.userId && item.userId === event.userId) {
      return;
    }

    try {
      await webpush.sendNotification(item.subscription, payload);
      sentCount++;
    } catch (err: any) {
      failureCount++;
      // If subscription expired or revoked (404 / 410)
      if (err.statusCode === 404 || err.statusCode === 410) {
        expiredEndpoints.push(ep);
      }
    }
  });

  await Promise.all(promises);

  // Prune expired endpoints
  if (expiredEndpoints.length > 0) {
    expiredEndpoints.forEach((ep) => subscriptions.delete(ep));
    saveSubscriptions();
  }

  res.json({
    success: true,
    sentCount,
    failureCount,
    totalSubscribers: subscriptions.size,
    isCritical,
  });
});

// 6. Test Push Endpoint
app.post('/api/push/test', rateLimit(5, 60_000), requireTelegramAuth, userRateLimit(10, 60 * 60_000), async (req: Request, res: Response) => {
  const { targetEndpoint } = req.body;

  const testPayload = JSON.stringify({
    title: '🚨 ROADLIVE: Тестовое критическое оповещение',
    body: '🚧 ул. Большевистская, 101. Проверка доставки пуш-уведомлений о перекрытиях и ДТП.',
    icon: '/pwa-192x192.png',
    badge: '/icon.svg',
    tag: 'test-push-notification',
    data: {
      url: '/',
      isTest: true,
      timestamp: Date.now(),
    },
  });

  if (targetEndpoint && subscriptions.has(targetEndpoint)) {
    const item = subscriptions.get(targetEndpoint)!;
    if (item.userId && item.userId !== (req as any).telegramSession.userId) {
      return res.status(403).json({ error: 'Эта push-подписка принадлежит другому пользователю' });
    }
    try {
      await webpush.sendNotification(item.subscription, testPayload);
      return res.json({ success: true, message: 'Тестовый пуш отправлен на ваше устройство' });
    } catch (err: any) {
      return res.status(500).json({ error: `Ошибка отправки: ${err.message}` });
    }
  }

  // Send to all subscribers if no specific endpoint given
  const userId = (req as any).telegramSession.userId;
  const endpoints = Array.from(subscriptions.entries())
    .filter(([, item]) => item.userId === userId)
    .map(([ep]) => ep);
  if (endpoints.length === 0) {
    return res.json({
      success: true,
      sentCount: 0,
      message: 'Нет активных подписчиков. Разрешите уведомления в профиле!',
    });
  }

  let sent = 0;
  for (const ep of endpoints) {
    const item = subscriptions.get(ep);
    if (!item) continue;
    try {
      await webpush.sendNotification(item.subscription, testPayload);
      sent++;
    } catch {
      // ignore
    }
  }

  res.json({
    success: true,
    message: `Тестовый пуш отправлен на ${sent} активных устройств`,
    sentCount: sent,
  });
});

// --- AUTHORITATIVE ROAD EVENT API ---
const EVENT_TYPES = new Set(['crossing','accident','patrol','fuel','road','traffic_light','hazard','other']);

async function getOrCreateTelegramProfile(session: TelegramSession): Promise<string | null> {
  if (!serverSupabase) return null;
  const existing = await serverSupabase
    .from('telegram_accounts')
    .select('user_id')
    .eq('telegram_id', session.tgId)
    .maybeSingle();
  if (existing.data?.user_id) return existing.data.user_id;

  const user = session.user;
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim().slice(0, 100) || 'Водитель';
  const created = await serverSupabase
    .from('profiles')
    .insert({
      full_name: fullName,
      role: session.role,
    })
    .select('id')
    .single();
  if (created.error || !created.data) {
    console.warn('[Events] profile creation failed:', created.error?.message);
    return null;
  }

  const linked = await serverSupabase.from('telegram_accounts').insert({
    user_id: created.data.id,
    telegram_id: session.tgId,
    username: user.username || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
  });
  if (linked.error) {
    console.warn('[Events] Telegram account link failed:', linked.error.message);
    return null;
  }
  return created.data.id;
}

function sanitizeEventInput(input: any) {
  if (!input || typeof input !== 'object') return null;
  const type = typeof input.type === 'string' ? input.type.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 200) : '';
  const description = typeof input.description === 'string' ? input.description.trim().slice(0, 2000) : '';
  const address = typeof input.address === 'string' ? input.address.trim().slice(0, 255) : '';
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (!EVENT_TYPES.has(type) || !title || !address) return null;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return {
    type,
    sub_type: typeof input.subType === 'string' ? input.subType.trim().slice(0, 100) || null : null,
    title,
    description: description || null,
    latitude,
    longitude,
    address,
    direction: typeof input.direction === 'string' ? input.direction.trim().slice(0, 100) || null : null,
    city_id: typeof input.cityId === 'string' && input.cityId.trim() ? input.cityId.trim().slice(0, 100) : 'nsk-city-01',
    district_id: typeof input.districtId === 'string' && input.districtId.trim() ? input.districtId.trim().slice(0, 100) : null,
    image_url: typeof input.imageUrl === 'string' ? input.imageUrl.trim().slice(0, 2048) || null : null,
  };
}

app.post('/api/events', rateLimit(30, 60_000), userRateLimit(20, 60_000), requireTelegramAuth, async (req: Request, res: Response) => {
  const session = (req as any).telegramSession as TelegramSession;
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище событий не настроено' });

  const input = sanitizeEventInput(req.body);
  if (!input) return res.status(400).json({ error: 'Некорректные данные события' });

  const profileId = await getOrCreateTelegramProfile(session);
  if (!profileId) return res.status(503).json({ error: 'Не удалось определить профиль водителя' });

  const ttlMinutes =
    input.type === 'crossing' ? 20 :
    input.type === 'accident' ? (input.sub_type === 'road_blocked' ? 60 : 45) :
    input.type === 'patrol' || input.type === 'fuel' || input.type === 'hazard' ? 25 :
    input.type === 'traffic_light' ? 90 :
    input.type === 'road' ? ((input.sub_type === 'repair' || input.sub_type === 'pothole') ? 2880 : 360) : 30;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString();

  const { data, error } = await serverSupabase
    .from('events')
    .insert({
      user_id: profileId,
      ...input,
      expires_at: expiresAt,
      status: 'active',
      confirmation_count: 1,
      confidence_score: 1.00,
      last_confirmed_at: now.toISOString(),
    })
    .select('*')
    .single();

  if (error || !data) {
    console.warn('[Events] Supabase insert failed:', error?.message);
    return res.status(500).json({ error: 'Не удалось сохранить событие' });
  }

  res.status(201).json({ event: data });
});

app.get('/api/events', requireTelegramAuth, async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище событий не настроено' });
  const cityId = typeof req.query.cityId === 'string' ? req.query.cityId.slice(0, 100) : 'nsk-city-01';
  const { data, error } = await serverSupabase
    .from('events')
    .select('*')
    .eq('city_id', cityId)
    .neq('status', 'hidden')
    .neq('status', 'expired')
    .neq('status', 'resolved')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ error: 'Не удалось загрузить события' });
  res.json({ events: data || [] });
});

function eventIdIsValid(id: unknown): id is string {
  return typeof id === 'string' && id.length <= 100 && /^[A-Za-z0-9_-]+$/.test(id);
}

async function resolveEventProfile(session: TelegramSession) {
  const profileId = await getOrCreateTelegramProfile(session);
  if (!profileId) throw new Error('Профиль водителя не найден');
  return profileId;
}

app.post('/api/events/:eventId/confirmation', userRateLimit(30, 60_000), requireTelegramAuth, async (req: Request, res: Response) => {
  const session = (req as any).telegramSession as TelegramSession;
  const eventId = req.params.eventId;
  if (!eventIdIsValid(eventId)) return res.status(400).json({ error: 'Некорректный ID события' });
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище не настроено' });

  const action = req.body?.action;
  if (action !== 'confirm' && action !== 'dispute') return res.status(400).json({ error: 'Некорректное действие' });

  const profileId = await resolveEventProfile(session);
  const { data: event, error: eventError } = await serverSupabase.from('events').select('*').eq('id', eventId).maybeSingle();
  if (eventError || !event) return res.status(404).json({ error: 'Событие не найдено' });
  if (event.status === 'hidden' || event.status === 'expired' || event.status === 'resolved') {
    return res.status(409).json({ error: 'Событие больше не актуально' });
  }

  const { data: existing } = await serverSupabase
    .from('event_confirmations')
    .select('id, action')
    .eq('event_id', eventId)
    .eq('user_id', profileId)
    .maybeSingle();

  if (existing?.action === action) return res.json({ event });

  if (existing) {
    await serverSupabase.from('event_confirmations').update({ action }).eq('id', existing.id);
  } else {
    const inserted = await serverSupabase.from('event_confirmations').insert({
      event_id: eventId,
      user_id: profileId,
      action,
      is_nearby: Boolean(req.body?.isNearby),
      distance_meters: Number.isFinite(Number(req.body?.distanceMeters)) ? Math.max(0, Math.min(100000, Number(req.body.distanceMeters))) : null,
    });
    if (inserted.error) return res.status(409).json({ error: 'Не удалось записать подтверждение' });
  }

  const { count: confirms } = await serverSupabase.from('event_confirmations').select('*', { count: 'exact', head: true }).eq('event_id', eventId).eq('action', 'confirm');
  const { count: disputes } = await serverSupabase.from('event_confirmations').select('*', { count: 'exact', head: true }).eq('event_id', eventId).eq('action', 'dispute');
  const confirmationCount = Math.max(1, confirms || 0);
  const disputeCount = Math.max(0, disputes || 0);
  const confidence = Math.min(1, Math.round((confirmationCount / (confirmationCount + disputeCount)) * 100) / 100);
  const ttlMinutes =
    event.type === 'crossing' ? 20 :
    event.type === 'accident' ? (event.sub_type === 'road_blocked' ? 60 : 45) :
    event.type === 'patrol' || event.type === 'fuel' || event.type === 'hazard' ? 25 :
    event.type === 'traffic_light' ? 90 :
    event.type === 'road' ? ((event.sub_type === 'repair' || event.sub_type === 'pothole') ? 2880 : 360) : 30;
  const now = new Date();
  const updates: any = {
    confirmation_count: confirmationCount,
    dispute_count: disputeCount,
    confidence_score: confidence,
    updated_at: now.toISOString(),
  };
  if (action === 'confirm') {
    updates.last_confirmed_at = now.toISOString();
    updates.expires_at = new Date(now.getTime() + ttlMinutes * 60_000).toISOString();
    updates.status = 'active';
  }
  const updated = await serverSupabase.from('events').update(updates).eq('id', eventId).select('*').single();
  if (updated.error || !updated.data) return res.status(500).json({ error: 'Не удалось обновить событие' });
  res.json({ event: updated.data });
});

app.post('/api/events/:eventId/comments', userRateLimit(30, 60_000), requireTelegramAuth, async (req: Request, res: Response) => {
  const session = (req as any).telegramSession as TelegramSession;
  const eventId = req.params.eventId;
  const content = typeof req.body?.content === 'string' ? req.body.content.trim().slice(0, 1000) : '';
  if (!eventIdIsValid(eventId) || !content) return res.status(400).json({ error: 'Некорректный комментарий' });
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище не настроено' });
  const profileId = await resolveEventProfile(session);
  const result = await serverSupabase.from('event_comments').insert({
    event_id: eventId,
    user_id: profileId,
    author_name: [session.user.first_name, session.user.last_name].filter(Boolean).join(' ').slice(0, 100) || 'Водитель',
    content,
  }).select('*').single();
  if (result.error || !result.data) return res.status(500).json({ error: 'Не удалось сохранить комментарий' });
  res.status(201).json({ comment: result.data });
});

app.get('/api/events/:eventId/comments', requireTelegramAuth, async (req: Request, res: Response) => {
  const eventId = req.params.eventId;
  if (!eventIdIsValid(eventId) || !serverSupabase) return res.status(400).json({ error: 'Некорректный запрос' });
  const result = await serverSupabase.from('event_comments').select('*').eq('event_id', eventId).order('created_at', { ascending: true }).limit(200);
  if (result.error) return res.status(500).json({ error: 'Не удалось загрузить комментарии' });
  res.json({ comments: result.data || [] });
});

// --- DRIVER RADIO / CHAT API & REAL-TIME WEBSOCKET ---
let chatMessages: any[] = [];

function normalizeChatMessage(row: any) {
  return {
    id: row.external_id,
    channelId: row.channel_id,
    userId: row.user_id || `tg-${row.telegram_user_id}`,
    authorName: row.author_name || 'Водитель',
    content: row.content,
    createdAt: row.created_at,
  };
}

async function loadChatMessages(channelId?: string): Promise<any[]> {
  if (serverSupabase) {
    let query = serverSupabase
      .from('chat_messages')
      .select('external_id,channel_id,user_id,telegram_user_id,author_name,content,created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    if (channelId) query = query.eq('channel_id', channelId);
    const { data, error } = await query;
    if (!error && data) return data.reverse().map(normalizeChatMessage);
    if (error) console.warn('[Chat] Supabase read failed:', error.message);
  }

  const result = channelId ? chatMessages.filter((m) => m.channelId === channelId) : chatMessages;
  return result.slice(-500);
}

async function persistChatMessage(message: any, session: TelegramSession): Promise<boolean> {
  if (!serverSupabase) return false;
  const { error } = await serverSupabase.from('chat_messages').upsert(
    {
      external_id: message.id,
      channel_id: message.channelId,
      telegram_user_id: session.tgId,
      author_name: typeof message.authorName === 'string' ? message.authorName.slice(0, 100) : null,
      content: message.content.trim(),
      created_at: typeof message.createdAt === 'string' ? message.createdAt : new Date().toISOString(),
    },
    { onConflict: 'external_id', ignoreDuplicates: true },
  );
  if (error) {
    console.warn('[Chat] Supabase write failed:', error.message);
    return false;
  }
  return true;
}

async function persistChatReaction(messageId: string, emoji: string, telegramUserId: number): Promise<boolean> {
  if (!serverSupabase) return false;
  const { data: message, error: messageError } = await serverSupabase
    .from('chat_messages')
    .select('id')
    .eq('external_id', messageId)
    .maybeSingle();
  if (messageError || !message) return false;

  const { error } = await serverSupabase.from('chat_reactions').upsert(
    { message_id: message.id, telegram_user_id: telegramUserId, emoji },
    { onConflict: 'message_id,telegram_user_id,emoji', ignoreDuplicates: true },
  );
  if (error) {
    console.warn('[Chat] Supabase reaction write failed:', error.message);
    return false;
  }
  return true;
}

app.get('/api/chat/messages', requireTelegramAuth, async (req: Request, res: Response) => {
  const channelId = typeof req.query.channelId === 'string' ? req.query.channelId.slice(0, 100) : undefined;
  res.json(await loadChatMessages(channelId));
});

app.post('/api/chat/messages', rateLimit(60, 60_000), requireTelegramAuth, async (req: Request, res: Response) => {
  const { message } = req.body;
  const session = (req as any).telegramSession as TelegramSession;
  if (!message || typeof message !== 'object' || typeof message.content !== 'string' || !message.content.trim()) {
    return res.status(400).json({ error: 'Сообщение пустое' });
  }
  if (message.content.length > 2000 || typeof message.id !== 'string' || message.id.length > 100 || typeof message.channelId !== 'string' || message.channelId.length > 100) {
    return res.status(400).json({ error: 'Сообщение слишком длинное или имеет неверный формат' });
  }
  if (message.userId !== session.userId) {
    return res.status(403).json({ error: 'Нельзя отправлять сообщение от имени другого пользователя' });
  }

  const normalized = {
    ...message,
    content: message.content.trim(),
    createdAt: typeof message.createdAt === 'string' ? message.createdAt : new Date().toISOString(),
  };
  const persisted = await persistChatMessage(normalized, session);

  if (!persisted) {
    if (!chatMessages.some((m) => m.id === normalized.id)) chatMessages.push(normalized);
    if (chatMessages.length > 500) chatMessages = chatMessages.slice(-500);
  }

  broadcastToChatClients({ type: 'CHAT_MESSAGE', message: normalized });
  res.json({ success: true, message: normalized, persistent: persisted });
});

app.post('/api/chat/reaction', rateLimit(120, 60_000), requireTelegramAuth, async (req: Request, res: Response) => {
  const { messageId, emoji } = req.body;
  const session = (req as any).telegramSession as TelegramSession;
  if (typeof messageId !== 'string' || messageId.length > 100 || typeof emoji !== 'string' || [...emoji].length > 16) {
    return res.status(400).json({ error: 'Недопустимая реакция' });
  }

  const persisted = await persistChatReaction(messageId, emoji, session.tgId);
  if (!persisted) {
    const target = chatMessages.find((m) => m.id === messageId);
    if (target) {
      target.reactions = target.reactions || {};
      target.reactions[emoji] = (target.reactions[emoji] || 0) + 1;
    }
  }

  broadcastToChatClients({ type: 'CHAT_REACTION', messageId, emoji });
  res.json({ success: true, persistent: persisted });
});

let connectedWsClients = new Set<WsClient>();

function broadcastToChatClients(data: any) {
  const payload = JSON.stringify(data);
  for (const client of connectedWsClients) {
    if (client.readyState === WsClient.OPEN) {
      try {
        client.send(payload);
      } catch (e) {
        // ignore
      }
    }
  }
}

// --- CLIENT SERVING ---
async function startServer() {
  await loadSubscriptions();
  const httpServer = http.createServer(app);

  // Setup WebSocket Server for Live Driver Chat
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/chat', maxPayload: 16 * 1024 });

  wss.on('connection', (ws) => {
    let authenticated = false;
    let authenticatedUserId: string | null = null;
    let messageCount = 0;
    let windowStartedAt = Date.now();
    const authTimeout = setTimeout(() => {
      if (!authenticated && ws.readyState === WsClient.OPEN) {
        ws.close(1008, 'Authentication required');
      }
    }, 5_000);

    ws.on('error', (err) => console.warn('[WS Chat] Socket error:', err));

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === 'AUTH' && typeof data.token === 'string') {
          if (authenticated) {
            ws.close(1008, 'Already authenticated');
            return;
          }
          const session = verifySessionToken(data.token);
          if (!session) {
            ws.close(1008, 'Unauthorized');
            return;
          }
          authenticated = true;
          authenticatedUserId = session.userId;
          clearTimeout(authTimeout);
          setTimeout(() => {
            if (ws.readyState === WsClient.OPEN) ws.close(1000, 'Session expired');
          }, Math.max(1, session.exp - Math.floor(Date.now() / 1000)) * 1000);
          connectedWsClients.add(ws);
          ws.send(JSON.stringify({ type: 'AUTH_OK', userId: session.userId, expiresAt: session.exp }));
          console.log(`[WS Chat] Driver connected (online: ${connectedWsClients.size})`);
          return;
        }

        if (!authenticated) return;

        const now = Date.now();
        if (now - windowStartedAt >= 60_000) {
          windowStartedAt = now;
          messageCount = 0;
        }
        messageCount += 1;
        if (messageCount > 60) {
          ws.send(JSON.stringify({ type: 'RATE_LIMITED', retryAfterMs: 60_000 - (now - windowStartedAt) }));
          return;
        }

        if (data.type === 'SEND_MESSAGE' && data.message) {
          const msg = data.message;
          if (!msg || typeof msg !== 'object' || msg.userId !== authenticatedUserId) return;
          if (typeof msg.id !== 'string' || msg.id.length === 0 || msg.id.length > 100 ||
              typeof msg.channelId !== 'string' || msg.channelId.length === 0 || msg.channelId.length > 100 ||
              typeof msg.content !== 'string' || !msg.content.trim() || msg.content.length > 2000) return;
          if (!chatMessages.some((m) => m.id === msg.id)) {
            chatMessages.push(msg);
            if (chatMessages.length > 500) {
              chatMessages = chatMessages.slice(-500);
            }
          }
          broadcastToChatClients({
            type: 'CHAT_MESSAGE',
            message: msg,
          });
        } else if (data.type === 'ADD_REACTION' && typeof data.messageId === 'string' && data.messageId.length <= 100 &&
                   typeof data.emoji === 'string' && [...data.emoji].length <= 16) {
          const target = chatMessages.find((m) => m.id === data.messageId);
          if (target) {
            target.reactions = target.reactions || {};
            target.reactions[data.emoji] = (target.reactions[data.emoji] || 0) + 1;
            broadcastToChatClients({
              type: 'CHAT_REACTION',
              messageId: data.messageId,
              emoji: data.emoji,
            });
          }
        }
      } catch (err) {
        console.error('[WS Chat] Parse error:', err);
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (authenticated) connectedWsClients.delete(ws);
      console.log(`[WS Chat] Driver disconnected (online: ${connectedWsClients.size})`);
    });
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 ROADLIVE server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
