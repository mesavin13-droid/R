import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket as WsClient } from 'ws';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import webpush from 'web-push';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured in production');
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
  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' https://api-maps.yandex.ru https://yastatic.net 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data: https: blob:; " +
      "connect-src 'self' wss: https:; " +
      "frame-ancestors 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self'"
    );
  }
  next();
});

// Keep request bodies bounded to reduce accidental/abusive memory usage.
app.use(express.json({ limit: '64kb' }));

// Rate limiting: in-memory by default, Redis when REDIS_URL is set.
const REDIS_URL = process.env.REDIS_URL || '';
let redisClient: any = null;

if (REDIS_URL) {
  import('ioredis').then((mod) => {
    redisClient = new mod.default(REDIS_URL);
    redisClient.on('error', (err: any) => console.warn('[Redis] Error:', err.message));
  }).catch(() => console.warn('[Redis] Failed to load ioredis'));
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(max: number, windowMs: number) {
  return async (req: Request, res: Response, next: Function) => {
    const now = Date.now();
    const key = `ratelimit:ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;

    if (redisClient) {
      try {
        const multi = redisClient.multi();
        multi.incr(key);
        multi.pexpire(key, windowMs);
        const results = await multi.exec();
        const count = results?.[0]?.[1] || 0;
        if (count > max) return res.status(429).json({ error: 'Слишком много запросов. Попробуйте позже.' });
        return next();
      } catch (err) {
        console.warn('[Redis] Rate limit check failed:', err);
      }
    }

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
  return async (req: Request, res: Response, next: Function) => {
    const userId = (req as any).telegramSession?.userId;
    if (!userId) return res.status(401).json({ error: 'Требуется авторизация Telegram' });
    const now = Date.now();
    const key = `ratelimit:user:${userId}`;

    if (redisClient) {
      try {
        const multi = redisClient.multi();
        multi.incr(key);
        multi.pexpire(key, windowMs);
        const results = await multi.exec();
        const count = results?.[0]?.[1] || 0;
        if (count > max) return res.status(429).json({ error: 'Слишком много действий. Попробуйте позже.' });
        return next();
      } catch (err) {
        console.warn('[Redis] User rate limit check failed:', err);
      }
    }

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

let subscriptions = new Map<string, StoredSubscription>();

async function loadSubscriptions() {
  if (!serverSupabase) {
    subscriptions = new Map();
    return;
  }

  const { data, error } = await serverSupabase
    .from('push_subscriptions')
    .select('endpoint,user_id,subscription,district_id,created_at');

  if (error) {
    throw new Error(`Failed to load push subscriptions: ${error.message}`);
  }

  subscriptions = new Map(
    (data || []).map((row) => [
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
}

let subscriptionsLoaded = false;

async function ensureSubscriptionsLoaded(): Promise<void> {
  if (subscriptionsLoaded) return;
  try {
    await loadSubscriptions();
    subscriptionsLoaded = true;
  } catch (err) {
    console.error('[Push] Failed to load subscriptions:', err);
  }
}

async function persistPushSubscription(endpoint: string, item: StoredSubscription): Promise<void> {
  if (!serverSupabase) throw new Error('Server storage is not configured');

  const { error } = await serverSupabase.from('push_subscriptions').upsert({
    endpoint,
    user_id: item.userId,
    subscription: item.subscription,
    district_id: item.districtId || null,
    created_at: item.createdAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });

  if (error) throw new Error(`Push subscription persistence failed: ${error.message}`);
}

async function deletePushSubscription(endpoint: string): Promise<void> {
  if (!serverSupabase) throw new Error('Server storage is not configured');
  const { error } = await serverSupabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) throw new Error(`Push subscription deletion failed: ${error.message}`);
}



// --- TELEGRAM SERVER AUTHENTICATION ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
if (isProd && !TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN must be configured in production');
}
const TELEGRAM_API_BASE = TELEGRAM_BOT_TOKEN
  ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`
  : '';

/**
 * Telegram Bot push. Web Push cannot reach the WebViews used by Telegram Mini
 * Apps (no Service Worker), so critical road events and SOS requests are
 * delivered to drivers directly through the bot's private chat instead.
 */
async function listTelegramDrivers(): Promise<number[]> {
  if (!serverSupabase) return [];
  const { data, error } = await serverSupabase
    .from('telegram_accounts')
    .select('telegram_id');
  if (error) {
    console.error('[TG Push] Failed to list Telegram drivers:', error.message);
    return [];
  }
  return (data || [])
    .map((row) => Number(row.telegram_id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

async function sendTelegramNotification(chatId: number, text: string): Promise<boolean> {
  if (!TELEGRAM_API_BASE) return false;
  try {
    const resp = await fetch(`${TELEGRAM_API_BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error(`[TG Push] sendMessage failed (chat ${chatId}): ${resp.status} ${body.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('[TG Push] sendMessage transport error:', err?.message || err);
    return false;
  }
}

async function notifyTelegramDrivers(
  excludeChatId: number,
  text: string,
): Promise<{ tgSentCount: number; notifiedCount: number }> {
  const drivers = await listTelegramDrivers();
  let tgSentCount = 0;
  await Promise.all(
    drivers.map(async (chatId) => {
      if (excludeChatId && chatId === excludeChatId) return;
      if (await sendTelegramNotification(chatId, text)) tgSentCount++;
    }),
  );
  return { tgSentCount, notifiedCount: drivers.length };
}

// --- MANDATORY CHANNEL SUBSCRIPTION GATE ---
// Drivers must be subscribed to the owner's channel to use the map. Membership is
// verified server-side through the Telegram Bot API (getChatMember), so the
// browser never decides who gets in and leaving the channel locks the app on the
// next checked request. Staff (owner/admin/moderator) are exempt by role.

const GATE_SUBSCRIBED_STATUSES = new Set(['creator', 'administrator', 'member', 'restricted']);
const GATE_CACHE_TTL_MS = 60_000;

type ChannelGateConfig = {
  chatId: string;
  username?: string;
  link: string;
};

let gateConfigCache: { config: ChannelGateConfig | null; expiresAt: number } | null = null;
const gateCheckCache = new Map<string, { subscribed: boolean; expiresAt: number }>();

async function resolveChannelGate(): Promise<ChannelGateConfig | null> {
  if (!serverSupabase) return null;
  if (gateConfigCache && gateConfigCache.expiresAt > Date.now()) return gateConfigCache.config;
  const { data, error } = await serverSupabase
    .from('channel_gate_config')
    .select('chat_id, username, link, enabled')
    .eq('id', 1)
    .maybeSingle();
  let config: ChannelGateConfig | null = null;
  if (error) {
    console.warn('[Gate] Failed to read channel config:', error.message);
  } else if (data && data.enabled !== false && data.chat_id && data.link) {
    config = { chatId: data.chat_id, username: data.username || undefined, link: data.link };
  }
  gateConfigCache = { config, expiresAt: Date.now() + 30_000 };
  return config;
}

async function rawChannelMembership(
  chatId: string,
  tgId: number,
): Promise<{ subscribed: boolean; status?: string; error?: string }> {
  if (!TELEGRAM_API_BASE) return { subscribed: false, error: 'bot-not-configured' };
  try {
    const resp = await fetch(`${TELEGRAM_API_BASE}/getChatMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, user_id: tgId }),
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json?.ok || !json?.result?.status) {
      // "chat not found" means the bot is not in the channel at all;
      // "Forbidden: bot is not a member" means it lacks admin rights.
      const description =
        typeof json?.description === 'string' ? json.description : `HTTP ${resp.status}`;
      console.warn(`[Gate] getChatMember failed: ${description}`);
      return { subscribed: false, status: undefined, error: description };
    }
    const status: string = json.result.status;
    return { subscribed: GATE_SUBSCRIBED_STATUSES.has(status), status };
  } catch (err: any) {
    console.warn('[Gate] getChatMember transport error:', err?.message || err);
    return { subscribed: false, error: 'transport-error' };
  }
}

async function isSubscribedToChannel(chatId: string, tgId: number): Promise<boolean> {
  const cacheKey = `${chatId}:${tgId}`;
  const cached = gateCheckCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.subscribed;
  const result = await rawChannelMembership(chatId, tgId);
  // Transient bot failures are never cached, so the next request retries live.
  if (result.error) return false;
  gateCheckCache.set(cacheKey, {
    subscribed: result.subscribed,
    expiresAt: Date.now() + GATE_CACHE_TTL_MS,
  });
  return result.subscribed;
}

function clearGateCache(): void {
  gateConfigCache = null;
  gateCheckCache.clear();
}

// Root of trust: these Telegram ids are owners. They are configured in the server
// environment, so they cannot be revoked or deleted from inside the application.
const ROADLIVE_ADMIN_TELEGRAM_IDS = new Set(
  (process.env.ROADLIVE_ADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

const STAFF_ROLE_CACHE_TTL_MS = 30_000;
const staffRoleCache = new Map<number, { role: StaffRole; expiresAt: number }>();

// Resolves the effective role from the owner list plus the delegated staff table.
// Never trusts anything from the request body or the browser.
async function resolveStaffRole(tgId: number): Promise<StaffRole> {
  if (ROADLIVE_ADMIN_TELEGRAM_IDS.has(String(tgId))) return 'owner';

  const cached = staffRoleCache.get(tgId);
  if (cached && cached.expiresAt > Date.now()) return cached.role;

  let role: StaffRole = 'driver';
  if (serverSupabase) {
    const { data } = await serverSupabase
      .from('telegram_admin_roles')
      .select('role')
      .eq('telegram_id', tgId)
      .maybeSingle();
    if (data?.role === 'admin' || data?.role === 'moderator') role = data.role;
  }

  // Only positive results are cached, so a freshly granted role applies immediately.
  if (role !== 'driver') staffRoleCache.set(tgId, { role, expiresAt: Date.now() + STAFF_ROLE_CACHE_TTL_MS });
  return role;
}

function hasRole(current: StaffRole, required: StaffRole): boolean {
  const rank: Record<StaffRole, number> = { driver: 0, moderator: 1, admin: 2, owner: 3 };
  return rank[current] >= rank[required];
}

const BAN_CACHE_TTL_MS = 15_000;
interface BanState {
  banned: boolean;
  profileId: string | null;
  reason: string | null;
  expiresAt: number;
}
const banStateCache = new Map<number, BanState>();

/**
 * Reads the ban flag for a Telegram id. This is the single source of truth for
 * access: the browser never decides whether a user may act, and a ban takes effect
 * on every device as soon as the cache entry expires (or is dropped on write).
 */
async function resolveBanState(tgId: number): Promise<BanState> {
  const fresh: BanState = { banned: false, profileId: null, reason: null, expiresAt: Date.now() + BAN_CACHE_TTL_MS };
  if (!serverSupabase) return fresh;

  const cached = banStateCache.get(tgId);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const { data, error } = await serverSupabase
    .from('telegram_accounts')
    .select('user_id, profiles(is_banned, ban_reason)')
    .eq('telegram_id', tgId)
    .maybeSingle();

  if (error || !data?.user_id) {
    // A missing link means the user has never completed a login, which is not a ban.
    return fresh;
  }

  const profile = (data as any).profiles;
  const state: BanState = {
    banned: profile?.is_banned === true,
    profileId: data.user_id,
    reason: profile?.ban_reason || null,
    expiresAt: Date.now() + BAN_CACHE_TTL_MS,
  };
  banStateCache.set(tgId, state);
  return state;
}

function invalidateBanState(tgId: number): void {
  banStateCache.delete(tgId);
}

/** Owners are configured in the environment and are not bannable from the app. */
function isOwnerTelegramId(tgId: number): boolean {
  return ROADLIVE_ADMIN_TELEGRAM_IDS.has(String(tgId));
}

const TELEGRAM_SESSION_TTL_SECONDS = Math.max(
  300,
  Math.min(86400, parseInt(process.env.TELEGRAM_SESSION_TTL_SECONDS || '3600', 10)),
);
const TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = Math.max(
  60,
  Math.min(3600, parseInt(process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS || '600', 10)),
);

type TelegramAuthUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

type StaffRole = 'owner' | 'admin' | 'moderator' | 'driver';

type TelegramSession = {
  tgId: number;
  userId: string;
  user: TelegramAuthUser;
  role: StaffRole;
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
  if (Math.abs(now - authDate) > TELEGRAM_INIT_DATA_MAX_AGE_SECONDS) {
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

function getSessionToken(req: Request): string | null {
  const cookies = req.headers.cookie || '';
  const match = cookies.match(/roadlive_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function requireTelegramAuth(req: Request, res: Response, next: Function) {
  const token = getSessionToken(req);
  const session = token ? verifySessionToken(token) : null;
  if (!session) {
    return res.status(401).json({ error: 'Требуется авторизация Telegram' });
  }

  // A session cookie alone is not enough: the ban state is re-read on every
  // request so that revoking a user cannot be bypassed by reusing an old cookie.
  const ban = await resolveBanState(session.tgId);
  if (ban.banned) {
    return res.status(403).json({
      error: 'Доступ заблокирован администратором',
      banned: true,
      reason: ban.reason,
    });
  }

  (req as any).telegramSession = session;

  // Mandatory channel subscription, enforced on every write request so that
  // leaving the channel blocks actions immediately regardless of UI state.
  // Read-only calls stay cheap and the gate endpoint itself stays reachable.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const path = req.path;
    if (path !== '/api/auth/logout' && path !== '/api/auth/ws-token') {
      const config = await resolveChannelGate();
      if (config) {
        const role = await resolveStaffRole(session.tgId);
        if (role === 'driver' && !(await isSubscribedToChannel(config.chatId, session.tgId))) {
          return res.status(403).json({
            error: 'Подпишитесь на канал, чтобы продолжить',
            code: 'CHANNEL_SUBSCRIPTION_REQUIRED',
            channel: { username: config.username, link: config.link },
          });
        }
      }
    }
  }

  next();
}

// Status of the mandatory channel gate for the current user. The client renders
// the subscription screen from this answer and re-checks when "Я подписался"
// is pressed. Drivers who are not subscribed get enabled=true + subscribed=false;
// staff always pass through.
app.get('/api/telegram/subscription', requireTelegramAuth, async (req: Request, res: Response) => {
  const session = (req as any).telegramSession as TelegramSession;
  const config = await resolveChannelGate();
  if (!config) return res.json({ enabled: false, subscribed: true, channel: null });
  const channel = { username: config.username, link: config.link };
  const role = await resolveStaffRole(session.tgId);
  if (role !== 'driver') {
    return res.json({ enabled: true, subscribed: true, channel, staffBypass: true });
  }
  const result = await rawChannelMembership(config.chatId, session.tgId);
  return res.json({
    enabled: true,
    subscribed: result.subscribed,
    status: result.status || null,
    error: result.error || null,
    channel,
  });
});

app.post('/api/telegram/auth', rateLimit(20, 60_000), async (req: Request, res: Response) => {
  try {
    if (!req.body?.initData || typeof req.body.initData !== 'string') {
      return res.status(400).json({ error: 'Telegram initData обязателен' });
    }

    const user = validateTelegramInitData(req.body.initData);
    const now = Math.floor(Date.now() / 1000);
    const role = await resolveStaffRole(user.id);
    const isAdmin = role !== 'driver';

    // Refuse to mint a session for a banned user, otherwise the cookie would be
    // issued first and only rejected later on every other endpoint.
    const ban = await resolveBanState(user.id);
    if (ban.banned) {
      return res.status(403).json({
        error: 'Доступ заблокирован администратором',
        banned: true,
        reason: ban.reason,
      });
    }

    const session: TelegramSession = {
      tgId: user.id,
      userId: `tg-${user.id}`,
      user,
      role,
      iat: now,
      exp: now + TELEGRAM_SESSION_TTL_SECONDS,
    };

    const token = encodeSession(session);
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('roadlive_session', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: TELEGRAM_SESSION_TTL_SECONDS * 1000,
      path: '/',
    });

    // Provision the personal account from the verified Telegram identity before
    // the first authenticated request arrives. Failures must not block the login.
    await getOrCreateTelegramProfile(session).catch((err) => {
      console.warn('[Auth] profile provisioning failed:', err?.message || err);
    });

    return res.json({
      authenticated: true,
      expiresAt: session.exp,
      user,
      role: session.role,
      isAdmin,
      isOwner: role === 'owner',
    });
  } catch (error: any) {
    return res.status(401).json({ error: error?.message || 'Telegram authentication failed' });
  }
});

app.post('/api/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie('roadlive_session', { path: '/' });
  res.json({ success: true });
});

app.post('/api/auth/ws-token', requireTelegramAuth, (req: Request, res: Response) => {
  const session = (req as any).telegramSession as TelegramSession;
  const now = Math.floor(Date.now() / 1000);
  const wsSession: TelegramSession = {
    ...session,
    iat: now,
    exp: now + 300,
  };
  res.json({ wsToken: encodeSession(wsSession) });
});

// --- API ROUTES ---

// 1. Current authenticated user / server-authoritative role
app.get('/api/auth/me', requireTelegramAuth, async (req: Request, res: Response) => {
  const session = (req as any).telegramSession as TelegramSession;
  const role = await resolveStaffRole(session.tgId);
  res.json({
    authenticated: true,
    userId: session.userId,
    telegramId: session.tgId,
    expiresAt: session.exp,
    role,
    isAdmin: role !== 'driver',
    isOwner: role === 'owner',
  });
});

// Server-authoritative staff guards. UI visibility is not a security boundary.
// The role is re-read from the database so a revoked admin loses access immediately.
async function guardRole(req: Request, res: Response, required: StaffRole): Promise<TelegramSession | null> {
  const session = (req as any).telegramSession as TelegramSession | undefined;
  if (!session) {
    res.status(403).json({ error: 'Требуются права администратора' });
    return null;
  }
  const role = await resolveStaffRole(session.tgId);
  if (!hasRole(role, required)) {
    res.status(403).json({
      error:
        required === 'owner'
          ? 'Доступно только владельцу'
          : 'Требуются права администратора',
      role,
    });
    return null;
  }
  // Hand the server-verified role to downstream handlers; the cookie value is not trusted.
  const verified = { ...session, role };
  (req as any).telegramSession = verified;
  return verified;
}

async function requireAdmin(req: Request, res: Response, next: Function) {
  if (!(await guardRole(req, res, 'moderator'))) return;
  next();
}

// Users and stations require the full admin rank. Moderators stay scoped to events,
// so a compromised moderator account cannot ban drivers or edit the station map.
async function requireStaffAdmin(req: Request, res: Response, next: Function) {
  if (!(await guardRole(req, res, 'admin'))) return;
  next();
}

// Only the owner: staff management and advertising.
async function requireOwner(req: Request, res: Response, next: Function) {
  if (!(await guardRole(req, res, 'owner'))) return;
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
app.get('/api/push/status', rateLimit(60, 60_000), requireTelegramAuth, async (req: Request, res: Response) => {
  await ensureSubscriptionsLoaded();
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

// 3. Register or Update Push Subscription
app.post('/api/push/subscribe', rateLimit(30, 60_000), requireTelegramAuth, async (req: Request, res: Response) => {
  await ensureSubscriptionsLoaded();
  const { subscription } = req.body;
  const districtId = typeof req.body?.districtId === 'string' ? req.body.districtId.trim().slice(0, 100) : null;
  const userId = (req as any).telegramSession.userId;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(503).json({ error: 'Web Push не настроен на сервере' });
  }

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
  try {
    await persistPushSubscription(endpoint, item);
  } catch (error: any) {
    return res.status(503).json({ error: error?.message || 'Не удалось сохранить push-подписку' });
  }
  subscriptions.set(endpoint, item);
  console.log(`[Push] Registered subscriber (total: ${subscriptions.size})`);

  res.json({
    success: true,
    persistent: true,
    message: 'Успешно подписан на критические уведомления ROADLIVE',
    subscribersCount: subscriptions.size,
  });
});

// 4. Unsubscribe
app.post('/api/push/unsubscribe', rateLimit(30, 60_000), requireTelegramAuth, async (req: Request, res: Response) => {
  await ensureSubscriptionsLoaded();
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint обязателен' });
  }

  const current = subscriptions.get(endpoint);
  if (current && current.userId && current.userId !== (req as any).telegramSession.userId) {
    return res.status(403).json({ error: 'Эта push-подписка принадлежит другому пользователю' });
  }

  try {
    await deletePushSubscription(endpoint);
  } catch (error: any) {
    return res.status(503).json({ error: error?.message || 'Не удалось удалить push-подписку' });
  }
  const deleted = subscriptions.delete(endpoint);
  console.log(`[Push] Unsubscribed (remaining: ${subscriptions.size})`);

  res.json({ success: true, deleted, persistent: true, subscribersCount: subscriptions.size });
});

// 5. Broadcast Critical Road Event
app.post('/api/push/broadcast-critical', rateLimit(10, 60_000), requireTelegramAuth, userRateLimit(3, 60 * 60_000), async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище не настроено' });
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return res.status(503).json({ error: 'Web Push не настроен на сервере' });

  await ensureSubscriptionsLoaded();
  const session = (req as any).telegramSession as TelegramSession;
  const eventId = typeof req.body?.eventId === 'string' ? req.body.eventId.trim().slice(0, 100) : '';
  const inlineEvent = req.body?.event;

  let event: {
    id: string;
    user_id: string;
    title: string;
    address: string;
    description: string;
    type: string;
    sub_type: string;
    status: string;
  } | null = null;

  const profileId = await resolveEventProfile(session);
  if (!profileId) return res.status(403).json({ error: 'Профиль водителя не найден' });

  if (eventId) {
    // The push payload is derived exclusively from the persisted event.
    const { data, error: eventError } = await serverSupabase
      .from('events')
      .select('id,user_id,title,address,description,type,sub_type,status')
      .eq('id', eventId)
      .maybeSingle();

    if (eventError || !data) return res.status(404).json({ error: 'Событие не найдено' });
    if (data.user_id !== profileId) return res.status(403).json({ error: 'Можно уведомлять только о своем событии' });
    if (data.status === 'hidden' || data.status === 'expired' || data.status === 'resolved') {
      return res.status(409).json({ error: 'Событие больше не актуально' });
    }
    event = data;
  } else if (inlineEvent && typeof inlineEvent.userId === 'string' && typeof inlineEvent.id === 'string') {
    // Question alerts arrive as an inline object (no row to load).
    if (inlineEvent.userId !== profileId) return res.status(403).json({ error: 'Можно уведомлять только о своих событиях' });
    event = {
      id: inlineEvent.id,
      user_id: inlineEvent.userId,
      title: String(inlineEvent.title || 'Новое уведомление').slice(0, 200),
      address: String(inlineEvent.address || '').slice(0, 255),
      description: String(inlineEvent.description || '').slice(0, 1000),
      type: 'question',
      sub_type: 'question',
      status: 'active',
    };
  } else {
    return res.status(400).json({ error: 'eventId обязателен' });
  }

  const isCritical =
    (event.type === 'accident' && (event.sub_type === 'road_blocked' || event.sub_type === 'major')) ||
    (event.type === 'crossing' && event.sub_type === 'closed') ||
    (event.type === 'road' && (event.sub_type === 'closure' || event.sub_type === 'ice')) ||
    event.type === 'hazard' ||
    event.type === 'assistance';

  const emoji =
    event.type === 'assistance' ? '🆘' :
    event.type === 'question' ? '❓' :
    event.type === 'accident' ? '🚗' :
    event.type === 'crossing' ? '🚧' :
    event.type === 'road' ? '🛣️' : '⚠️';

  const label =
    event.type === 'assistance' ? 'SOS-запрос помощи' :
    event.type === 'question' ? 'Вопрос водителя' :
    isCritical ? 'Критическое событие на дороге' : 'Событие на дороге';

  const tgText = [
    `${emoji} <b>ROADLIVE: ${label}</b>`,
    `🚗 ${String(event.title).slice(0, 200)}`,
    String(event.address).slice(0, 255) ? `📍 ${String(event.address).slice(0, 255)}` : '',
    event.description ? String(event.description).slice(0, 1000) : '',
    event.type === 'question' ? '' : `Открыть в приложении: https://roadlive.vercel.app/?event=${event.id}`,
  ]
    .filter(Boolean)
    .join('\n');

  const payload = JSON.stringify({
    title: `${emoji} ROADLIVE: ${label}`,
    body: `${String(event.address).slice(0, 255)}${event.description ? `. ${String(event.description).slice(0, 1000)}` : ''}`,
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

  // Telegram Bot notifications run regardless of Web Push subscriber count.
  const tgResult = await notifyTelegramDrivers(session.tgId, tgText);

  const endpoints = Array.from(subscriptions.keys());
  if (endpoints.length === 0) {
    return res.json({
      success: true,
      sentCount: 0,
      failureCount: 0,
      totalSubscribers: 0,
      isCritical,
      tgSentCount: tgResult.tgSentCount,
      message: 'Нет активных подписчиков Web Push',
    });
  }

  let sentCount = 0;
  let failureCount = 0;
  const expiredEndpoints: string[] = [];

  await Promise.all(endpoints.map(async (ep) => {
    const item = subscriptions.get(ep);
    if (!item) return;
    if (item.userId && item.userId === session.userId) return;

    try {
      await webpush.sendNotification(item.subscription, payload);
      sentCount++;
    } catch (err: any) {
      failureCount++;
      if (err.statusCode === 404 || err.statusCode === 410) expiredEndpoints.push(ep);
    }
  }));

  if (expiredEndpoints.length > 0) {
    await Promise.all(expiredEndpoints.map(async (ep) => {
      subscriptions.delete(ep);
      try { await deletePushSubscription(ep); } catch {}
    }));
  }

  res.json({ success: true, sentCount, failureCount, totalSubscribers: subscriptions.size, isCritical, tgSentCount: tgResult.tgSentCount });
});

// 6. Test Push Endpoint
app.post('/api/push/test', rateLimit(5, 60_000), requireTelegramAuth, userRateLimit(10, 60 * 60_000), async (req: Request, res: Response) => {
  await ensureSubscriptionsLoaded();
  const { targetEndpoint } = req.body;
  const session = (req as any).telegramSession as TelegramSession;

  const tgDelivered = await sendTelegramNotification(
    session.tgId,
    '✅ <b>ROADLIVE: тест уведомлений</b>\nЕсли вы видите это сообщение — уведомления работают. Аналогичные оповещения будут приходить о критических событиях и SOS-запросах водителей.',
  );

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
      return res.json({
        success: true,
        tgDelivered,
        message: tgDelivered ? 'Тестовый пуш отправлен на устройство и в Telegram!' : 'Тестовый пуш отправлен на ваше устройство',
      });
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
      tgDelivered,
      message: tgDelivered
        ? 'Проверочное сообщение отправлено в Telegram!'
        : 'Нет активных подписчиков. Разрешите уведомления в профиле!',
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
    message: tgDelivered
      ? `Тестовый пуш отправлен на ${sent} устройств и в Telegram!`
      : `Тестовый пуш отправлен на ${sent} активных устройств`,
    sentCount: sent,
    tgDelivered,
  });
});

// --- AUTHORITATIVE ROAD EVENT API ---
const EVENT_TYPES = new Set(['crossing','accident','patrol','fuel','road','traffic_light','hazard','other']);
const UUID_INPUT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_INPUT = /^[a-z0-9-]{1,100}$/;

const cityIdCache = new Map<string, string | null>();
const districtIdCache = new Map<string, string | null>();

/**
 * The browser addresses cities and districts by stable slug ('nsk-city-01',
 * 'nsk-central'), while the columns are UUID foreign keys. Resolve the slug to a
 * UUID server-side; reject anything that is neither a known slug nor a UUID so a
 * client can never write an arbitrary reference.
 */
async function resolveCityId(input: unknown): Promise<string | null> {
  if (!serverSupabase) return null;
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value) return resolveCitySlug('nsk-city-01');
  if (UUID_INPUT.test(value)) return value;
  if (!SLUG_INPUT.test(value)) return null;
  return resolveCitySlug(value);
}

async function resolveCitySlug(slug: string): Promise<string | null> {
  if (cityIdCache.has(slug)) return cityIdCache.get(slug)!;
  const { data } = await serverSupabase!
    .from('cities')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  const id = data?.id || null;
  // Only cache hits, so seeding a city does not require a restart to be picked up.
  if (id) cityIdCache.set(slug, id);
  return id;
}

async function resolveDistrictId(input: unknown): Promise<string | null> {
  if (!serverSupabase) return null;
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value) return null;
  if (UUID_INPUT.test(value)) return value;
  if (!SLUG_INPUT.test(value)) return null;
  if (districtIdCache.has(value)) return districtIdCache.get(value)!;
  const { data } = await serverSupabase!
    .from('districts')
    .select('id')
    .eq('slug', value)
    .maybeSingle();
  const id = data?.id || null;
  if (id) districtIdCache.set(value, id);
  return id;
}

async function getOrCreateTelegramProfile(session: TelegramSession): Promise<string | null> {
  if (!serverSupabase) return null;
  const user = session.user;
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim().slice(0, 100) || 'Водитель';
  const username = user.username || null;
  const firstName = user.first_name || null;
  const lastName = user.last_name || null;

  const existing = await serverSupabase
    .from('telegram_accounts')
    .select('user_id, username, first_name, last_name')
    .eq('telegram_id', session.tgId)
    .maybeSingle();
  if (existing.data?.user_id) {
    const row = existing.data;
    if (row.username !== username || row.first_name !== firstName || row.last_name !== lastName) {
      await serverSupabase
        .from('telegram_accounts')
        .update({ username, first_name: firstName, last_name: lastName })
        .eq('telegram_id', session.tgId);
    }
    return row.user_id;
  }

  const created = await serverSupabase
    .from('profiles')
    .insert({
      full_name: fullName,
      role: session.role,
    })
    .select('id')
    .single();
  if (created.error || !created.data) {
    console.warn('[Auth] profile creation failed:', created.error?.message);
    return null;
  }

  const linked = await serverSupabase.from('telegram_accounts').insert({
    user_id: created.data.id,
    telegram_id: session.tgId,
    username,
    first_name: firstName,
    last_name: lastName,
  });
  if (linked.error) {
    console.warn('[Auth] Telegram account link failed:', linked.error.message);
    await serverSupabase.from('profiles').delete().eq('id', created.data.id);
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

function sanitizeQuestionInput(input: any) {
  if (!input || typeof input !== 'object') return null;
  const category = typeof input.category === 'string' ? input.category.trim().slice(0, 50) : '';
  const question = typeof input.question === 'string' ? input.question.trim().slice(0, 1000) : '';
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const address = typeof input.address === 'string' ? input.address.trim().slice(0, 255) : '';
  if (!category || !question || !address) return null;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { category, question, latitude, longitude, address, city_id: typeof input.cityId === 'string' && input.cityId.trim() ? input.cityId.trim().slice(0, 100) : 'nsk-city-01', district_id: typeof input.districtId === 'string' && input.districtId.trim() ? input.districtId.trim().slice(0, 100) : null };
}
function sanitizeQuestionAnswer(input: any) {
  if (!input || typeof input !== 'object') return null;
  const content = typeof input.content === 'string' ? input.content.trim().slice(0, 1000) : '';
  return content ? { content } : null;
}
app.get('/api/questions', requireTelegramAuth, async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище вопросов не настроено' });
  const cityId = await resolveCityId(typeof req.query.cityId === 'string' ? req.query.cityId.slice(0, 100) : 'nsk-city-01');
  if (!cityId) return res.status(400).json({ error: 'Неизвестный город' });
  const { data, error } = await serverSupabase.from('questions').select('id,user_id,city_id,district_id,category,question,latitude,longitude,address,answers_count,status,created_at').eq('city_id', cityId).order('created_at', { ascending: false }).limit(500);
  if (error) return res.status(500).json({ error: 'Не удалось загрузить вопросы' });
  const ids = (data || []).map((q: any) => q.id);
  let answers: any[] = [];
  if (ids.length) {
    const result = await serverSupabase.from('question_answers').select('id,question_id,user_id,author_name,content,helpful_count,is_verified,created_at').in('question_id', ids).order('created_at', { ascending: true }).limit(2000);
    if (!result.error) answers = result.data || [];
  }
  return res.json({ questions: (data || []).map((q: any) => ({ ...q, author_name: 'Водитель', answers: answers.filter((a) => a.question_id === q.id) })) });
});
app.post('/api/questions', requireTelegramAuth, userRateLimit(20, 60_000), async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище вопросов не настроено' });
  const session = (req as any).telegramSession as TelegramSession;
  const input = sanitizeQuestionInput(req.body);
  if (!input) return res.status(400).json({ error: 'Некорректные данные вопроса' });
  const profileId = await resolveEventProfile(session);
  if (!profileId) return res.status(500).json({ error: 'Не удалось определить профиль водителя' });
  const cityId = await resolveCityId(input.city_id);
  if (!cityId) return res.status(400).json({ error: 'Неизвестный город' });
  const districtId = await resolveDistrictId(input.district_id);
  if (input.district_id && !districtId) return res.status(400).json({ error: 'Неизвестный район' });
  const { city_id: _citySlug, district_id: _districtSlug, ...questionColumns } = input;
  const { data, error } = await serverSupabase.from('questions').insert({ ...questionColumns, city_id: cityId, district_id: districtId, user_id: profileId, answers_count: 0, status: 'open' }).select('id,user_id,city_id,district_id,category,question,latitude,longitude,address,answers_count,status,created_at').single();
  if (error) return res.status(500).json({ error: 'Не удалось сохранить вопрос' });
  return res.status(201).json({ question: { ...data, author_name: [session.user.first_name, session.user.last_name].filter(Boolean).join(' ') || 'Водитель', answers: [] } });
});
app.post('/api/questions/:questionId/answers', requireTelegramAuth, userRateLimit(30, 60_000), async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище ответов не настроено' });
  const questionId = typeof req.params.questionId === 'string' ? req.params.questionId : '';
  const input = sanitizeQuestionAnswer(req.body);
  if (!input || !questionId) return res.status(400).json({ error: 'Некорректный ответ' });
  const session = (req as any).telegramSession as TelegramSession;
  const profileId = await resolveEventProfile(session);
  if (!profileId) return res.status(500).json({ error: 'Не удалось определить профиль водителя' });
  const { data: question, error: questionError } = await serverSupabase.from('questions').select('id,status,answers_count').eq('id', questionId).maybeSingle();
  if (questionError || !question) return res.status(404).json({ error: 'Вопрос не найден' });
  if (question.status !== 'open') return res.status(409).json({ error: 'Вопрос закрыт' });
  const authorName = [session.user.first_name, session.user.last_name].filter(Boolean).join(' ').slice(0, 100) || 'Водитель';
  const { data: answer, error } = await serverSupabase.from('question_answers').insert({ question_id: questionId, user_id: profileId, author_name: authorName, content: input.content, helpful_count: 0, is_verified: hasRole(await resolveStaffRole(session.tgId), 'moderator') }).select('id,question_id,user_id,author_name,content,helpful_count,is_verified,created_at').single();
  if (error) return res.status(500).json({ error: 'Не удалось сохранить ответ' });
  const { data: updatedQuestion, error: updateError } = await serverSupabase.from('questions').update({ answers_count: Number(question.answers_count || 0) + 1 }).eq('id', questionId).select('id,user_id,city_id,district_id,category,question,latitude,longitude,address,answers_count,status,created_at').single();
  if (updateError) return res.status(500).json({ error: 'Ответ сохранён, но счётчик не обновился' });
  return res.status(201).json({ answer, question: updatedQuestion });
});
app.post('/api/questions/:questionId/helpful', requireTelegramAuth, userRateLimit(60, 60_000), async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище ответов не настроено' });
  const questionId = typeof req.params.questionId === 'string' ? req.params.questionId : '';
  const answerId = typeof req.body?.answerId === 'string' ? req.body.answerId : '';
  if (!questionId || !answerId || answerId.length > 100) return res.status(400).json({ error: 'Некорректные данные' });
  const { data: answer, error: readError } = await serverSupabase.from('question_answers').select('id,question_id,helpful_count').eq('id', answerId).eq('question_id', questionId).maybeSingle();
  if (readError || !answer) return res.status(404).json({ error: 'Ответ не найден' });
  const { data: updated, error } = await serverSupabase.from('question_answers').update({ helpful_count: Number(answer.helpful_count || 0) + 1 }).eq('id', answerId).select('id,question_id,user_id,author_name,content,helpful_count,is_verified,created_at').single();
  if (error) return res.status(500).json({ error: 'Не удалось отметить ответ' });
  return res.json({ answer: updated });
});
app.delete('/api/questions/:questionId', requireTelegramAuth, userRateLimit(20, 60_000), async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище вопросов не настроено' });
  const session = (req as any).telegramSession as TelegramSession;
  const profileId = await resolveEventProfile(session);
  if (!profileId) return res.status(500).json({ error: 'Не удалось определить профиль водителя' });
  const questionId = typeof req.params.questionId === 'string' ? req.params.questionId : '';
  const { data: question, error: readError } = await serverSupabase.from('questions').select('id,user_id').eq('id', questionId).maybeSingle();
  if (readError || !question) return res.status(404).json({ error: 'Вопрос не найден' });
  if (question.user_id !== profileId) return res.status(403).json({ error: 'Можно удалить только свой вопрос' });
  const { error } = await serverSupabase.from('questions').delete().eq('id', questionId);
  if (error) return res.status(500).json({ error: 'Не удалось удалить вопрос' });
  return res.json({ success: true });
});
app.delete('/api/questions/:questionId/answers/:answerId', requireTelegramAuth, userRateLimit(30, 60_000), async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище ответов не настроено' });
  const session = (req as any).telegramSession as TelegramSession;
  const profileId = await resolveEventProfile(session);
  if (!profileId) return res.status(500).json({ error: 'Не удалось определить профиль водителя' });
  const questionId = typeof req.params.questionId === 'string' ? req.params.questionId : '';
  const answerId = typeof req.params.answerId === 'string' ? req.params.answerId : '';
  const { data: answer, error: readError } = await serverSupabase.from('question_answers').select('id,question_id,user_id').eq('id', answerId).eq('question_id', questionId).maybeSingle();
  if (readError || !answer) return res.status(404).json({ error: 'Ответ не найден' });
  if (answer.user_id !== profileId) return res.status(403).json({ error: 'Можно удалить только свой ответ' });
  const { error } = await serverSupabase.from('question_answers').delete().eq('id', answerId);
  if (error) return res.status(500).json({ error: 'Не удалось удалить ответ' });
  const { data: question } = await serverSupabase.from('questions').select('answers_count').eq('id', questionId).maybeSingle();
  await serverSupabase.from('questions').update({ answers_count: Math.max(0, Number(question?.answers_count || 0) - 1) }).eq('id', questionId);
  return res.json({ success: true });
});

app.post('/api/events', rateLimit(30, 60_000), requireTelegramAuth, userRateLimit(20, 60_000), async (req: Request, res: Response) => {
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

  const cityId = await resolveCityId(input.city_id);
  if (!cityId) return res.status(400).json({ error: 'Неизвестный город' });
  const districtId = await resolveDistrictId(input.district_id);
  if (input.district_id && !districtId) return res.status(400).json({ error: 'Неизвестный район' });
  const { city_id: _citySlug, district_id: _districtSlug, ...eventColumns } = input;

  const { data, error } = await serverSupabase
    .from('events')
    .insert({
      user_id: profileId,
      ...eventColumns,
      city_id: cityId,
      district_id: districtId,
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
  const cityId = await resolveCityId(typeof req.query.cityId === 'string' ? req.query.cityId.slice(0, 100) : 'nsk-city-01');
  if (!cityId) return res.status(400).json({ error: 'Неизвестный город' });
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

app.post('/api/events/:eventId/confirmation', requireTelegramAuth, userRateLimit(30, 60_000), async (req: Request, res: Response) => {
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

app.post('/api/events/:eventId/comments', requireTelegramAuth, userRateLimit(30, 60_000), async (req: Request, res: Response) => {
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


async function loadEventForMutation(eventId: string) {
  if (!serverSupabase) throw new Error('Серверное хранилище не настроено');
  const result = await serverSupabase.from('events').select('*').eq('id', eventId).maybeSingle();
  if (result.error || !result.data) return null;
  return result.data;
}

app.post('/api/events/:eventId/delete', requireTelegramAuth, userRateLimit(10, 60_000), async (req: Request, res: Response) => {
  const session = (req as any).telegramSession as TelegramSession;
  const eventId = req.params.eventId;
  if (!eventIdIsValid(eventId) || !serverSupabase) return res.status(400).json({ error: 'Некорректный запрос' });
  const profileId = await resolveEventProfile(session);
  const event = await loadEventForMutation(eventId);
  if (!event) return res.status(404).json({ error: 'Событие не найдено' });
  if (event.user_id !== profileId) return res.status(403).json({ error: 'Удалять можно только свои события' });
  const result = await serverSupabase.from('events').delete().eq('id', eventId).eq('user_id', profileId);
  if (result.error) return res.status(500).json({ error: 'Не удалось удалить событие' });
  res.json({ success: true, eventId });
});

app.post('/api/events/:eventId/assistance', requireTelegramAuth, userRateLimit(10, 60_000), async (req: Request, res: Response) => {
  const session = (req as any).telegramSession as TelegramSession;
  const eventId = req.params.eventId;
  if (!eventIdIsValid(eventId) || !serverSupabase) return res.status(400).json({ error: 'Некорректный запрос' });
  const profileId = await resolveEventProfile(session);
  const event = await loadEventForMutation(eventId);
  if (!event) return res.status(404).json({ error: 'Событие не найдено' });
  const now = new Date().toISOString();
  const helperName = [session.user.first_name, session.user.last_name].filter(Boolean).join(' ').slice(0, 100) || 'Водитель';
  const updates = await serverSupabase.from('events').update({ updated_at: now }).eq('id', eventId).select('*').single();
  if (updates.error || !updates.data) return res.status(500).json({ error: 'Не удалось обновить помощь' });
  const comment = await serverSupabase.from('event_comments').insert({
    event_id: eventId,
    user_id: profileId,
    author_name: helperName,
    content: '🤝 Выехал на помощь водителю! Постараюсь быть как можно быстрее.',
  }).select('*').single();
  if (comment.error) return res.status(500).json({ error: 'Не удалось сохранить сообщение помощи' });
  res.json({ event: updates.data, comment: comment.data });
});

app.post('/api/events/:eventId/resolved', requireTelegramAuth, userRateLimit(10, 60_000), async (req: Request, res: Response) => {
  const session = (req as any).telegramSession as TelegramSession;
  const eventId = req.params.eventId;
  if (!eventIdIsValid(eventId) || !serverSupabase) return res.status(400).json({ error: 'Некорректный запрос' });
  const profileId = await resolveEventProfile(session);
  const event = await loadEventForMutation(eventId);
  if (!event) return res.status(404).json({ error: 'Событие не найдено' });
  const updates: any = { updated_at: new Date().toISOString() };
  if (event.user_id === profileId) updates.status = 'resolved';
  const result = await serverSupabase.from('events').update(updates).eq('id', eventId).select('*').single();
  if (result.error || !result.data) return res.status(500).json({ error: 'Не удалось закрыть событие' });
  res.json({ event: result.data });
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function logAdminAction(adminProfileId: string | null, action: string, targetType: string, targetId: string) {
  if (!serverSupabase) return;
  if (!UUID_PATTERN.test(targetId)) return;
  const { error } = await serverSupabase.from('admin_actions').insert({
    admin_id: adminProfileId && UUID_PATTERN.test(adminProfileId) ? adminProfileId : null,
    action,
    target_type: targetType,
    target_id: targetId,
  });
  if (error) console.warn('[Audit] Failed to record admin action:', error.message);
}

// Returns the profile UUID that represents an acting staff member, for the audit log.
// A profile may be linked to more than one Telegram account, so the lookup is capped
// instead of assuming exactly one row.
async function adminProfileIdFor(session: TelegramSession | null | undefined): Promise<string | null> {
  if (!session || !serverSupabase) return null;
  const { data } = await serverSupabase
    .from('telegram_accounts')
    .select('user_id')
    .eq('telegram_id', session.tgId)
    .limit(1)
    .maybeSingle();
  return data?.user_id || null;
}

// Every Telegram id linked to a profile, so a ban is flushed from the cache for each
// of them rather than only the first.
async function telegramIdsForProfile(profileId: string): Promise<number[]> {
  if (!serverSupabase) return [];
  const { data } = await serverSupabase.from('telegram_accounts').select('telegram_id').eq('user_id', profileId);
  return (data || [])
    .map((row: any) => Number(row.telegram_id))
    .filter((value: number) => Number.isFinite(value));
}

// Admin user list. The browser used to hold its own copy of users in localStorage,
// which meant a ban existed on exactly one device. This endpoint is the real list.
app.get('/api/admin/users', requireTelegramAuth, requireStaffAdmin, async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'База данных недоступна' });

  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 80) : '';
  const session = (req as any).telegramSession as TelegramSession;

  let query = serverSupabase
    .from('profiles')
    .select('id, full_name, role, is_banned, banned_at, banned_by, banned_by_username, ban_reason, rating, level, avatar_url, created_at, updated_at, telegram_accounts(telegram_id, username)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (search) {
    // Postgres needs the literal to be wildcard-shaped; escape user input first.
    const safe = search.replace(/[,%()]/g, ' ');
    query = query.or(`full_name.ilike.%${safe}%,ban_reason.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Не удалось загрузить пользователей' });

  const users = (data || []).map((row: any) => {
    const account = Array.isArray(row.telegram_accounts) ? row.telegram_accounts[0] : row.telegram_accounts;
    return {
      id: row.id,
      fullName: row.full_name,
      role: row.role,
      isBanned: row.is_banned === true,
      bannedAt: row.banned_at,
      bannedBy: row.banned_by,
      bannedByUsername: row.banned_by_username,
      banReason: row.ban_reason,
      rating: row.rating,
      level: row.level,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
      telegramId: account?.telegram_id ?? null,
      username: account?.username ?? null,
      isOwner: account?.telegram_id ? isOwnerTelegramId(Number(account.telegram_id)) : false,
    };
  });

  res.json({ users });
});

app.post('/api/admin/users/:userId/ban', requireTelegramAuth, userRateLimit(30, 60_000), requireStaffAdmin, async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'База данных недоступна' });

  const targetId = req.params.userId;
  const banned = req.body?.banned === true;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : null;

  if (!UUID_PATTERN.test(targetId)) {
    return res.status(400).json({ error: 'Некорректный идентификатор пользователя' });
  }

  const session = (req as any).telegramSession as TelegramSession;

  const { data: targetAccount, error: lookupError } = await serverSupabase
    .from('telegram_accounts')
    .select('telegram_id, username')
    .eq('user_id', targetId)
    .limit(1)
    .maybeSingle();
  if (lookupError) return res.status(500).json({ error: 'Не удалось найти пользователя' });

  // The owner list is the root of trust and lives outside the database, so it must
  // not be possible to lock out the only account that can undo the ban.
  if (targetAccount?.telegram_id && isOwnerTelegramId(Number(targetAccount.telegram_id))) {
    return res.status(403).json({ error: 'Владельца банить нельзя' });
  }
  if (targetId === session.userId) {
    return res.status(403).json({ error: 'Нельзя забанить самого себя' });
  }

  const patch: Record<string, unknown> = { is_banned: banned };
  if (banned) {
    patch.banned_at = new Date().toISOString();
    patch.banned_by = session.tgId;
    patch.banned_by_username = session.user?.username || null;
    patch.ban_reason = reason || null;
  } else {
    patch.banned_at = null;
    patch.banned_by = null;
    patch.banned_by_username = null;
    patch.ban_reason = null;
  }

  const { data, error } = await serverSupabase
    .from('profiles')
    .update(patch)
    .eq('id', targetId)
    .select('id, is_banned, banned_at, banned_by_username, ban_reason')
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'Не удалось сохранить статус пользователя' });
  if (!data) return res.status(404).json({ error: 'Пользователь не найден' });

  // Drop the cached decision so the change applies to the target immediately
  // instead of after the TTL, and so a fresh login is refused right away.
  for (const linkedTelegramId of await telegramIdsForProfile(targetId)) {
    invalidateBanState(linkedTelegramId);
  }

  const adminProfileId = await adminProfileIdFor(session);
  await logAdminAction(adminProfileId, banned ? 'user_ban' : 'user_unban', 'profile', targetId);

  res.json({
    user: {
      id: data.id,
      isBanned: data.is_banned === true,
      bannedAt: data.banned_at,
      bannedByUsername: data.banned_by_username,
      banReason: data.ban_reason,
    },
  });
});

const STATION_QUEUE_STATUSES = ['none', 'small', 'large'] as const;
const STATION_FUEL_KEYS = ['ai92', 'ai95', 'ai98', 'ai100', 'dt', 'lpg'] as const;

/**
 * stations.fuel_types is an object of optional prices, not a list of names, so the
 * payload is validated key by key. Anything non numeric is rejected rather than
 * silently dropped, otherwise a typo would quietly erase a price from the map.
 */
function sanitizeFuelPrices(input: unknown): Record<string, number> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;

  const prices: Record<string, number> = {};
  for (const key of STATION_FUEL_KEYS) {
    const raw = (input as Record<string, unknown>)[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const price = Number(raw);
    if (!Number.isFinite(price) || price < 0 || price > 100000) return null;
    prices[key] = price;
  }
  return Object.keys(prices).length > 0 ? prices : null;
}

/**
 * Validates station input. Coordinates are range checked and prices are restricted
 * to a known key set so a typo cannot poison the map or the fuel filters.
 */
function sanitizeStationInput(input: any) {
  if (!input || typeof input !== 'object') return null;

  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 160) : '';
  const brand = typeof input.brand === 'string' ? input.brand.trim().slice(0, 80) : '';
  const address = typeof input.address === 'string' ? input.address.trim().slice(0, 300) : '';
  const cityId = typeof input.cityId === 'string' ? input.cityId.trim() : '';
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);

  if (!name || !brand || !address) return null;
  if (!UUID_PATTERN.test(cityId)) return null;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;

  const fuelTypes = sanitizeFuelPrices(input.fuelTypes);
  if (!fuelTypes) return null;

  let queueStatus: string | null = null;
  if (input.queueStatus !== undefined && input.queueStatus !== null && input.queueStatus !== '') {
    const candidate = String(input.queueStatus).trim();
    if (!(STATION_QUEUE_STATUSES as readonly string[]).includes(candidate)) return null;
    queueStatus = candidate;
  }

  return { name, brand, address, cityId, latitude, longitude, fuelTypes, queueStatus };
}

function stationRowToDto(row: any) {
  return {
    id: row.id,
    cityId: row.city_id,
    name: row.name,
    brand: row.brand,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    fuelTypes: row.fuel_types && typeof row.fuel_types === 'object' ? row.fuel_types : {},
    queueStatus: row.queue_status,
    lastReportedAt: row.last_reported_at,
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Queue reports come from ordinary drivers, so this route is authenticated but not
// admin only, and it may only touch the queue fields. Everything else about a station
// stays behind /api/admin/stations.
app.post(
  '/api/stations/:stationId/queue',
  requireSameOrigin,
  requireTelegramAuth,
  userRateLimit(60, 60_000),
  async (req: Request, res: Response) => {
    if (!serverSupabase) return res.status(503).json({ error: 'База данных недоступна' });

    const stationId = req.params.stationId;
    if (!UUID_PATTERN.test(stationId)) {
      return res.status(400).json({ error: 'Некорректный идентификатор АЗС' });
    }

    const queueStatus = String(req.body?.queueStatus || '').trim();
    if (!(STATION_QUEUE_STATUSES as readonly string[]).includes(queueStatus)) {
      return res.status(400).json({ error: 'Некорректный статус очереди' });
    }

    const { data, error } = await serverSupabase
      .from('stations')
      .update({ queue_status: queueStatus, last_reported_at: new Date().toISOString() })
      .eq('id', stationId)
      .eq('is_active', true)
      .select('id, city_id, name, brand, latitude, longitude, address, fuel_types, queue_status, last_reported_at, is_active, created_at, updated_at')
      .maybeSingle();

    if (error) return res.status(500).json({ error: 'Не удалось отправить отчёт' });
    if (!data) return res.status(404).json({ error: 'АЗС не найдена' });

    return res.json({ station: stationRowToDto(data) });
  },
);

app.get('/api/admin/stations', requireTelegramAuth, requireStaffAdmin, async (_req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'База данных недоступна' });

  const { data, error } = await serverSupabase
    .from('stations')
    .select('id, city_id, name, brand, latitude, longitude, address, fuel_types, queue_status, last_reported_at, is_active, created_at, updated_at')
    .order('name', { ascending: true })
    .limit(1000);

  if (error) return res.status(500).json({ error: 'Не удалось загрузить АЗС' });
  res.json({ stations: (data || []).map(stationRowToDto) });
});

app.post('/api/admin/stations', requireTelegramAuth, userRateLimit(30, 60_000), requireStaffAdmin, async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'База данных недоступна' });

  const parsed = sanitizeStationInput(req.body);
  if (!parsed) return res.status(400).json({ error: 'Проверьте название, адрес, координаты и виды топлива' });

  const session = (req as any).telegramSession as TelegramSession;
  const { data, error } = await serverSupabase
    .from('stations')
    .insert({
      city_id: parsed.cityId,
      name: parsed.name,
      brand: parsed.brand,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      address: parsed.address,
      fuel_types: parsed.fuelTypes,
      queue_status: parsed.queueStatus,
      is_active: true,
      updated_by: session.tgId,
    })
    .select('id, city_id, name, brand, latitude, longitude, address, fuel_types, queue_status, last_reported_at, is_active, created_at, updated_at')
    .single();

  if (error) return res.status(500).json({ error: 'Не удалось создать АЗС' });

  const adminProfileId = await adminProfileIdFor(session);
  await logAdminAction(adminProfileId, 'station_create', 'station', data.id);
  res.status(201).json({ station: stationRowToDto(data) });
});

app.patch('/api/admin/stations/:stationId', requireTelegramAuth, userRateLimit(60, 60_000), requireStaffAdmin, async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'База данных недоступна' });

  const stationId = req.params.stationId;
  if (!UUID_PATTERN.test(stationId)) {
    return res.status(400).json({ error: 'Некорректный идентификатор АЗС' });
  }

  // The form submits the whole station, and it is validated by the same rules as
  // create. A PATCH cannot be used to smuggle in values POST would have rejected.
  const merged = { ...req.body };
  // The city is not part of the admin edit form, so it must not cause a valid edit
  // to be rejected when the caller does not resend it.
  if (merged.cityId === undefined || merged.cityId === null || merged.cityId === '') {
    const { data: existing } = await serverSupabase
      .from('stations')
      .select('city_id')
      .eq('id', stationId)
      .limit(1)
      .maybeSingle();
    merged.cityId = existing?.city_id;
  }
  const parsed = sanitizeStationInput(merged);
  if (!parsed) return res.status(400).json({ error: 'Проверьте название, адрес, координаты и виды топлива' });

  const session = (req as any).telegramSession as TelegramSession;
  const patch: Record<string, unknown> = {
    name: parsed.name,
    brand: parsed.brand,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    address: parsed.address,
    fuel_types: parsed.fuelTypes,
    updated_by: session.tgId,
  };
  if (req.body?.cityId !== undefined) patch.city_id = parsed.cityId;
  if (req.body?.queueStatus !== undefined) {
    patch.queue_status = parsed.queueStatus;
    patch.last_reported_at = parsed.queueStatus ? new Date().toISOString() : null;
  }
  if (req.body?.isActive !== undefined) patch.is_active = req.body.isActive === true;

  const { data, error } = await serverSupabase
    .from('stations')
    .update(patch)
    .eq('id', stationId)
    .select('id, city_id, name, brand, latitude, longitude, address, fuel_types, queue_status, last_reported_at, is_active, created_at, updated_at')
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'Не удалось сохранить АЗС' });
  if (!data) return res.status(404).json({ error: 'АЗС не найдена' });

  const adminProfileId = await adminProfileIdFor(session);
  await logAdminAction(adminProfileId, 'station_update', 'station', stationId);
  res.json({ station: stationRowToDto(data) });
});

// Stations are removed by deactivation, not by DELETE. A hard delete would orphan
// every queue report that already points at the row and lose the audit trail.
app.delete('/api/admin/stations/:stationId', requireTelegramAuth, userRateLimit(30, 60_000), requireStaffAdmin, async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'База данных недоступна' });

  const stationId = req.params.stationId;
  if (!UUID_PATTERN.test(stationId)) {
    return res.status(400).json({ error: 'Некорректный идентификатор АЗС' });
  }

  const session = (req as any).telegramSession as TelegramSession;
  const { data, error } = await serverSupabase
    .from('stations')
    .update({ is_active: false, updated_by: session.tgId })
    .eq('id', stationId)
    .eq('is_active', true)
    .select('id, city_id, name, brand, latitude, longitude, address, fuel_types, queue_status, last_reported_at, is_active, created_at, updated_at')
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'Не удалось скрыть АЗС' });
  if (!data) return res.status(404).json({ error: 'АЗС не найдена или уже скрыта' });

  const adminProfileId = await adminProfileIdFor(session);
  await logAdminAction(adminProfileId, 'station_deactivate', 'station', stationId);
  res.json({ station: stationRowToDto(data) });
});

app.post('/api/admin/events/:eventId/moderate', requireTelegramAuth, userRateLimit(60, 60_000), requireAdmin, async (req: Request, res: Response) => {
  const eventId = req.params.eventId;
  const action = req.body?.action;
  if (!eventIdIsValid(eventId) || !['hide', 'restore', 'resolve', 'delete'].includes(action)) {
    return res.status(400).json({ error: 'Некорректное действие' });
  }
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище не настроено' });
  const session = (req as any).telegramSession as TelegramSession;
  const adminProfileId = await resolveEventProfile(session).catch(() => null);
  const event = await loadEventForMutation(eventId);
  if (!event) return res.status(404).json({ error: 'Событие не найдено' });
  if (action === 'delete') {
    const result = await serverSupabase.from('events').delete().eq('id', eventId);
    if (result.error) return res.status(500).json({ error: 'Не удалось удалить событие' });
    await logAdminAction(adminProfileId, 'delete', 'event', eventId);
    return res.json({ success: true, eventId, action });
  }
  const status = action === 'hide' ? 'hidden' : action === 'restore' ? 'active' : 'resolved';
  const result = await serverSupabase.from('events').update({ status, updated_at: new Date().toISOString() }).eq('id', eventId).select('*').single();
  if (result.error || !result.data) return res.status(500).json({ error: 'Не удалось изменить событие' });
  await logAdminAction(adminProfileId, action, 'event', eventId);
  res.json({ success: true, event: result.data, action });
});

// --- STAFF MANAGEMENT (owner only) ---
// The owner is the root of trust and is not listed here: owners come from
// ROADLIVE_ADMIN_TELEGRAM_IDS and cannot be edited or revoked through the API.

app.get('/api/admin/staff', requireTelegramAuth, requireOwner, async (_req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище не настроено' });
  const { data, error } = await serverSupabase
    .from('telegram_admin_roles')
    .select('telegram_id, role, granted_by_username, note, created_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'Не удалось загрузить список сотрудников' });
  res.json({ staff: data || [] });
});

app.post('/api/admin/staff', requireTelegramAuth, userRateLimit(20, 60_000), requireOwner, async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище не настроено' });
  const session = (req as any).telegramSession as TelegramSession;

  const rawId = req.body?.telegramId;
  const telegramId = Number(rawId);
  const role = req.body?.role;
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0 || !['moderator', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Нужен корректный Telegram id и роль moderator или admin' });
  }
  // Privilege escalation guard: nobody can hand out the owner role, not even an admin.
  if (ROADLIVE_ADMIN_TELEGRAM_IDS.has(String(telegramId))) {
    return res.status(409).json({ error: 'Этот id уже настроен как владелец на сервере' });
  }

  const username = typeof req.body?.username === 'string' ? req.body.username.trim().slice(0, 100) : null;
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 200) : null;

  const { error } = await serverSupabase.from('telegram_admin_roles').upsert(
    { telegram_id: telegramId, role, granted_by: session.tgId, granted_by_username: session.user.username || null, note },
    { onConflict: 'telegram_id' },
  );
  if (error) return res.status(500).json({ error: 'Не удалось сохранить права' });

  staffRoleCache.delete(telegramId);
  await serverSupabase.from('admin_role_grants').insert({
    target_telegram_id: telegramId,
    target_username: username,
    action: 'grant',
    role,
    actor_telegram_id: session.tgId,
    actor_username: session.user.username || null,
  });
  res.status(201).json({ success: true, telegramId, role });
});

app.delete('/api/admin/staff/:telegramId', requireTelegramAuth, userRateLimit(20, 60_000), requireOwner, async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище не настроено' });
  const session = (req as any).telegramSession as TelegramSession;
  const telegramId = Number(req.params.telegramId);
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
    return res.status(400).json({ error: 'Некорректный Telegram id' });
  }
  // Defence in depth: the owner list wins even if the route is reached by mistake.
  if (ROADLIVE_ADMIN_TELEGRAM_IDS.has(String(telegramId))) {
    return res.status(403).json({ error: 'Владельца нельзя удалить, он настроен на сервере' });
  }

  const { data: current } = await serverSupabase
    .from('telegram_admin_roles')
    .select('role')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  const { error } = await serverSupabase.from('telegram_admin_roles').delete().eq('telegram_id', telegramId);
  if (error) return res.status(500).json({ error: 'Не удалось снять права' });

  staffRoleCache.delete(telegramId);
  await serverSupabase.from('admin_role_grants').insert({
    target_telegram_id: telegramId,
    action: 'revoke',
    role: current?.role || null,
    actor_telegram_id: session.tgId,
    actor_username: session.user.username || null,
  });
  res.json({ success: true, telegramId });
});

// --- SPONSORED ADS ---
// Banners used to live in a browser localStorage sandbox, which meant a campaign
// created by the owner was visible only in the browser that created it. They are
// now shared server data: everyone reads them through a public read-only endpoint,
// while every write stays behind owner-only routes.

const AD_COLUMNS =
  'id, title, subtitle, category_badge, icon, custom_icon_id, custom_logo_url, banner_color, address, latitude, longitude, phone, promo_code, discount_text, action_text, details, is_active, priority, starts_at, ends_at, impressions, clicks';

const AD_ICON_COLUMNS = 'id, name, category, svg_content, created_at';

function cleanAdText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/**
 * Strips the parts of an uploaded SVG that can carry script.
 * Owner input is still untrusted input: the markup is rendered on every device.
 */
function sanitizeSvgMarkup(value: unknown): { error?: string; value?: string } {
  const raw = typeof value === 'string' ? value.trim().slice(0, 20000) : '';
  if (!raw.includes('<svg')) return { error: 'Нужна корректная SVG-разметка' };
  const cleaned = raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
  if (!cleaned.includes('<svg')) return { error: 'SVG не прошёл проверку безопасности' };
  return { value: cleaned };
}

function normalizeAd(row: any) {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle || '',
    categoryBadge: row.category_badge || '',
    icon: row.icon || '',
    customIconId: row.custom_icon_id || undefined,
    customLogoUrl: row.custom_logo_url || undefined,
    bannerColor: row.banner_color || undefined,
    address: row.address || '',
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    phone: row.phone || undefined,
    promoCode: row.promo_code || undefined,
    discountText: row.discount_text || undefined,
    actionText: row.action_text || 'Маршрут',
    details: row.details || '',
    isActive: row.is_active !== false,
    impressions: Number(row.impressions || 0),
    clicks: Number(row.clicks || 0),
    priority: Number(row.priority || 0),
    startsAt: row.starts_at || undefined,
    endsAt: row.ends_at || undefined,
  };
}

function normalizeAdIcon(row: any) {
  return {
    id: row.id,
    name: row.name,
    category: row.category || 'Пользовательские',
    svgContent: row.svg_content,
    createdAt: row.created_at,
  };
}

/**
 * Builds a column set for insert or partial update. In partial mode only the keys
 * actually present in the request are touched, so the owner can toggle a banner
 * without resending every field.
 */
function buildAdColumns(body: any, partial: boolean): { error?: string; value?: Record<string, unknown> } {
  const value: Record<string, unknown> = {};
  const wants = (key: string) => !partial || body?.[key] !== undefined;

  if (wants('title')) {
    const title = cleanAdText(body?.title, 200);
    if (!title) return { error: 'Нужно название кампании' };
    value.title = title;
  }
  if (wants('latitude')) {
    const latitude = Number(body?.latitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return { error: 'Некорректная широта' };
    value.latitude = latitude;
  }
  if (wants('longitude')) {
    const longitude = Number(body?.longitude);
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return { error: 'Некорректная долгота' };
    value.longitude = longitude;
  }
  if (wants('subtitle')) value.subtitle = cleanAdText(body?.subtitle, 300);
  if (wants('categoryBadge')) value.category_badge = cleanAdText(body?.categoryBadge, 60) || null;
  if (wants('icon')) value.icon = cleanAdText(body?.icon, 16) || null;
  if (wants('bannerColor')) value.banner_color = cleanAdText(body?.bannerColor, 32) || null;
  if (wants('address')) value.address = cleanAdText(body?.address, 300);
  if (wants('phone')) value.phone = cleanAdText(body?.phone, 60) || null;
  if (wants('promoCode')) value.promo_code = cleanAdText(body?.promoCode, 80) || null;
  if (wants('discountText')) value.discount_text = cleanAdText(body?.discountText, 120) || null;
  if (wants('actionText')) value.action_text = cleanAdText(body?.actionText, 60) || 'Маршрут';
  if (wants('details')) value.details = typeof body?.details === 'string' ? body.details.slice(0, 2000) : null;
  if (wants('customLogoUrl')) {
    const logo = cleanAdText(body?.customLogoUrl, 500);
    if (logo && !/^https:\/\//i.test(logo)) return { error: 'Логотип должен грузиться по HTTPS' };
    value.custom_logo_url = logo || null;
  }
  if (wants('customIconId')) {
    const iconId = body?.customIconId;
    // An omitted field means "no custom icon". Only a value that is actually present
    // and malformed is an error, otherwise clients that leave it out cannot create ads.
    if (iconId === undefined || iconId === null || iconId === '') {
      value.custom_icon_id = null;
    } else if (typeof iconId === 'string' && UUID_PATTERN.test(iconId)) {
      value.custom_icon_id = iconId;
    } else {
      return { error: 'Некорректный идентификатор иконки' };
    }
  }
  if (wants('isActive')) value.is_active = body?.isActive !== false;
  if (wants('priority')) {
    const priority = Number(body?.priority || 0);
    value.priority = Number.isFinite(priority) ? Math.trunc(priority) : 0;
  }
  if (wants('startsAt')) value.starts_at = body?.startsAt || null;
  if (wants('endsAt')) value.ends_at = body?.endsAt || null;

  return { value };
}

// Public read: only banners that are active and inside their schedule window.
app.get('/api/ads', rateLimit(120, 60_000), async (_req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище не настроено' });
  const now = new Date().toISOString();
  const [adsResult, iconsResult, configResult] = await Promise.all([
    serverSupabase
      .from('sponsored_ads')
      .select(AD_COLUMNS)
      .eq('is_active', true)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false }),
    serverSupabase.from('ad_custom_icons').select(AD_ICON_COLUMNS).order('created_at', { ascending: false }),
    serverSupabase.from('ad_display_config').select('interval_seconds, auto_dismiss_seconds, enabled').eq('id', 1).maybeSingle(),
  ]);

  if (adsResult.error) return res.status(500).json({ error: 'Не удалось загрузить рекламу' });

  const config = configResult.data;
  res.json({
    ads: (adsResult.data || []).map(normalizeAd),
    icons: (iconsResult.data || []).map(normalizeAdIcon),
    config: {
      intervalSeconds: Number(config?.interval_seconds || 900),
      autoDismissSeconds: Number(config?.auto_dismiss_seconds || 30),
      enabled: config?.enabled !== false,
    },
  });
});

// Owner read: everything, including paused banners and delivery counters.
app.get('/api/admin/ads', requireTelegramAuth, requireOwner, async (_req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище не настроено' });
  const [adsResult, iconsResult, configResult] = await Promise.all([
    serverSupabase.from('sponsored_ads').select(AD_COLUMNS).order('priority', { ascending: false }).order('created_at', { ascending: false }),
    serverSupabase.from('ad_custom_icons').select(AD_ICON_COLUMNS).order('created_at', { ascending: false }),
    serverSupabase.from('ad_display_config').select('interval_seconds, auto_dismiss_seconds, enabled').eq('id', 1).maybeSingle(),
  ]);
  if (adsResult.error) return res.status(500).json({ error: 'Не удалось загрузить кампании' });
  const config = configResult.data;
  res.json({
    ads: (adsResult.data || []).map(normalizeAd),
    icons: (iconsResult.data || []).map(normalizeAdIcon),
    config: {
      intervalSeconds: Number(config?.interval_seconds || 900),
      autoDismissSeconds: Number(config?.auto_dismiss_seconds || 30),
      enabled: config?.enabled !== false,
    },
  });
});

app.post('/api/admin/ads', requireTelegramAuth, userRateLimit(30, 60_000), requireOwner, async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище не настроено' });
  const session = (req as any).telegramSession as TelegramSession;
  const built = buildAdColumns(req.body, false);
  if (built.error || !built.value) return res.status(400).json({ error: built.error || 'Некорректные данные кампании' });

  const { data, error } = await serverSupabase
    .from('sponsored_ads')
    .insert({ ...built.value, created_by: session.tgId })
    .select(AD_COLUMNS)
    .single();
  if (error) return res.status(500).json({ error: 'Не удалось создать кампанию' });
  res.status(201).json({ success: true, ad: normalizeAd(data) });
});

app.patch('/api/admin/ads/:adId', requireTelegramAuth, userRateLimit(30, 60_000), requireOwner, async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище не настроено' });
  if (!UUID_PATTERN.test(req.params.adId)) return res.status(400).json({ error: 'Некорректный идентификатор кампании' });
  const built = buildAdColumns(req.body, true);
  if (built.error || !built.value) return res.status(400).json({ error: built.error || 'Некорректные данные кампании' });

  const { data, error } = await serverSupabase
    .from('sponsored_ads')
    .update(built.value)
    .eq('id', req.params.adId)
    .select(AD_COLUMNS)
    .maybeSingle();
  if (error) return res.status(500).json({ error: 'Не удалось сохранить кампанию' });
  if (!data) return res.status(404).json({ error: 'Кампания не найдена' });
  res.json({ success: true, ad: normalizeAd(data) });
});

app.delete('/api/admin/ads/:adId', requireTelegramAuth, userRateLimit(30, 60_000), requireOwner, async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище не настроено' });
  if (!UUID_PATTERN.test(req.params.adId)) return res.status(400).json({ error: 'Некорректный идентификатор кампании' });
  const { error } = await serverSupabase.from('sponsored_ads').delete().eq('id', req.params.adId);
  if (error) return res.status(500).json({ error: 'Не удалось удалить кампанию' });
  res.json({ success: true });
});

// Impression/click counters require a real session so that delivery numbers
// cannot be inflated by a script that has no Telegram account.
app.post('/api/ads/:adId/stat', rateLimit(120, 60_000), requireTelegramAuth, async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище не настроено' });
  if (!UUID_PATTERN.test(req.params.adId)) return res.status(400).json({ error: 'Некорректный идентификатор кампании' });
  const field = req.body?.event === 'click' ? 'clicks' : req.body?.event === 'impression' ? 'impressions' : null;
  if (!field) return res.status(400).json({ error: 'Нужен event: impression или click' });

  const { data, error } = await serverSupabase.rpc('increment_ad_stat', {
    p_ad_id: req.params.adId,
    p_field: field,
  });
  if (error) return res.status(500).json({ error: 'Не удалось обновить статистику' });
  res.json({ success: true, field, value: data });
});

app.post('/api/admin/ad-icons', requireTelegramAuth, userRateLimit(30, 60_000), requireOwner, async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище не настроено' });
  const name = cleanAdText(req.body?.name, 100);
  if (!name) return res.status(400).json({ error: 'Нужно название иконки' });
  const svg = sanitizeSvgMarkup(req.body?.svgContent);
  if (svg.error) return res.status(400).json({ error: svg.error });

  const { data, error } = await serverSupabase
    .from('ad_custom_icons')
    .insert({ name, category: cleanAdText(req.body?.category, 100) || 'Пользовательские', svg_content: svg.value })
    .select(AD_ICON_COLUMNS)
    .single();
  if (error) return res.status(500).json({ error: 'Не удалось сохранить иконку' });
  res.status(201).json({ success: true, icon: normalizeAdIcon(data) });
});

app.delete('/api/admin/ad-icons/:iconId', requireTelegramAuth, userRateLimit(30, 60_000), requireOwner, async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище не настроено' });
  if (!UUID_PATTERN.test(req.params.iconId)) return res.status(400).json({ error: 'Некорректный идентификатор иконки' });
  // Banners keep rendering with their emoji fallback: the column is ON DELETE SET NULL.
  const { error } = await serverSupabase.from('ad_custom_icons').delete().eq('id', req.params.iconId);
  if (error) return res.status(500).json({ error: 'Не удалось удалить иконку' });
  res.json({ success: true });
});

app.put('/api/admin/ad-config', requireTelegramAuth, userRateLimit(30, 60_000), requireOwner, async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище не настроено' });
  const intervalSeconds = Number(req.body?.intervalSeconds);
  const autoDismissSeconds = Number(req.body?.autoDismissSeconds);
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 30 || intervalSeconds > 86400) {
    return res.status(400).json({ error: 'Интервал показа должен быть от 30 секунд до 24 часов' });
  }
  if (!Number.isInteger(autoDismissSeconds) || autoDismissSeconds < 5 || autoDismissSeconds > 600) {
    return res.status(400).json({ error: 'Автозакрытие должно быть от 5 до 600 секунд' });
  }

  const { error } = await serverSupabase.from('ad_display_config').upsert(
    { id: 1, interval_seconds: intervalSeconds, auto_dismiss_seconds: autoDismissSeconds, enabled: req.body?.enabled !== false },
    { onConflict: 'id' },
  );
  if (error) return res.status(500).json({ error: 'Не удалось сохранить настройки показа' });
  res.json({ success: true, config: { intervalSeconds, autoDismissSeconds, enabled: req.body?.enabled !== false } });
});

// --- MANDATORY CHANNEL SUBSCRIPTION: OWNER ADMINISTRATION ---

// Current gate configuration plus a live probe whether the bot can verify
// membership for this channel (getChatMember succeeds only when the bot itself
// is in the channel with at least admin rights).
app.get('/api/admin/channel-subscription', requireTelegramAuth, requireOwner, async (req: Request, res: Response) => {
  const config = await resolveChannelGate();
  const session = (req as any).telegramSession as TelegramSession;
  let probe: { accessible: boolean; detail?: string } | null = null;
  if (config) {
    const result = await rawChannelMembership(config.chatId, session.tgId);
    probe = { accessible: !result.error, detail: result.error || undefined };
  }
  res.json({ config, probe });
});

function parseChannelInput(link: string, chatId: string): { chatId: string; username?: string; link: string; error?: string } {
  const trimmedLink = (link || '').trim();
  const trimmedId = (chatId || '').trim();

  if (!trimmedLink) return { chatId: '', link: '', error: 'Укажите ссылку на канал: например https://t.me/roadlive_news' };

  const isUrl = /^https?:\/\//.test(trimmedLink);
  const bareUsername = isUrl ? '' : trimmedLink.replace(/^@/, '');
  const normalizedLink = isUrl
    ? trimmedLink
    : /^[A-Za-z0-9_]{4,32}$/.test(bareUsername)
      ? `https://t.me/${bareUsername}`
      : trimmedLink;

  const isInvite = normalizedLink.includes('t.me/+') || normalizedLink.includes('t.me/joinchat');
  const usernameMatch = normalizedLink.match(/^https:\/\/t\.me\/([A-Za-z0-9_]{4,32})$/);

  let resolvedId = trimmedId;
  let username: string | undefined;
  if (usernameMatch && !isInvite) {
    username = usernameMatch[1];
    if (!resolvedId) resolvedId = `@${username}`;
  }

  const cleanId = resolvedId;
  if (!cleanId) {
    return {
      chatId: '',
      username,
      link: normalizedLink,
      error: isInvite
        ? 'Для приватного канала укажите ещё и ID канала (начинается с -100), по ссылке-приглашению проверять подписку нельзя'
        : 'Не удалось распознать канал. Укажите ссылку вида https://t.me/имя_канала или ID канала (-100...)',
    };
  }

  const idValid = /^@[A-Za-z0-9_]{4,32}$/.test(cleanId) || /^-100\d+$/.test(cleanId);
  if (!idValid) {
    return { chatId: '', username, link: normalizedLink, error: 'ID канала не похож на Telegram: укажите @username или -100...' };
  }

  return { chatId: cleanId, username, link: normalizedLink };
}

app.put('/api/admin/channel-subscription', requireTelegramAuth, requireOwner, userRateLimit(20, 60_000), async (req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище не настроено' });
  const parsed = parseChannelInput(String(req.body?.link || ''), String(req.body?.chatId || ''));
  if (parsed.error || !parsed.chatId || !parsed.link) {
    return res.status(400).json({ error: parsed.error || 'Некорректные данные канала' });
  }

  const { error } = await serverSupabase.from('channel_gate_config').upsert(
    {
      id: 1,
      chat_id: parsed.chatId,
      username: parsed.username || null,
      link: parsed.link,
      enabled: true,
    },
    { onConflict: 'id' },
  );
  if (error) {
    console.warn('[Gate] channel config save failed:', error.message);
    return res.status(500).json({ error: 'Не удалось сохранить настройки канала' });
  }
  clearGateCache();

  const session = (req as any).telegramSession as TelegramSession;
  const result = await rawChannelMembership(parsed.chatId, session.tgId);
  res.json({
    success: true,
    config: { chatId: parsed.chatId, username: parsed.username || null, link: parsed.link },
    probe: { accessible: !result.error, detail: result.error || undefined },
  });
});

app.delete('/api/admin/channel-subscription', requireTelegramAuth, requireOwner, userRateLimit(10, 60_000), async (_req: Request, res: Response) => {
  if (!serverSupabase) return res.status(503).json({ error: 'Серверное хранилище не настроено' });
  await serverSupabase.from('channel_gate_config').delete().eq('id', 1);
  clearGateCache();
  res.json({ success: true });
});

// Sets the bot's chat menu button (opens the Mini App) and its command list so
// that a fresh user has a visible "Open the map" entry right in the chat.
app.post('/api/admin/bot/menu-button', requireTelegramAuth, requireOwner, userRateLimit(10, 60_000), async (req: Request, res: Response) => {
  if (!TELEGRAM_API_BASE) return res.status(503).json({ error: 'Telegram Bot API не настроен' });
  const rawOrigin = req.header('origin') || '';
  const origin = typeof rawOrigin === 'string' ? rawOrigin : '';
  const appUrl = /^https:\/\/.+/.test(origin) ? origin : process.env.APP_URL || 'https://roadlive.vercel.app';
  const results: Record<string, boolean> = {};

  try {
    const menuResp = await fetch(`${TELEGRAM_API_BASE}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_button: {
          type: 'web_app',
          text: 'Открыть карту',
          web_app: { url: appUrl },
        },
      }),
    });
    results.menuButton = menuResp.ok;
  } catch {
    results.menuButton = false;
  }

  try {
    const commandsResp = await fetch(`${TELEGRAM_API_BASE}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'start', description: 'Открыть карту ROADLIVE' },
          { command: 'help', description: 'Помощь по сервису' },
        ],
      }),
    });
    results.commands = commandsResp.ok;
  } catch {
    results.commands = false;
  }

  res.json({ success: results.menuButton && results.commands, results, appUrl });
});

// --- DRIVER RADIO / CHAT API & REAL-TIME WEBSOCKET ---
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
  if (!serverSupabase) throw new Error('Server storage is not configured');
  {
    let query = serverSupabase
      .from('chat_messages')
      .select('external_id,channel_id,user_id,telegram_user_id,author_name,content,created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    if (channelId) query = query.eq('channel_id', channelId);
    const { data, error } = await query;
    if (error) throw new Error(`Chat storage read failed: ${error.message}`);
    return (data || []).reverse().map(normalizeChatMessage);
  }
}

async function persistChatMessage(message: any, session: TelegramSession): Promise<boolean> {
  if (!serverSupabase) throw new Error('Server storage is not configured');
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
  if (error) throw new Error(`Chat storage write failed: ${error.message}`);
  return true;
}

async function persistChatReaction(messageId: string, emoji: string, telegramUserId: number): Promise<boolean> {
  if (!serverSupabase) throw new Error('Server storage is not configured');
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
  if (error) throw new Error(`Chat reaction persistence failed: ${error.message}`);
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
    id: message.id,
    channelId: message.channelId,
    userId: session.userId,
    authorName: [session.user.first_name, session.user.last_name].filter(Boolean).join(' ').slice(0, 100) || 'Водитель',
    content: message.content.trim(),
    createdAt: new Date().toISOString(),
  };
  try {
    await persistChatMessage(normalized, session);
  } catch (error: any) {
    return res.status(503).json({ error: error?.message || 'Не удалось сохранить сообщение' });
  }

  broadcastToChatClients({ type: 'CHAT_MESSAGE', message: normalized });
  res.json({ success: true, message: normalized, persistent: true });
});

app.post('/api/chat/reaction', rateLimit(120, 60_000), requireTelegramAuth, async (req: Request, res: Response) => {
  const { messageId, emoji } = req.body;
  const session = (req as any).telegramSession as TelegramSession;
  if (typeof messageId !== 'string' || messageId.length > 100 || typeof emoji !== 'string' || [...emoji].length > 16) {
    return res.status(400).json({ error: 'Недопустимая реакция' });
  }

  try {
    await persistChatReaction(messageId, emoji, session.tgId);
  } catch (error: any) {
    return res.status(503).json({ error: error?.message || 'Не удалось сохранить реакцию' });
  }

  broadcastToChatClients({ type: 'CHAT_REACTION', messageId, emoji });
  res.json({ success: true, persistent: true });
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
  if (isProd && !serverSupabase) {
    throw new Error('ROADLIVE production startup aborted: Supabase persistence is required');
  }
  await ensureSubscriptionsLoaded();
  const httpServer = http.createServer(app);

  // Setup WebSocket Server for Live Driver Chat
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/chat',
    maxPayload: 16 * 1024,
    verifyClient: (info, callback) => {
      if (isProd) {
        const origin = info.origin || '';
        const host = info.req.headers.host || '';
        if (origin) {
          try {
            if (new URL(origin).host !== host) {
              callback(false, 403, 'Forbidden');
              return;
            }
          } catch {
            callback(false, 403, 'Forbidden');
            return;
          }
        }
      }
      callback(true);
    },
  });

  wss.on('connection', (ws) => {
    let authenticated = false;
    let authenticatedUserId: string | null = null;
    let session: TelegramSession | null = null;
    let messageCount = 0;
    let windowStartedAt = Date.now();
    const authTimeout = setTimeout(() => {
      if (!authenticated && ws.readyState === WsClient.OPEN) {
        ws.close(1008, 'Authentication required');
      }
    }, 5_000);

    ws.on('error', (err) => console.warn('[WS Chat] Socket error:', err));

    ws.on('message', (raw) => {
      void (async () => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === 'AUTH' && typeof data.token === 'string') {
          if (authenticated) {
            ws.close(1008, 'Already authenticated');
            return;
          }
          const verifiedSession = verifySessionToken(data.token);
          if (!verifiedSession) {
            ws.close(1008, 'Unauthorized');
            return;
          }
          session = verifiedSession;
          authenticated = true;
          authenticatedUserId = verifiedSession.userId;
          clearTimeout(authTimeout);
          setTimeout(() => {
            if (ws.readyState === WsClient.OPEN) ws.close(1000, 'Session expired');
          }, Math.max(1, verifiedSession.exp - Math.floor(Date.now() / 1000)) * 1000);
          connectedWsClients.add(ws);
          ws.send(JSON.stringify({ type: 'AUTH_OK', userId: verifiedSession.userId, expiresAt: verifiedSession.exp }));
          console.log(`[WS Chat] Driver connected (online: ${connectedWsClients.size})`);
          return;
        }

        if (!authenticated || !session) return;

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

          const normalized = {
            id: msg.id,
            channelId: msg.channelId,
            userId: authenticatedUserId,
            authorName: [session.user.first_name, session.user.last_name].filter(Boolean).join(' ').slice(0, 100) || 'Водитель',
            content: msg.content.trim(),
            createdAt: new Date().toISOString(),
          };
          await persistChatMessage(normalized, session);
          broadcastToChatClients({ type: 'CHAT_MESSAGE', message: normalized });
        } else if (data.type === 'ADD_REACTION' && typeof data.messageId === 'string' && data.messageId.length <= 100 &&
                   typeof data.emoji === 'string' && [...data.emoji].length <= 16) {
          await persistChatReaction(data.messageId, data.emoji, session.tgId);
          broadcastToChatClients({
            type: 'CHAT_REACTION',
            messageId: data.messageId,
            emoji: data.emoji,
          });
        }
      } catch (err) {
        console.error('[WS Chat] Parse error:', err);
      }
      })();
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (authenticated) connectedWsClients.delete(ws);
      console.log(`[WS Chat] Driver disconnected (online: ${connectedWsClients.size})`);
    });
  });

  if (!isProd) {
    // Loaded lazily: vite is a devDependency, so a production image built with
    // `npm ci --omit=dev` must never resolve it at startup.
    const { createServer: createViteServer } = await import('vite');
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

// On Vercel this module is imported as a serverless function, where static files are
// served by the CDN and there is no long-lived socket to attach a WebSocket server to.
// Attaching wss and calling listen() there would fail, so both only happen locally.
if (!process.env.VERCEL) {
  startServer();
}

export default app;
