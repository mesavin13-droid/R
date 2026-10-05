import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket as WsClient } from 'ws';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import webpush from 'web-push';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

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

function loadSubscriptions() {
  try {
    if (fs.existsSync(SUBS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf-8'));
      subscriptions = new Map(Object.entries(data));
      console.log(`Loaded ${subscriptions.size} push subscriptions from disk.`);
    }
  } catch (err) {
    console.warn('Could not read subscriptions file, starting empty.', err);
  }
}

function saveSubscriptions() {
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

loadSubscriptions();

// --- TELEGRAM SERVER AUTHENTICATION ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
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
    const session: TelegramSession = {
      tgId: user.id,
      userId: `tg-${user.id}`,
      iat: now,
      exp: now + TELEGRAM_SESSION_TTL_SECONDS,
    };

    return res.json({
      authenticated: true,
      sessionToken: encodeSession(session),
      expiresAt: session.exp,
      user,
    });
  } catch (error: any) {
    return res.status(401).json({ error: error?.message || 'Telegram authentication failed' });
  }
});

// --- API ROUTES ---

// 1. Get VAPID Public Key
app.get('/api/push/public-key', (_req: Request, res: Response) => {
  res.json({
    publicKey: VAPID_PUBLIC_KEY,
    configured: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
  });
});

// 2. Get Push Status & Subscribers Count
app.get('/api/push/status', rateLimit(60, 60_000), (_req: Request, res: Response) => {
  res.json({
    configured: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
    subscribersCount: subscriptions.size,
  });
});

// 3. Register or Update Push Subscription
app.post('/api/push/subscribe', rateLimit(30, 60_000), requireTelegramAuth, (req: Request, res: Response) => {
  const { subscription, districtId } = req.body;
  const userId = (req as any).telegramSession.userId;

  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'Неверный формат подписки Web Push' });
  }

  const endpoint = subscription.endpoint;
  subscriptions.set(endpoint, {
    subscription,
    userId,
    districtId,
    createdAt: new Date().toISOString(),
  });

  saveSubscriptions();
  console.log(`[Push] Registered subscriber (total: ${subscriptions.size})`);

  res.json({
    success: true,
    message: 'Успешно подписан на критические уведомления ROADLIVE',
    subscribersCount: subscriptions.size,
  });
});

// 4. Unsubscribe
app.post('/api/push/unsubscribe', rateLimit(30, 60_000), requireTelegramAuth, (req: Request, res: Response) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint обязателен' });
  }

  const current = subscriptions.get(endpoint);
  if (current && current.userId && current.userId !== (req as any).telegramSession.userId) {
    return res.status(403).json({ error: 'Эта push-подписка принадлежит другому пользователю' });
  }

  const deleted = subscriptions.delete(endpoint);
  if (deleted) {
    saveSubscriptions();
    console.log(`[Push] Unsubscribed (remaining: ${subscriptions.size})`);
  }

  res.json({ success: true, deleted, subscribersCount: subscriptions.size });
});

// 5. Broadcast Critical Road Event
app.post('/api/push/broadcast-critical', rateLimit(10, 60_000), requireTelegramAuth, async (req: Request, res: Response) => {
  const { event } = req.body;

  if (!event || !event.title) {
    return res.status(400).json({ error: 'Данные события не переданы' });
  }
  if (event.userId && event.userId !== (req as any).telegramSession.userId) {
    return res.status(403).json({ error: 'Нельзя отправлять push от имени другого пользователя' });
  }

  // Determine criticality
  const isCritical =
    event.isCritical ||
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
app.post('/api/push/test', rateLimit(5, 60_000), requireTelegramAuth, async (req: Request, res: Response) => {
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

// --- DRIVER RADIO / CHAT API & REAL-TIME WEBSOCKET ---
let chatMessages: any[] = [];

app.get('/api/chat/messages', requireTelegramAuth, (req: Request, res: Response) => {
  const channelId = req.query.channelId as string;
  if (channelId) {
    return res.json(chatMessages.filter((m) => m.channelId === channelId));
  }
  res.json(chatMessages);
});

app.post('/api/chat/messages', rateLimit(60, 60_000), requireTelegramAuth, (req: Request, res: Response) => {
  const { message } = req.body;
  if (!message || !message.content) {
    return res.status(400).json({ error: 'Сообщение пустое' });
  }
  if (message.userId !== (req as any).telegramSession.userId) {
    return res.status(403).json({ error: 'Нельзя отправлять сообщение от имени другого пользователя' });
  }

  // Idempotency: skip if already present
  if (!chatMessages.some((m) => m.id === message.id)) {
    chatMessages.push(message);
    if (chatMessages.length > 500) {
      chatMessages = chatMessages.slice(-500);
    }
  }

  // Broadcast to WS clients
  broadcastToChatClients({
    type: 'CHAT_MESSAGE',
    message,
  });

  res.json({ success: true, message });
});

app.post('/api/chat/reaction', rateLimit(120, 60_000), requireTelegramAuth, (req: Request, res: Response) => {
  const { messageId, emoji } = req.body;
  const target = chatMessages.find((m) => m.id === messageId);
  if (target) {
    target.reactions = target.reactions || {};
    target.reactions[emoji] = (target.reactions[emoji] || 0) + 1;
    broadcastToChatClients({
      type: 'CHAT_REACTION',
      messageId,
      emoji,
    });
  }
  res.json({ success: true });
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
  const httpServer = http.createServer(app);

  // Setup WebSocket Server for Live Driver Chat
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/chat', maxPayload: 16 * 1024 });

  wss.on('connection', (ws) => {
    let authenticated = false;
    let authenticatedUserId: string | null = null;
    ws.on('error', (err) => console.warn('[WS Chat] Socket error:', err));
    console.log(`[WS Chat] Driver connected (online: ${connectedWsClients.size})`);

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === 'AUTH' && typeof data.token === 'string') {
          const session = verifySessionToken(data.token);
          if (!session) {
            ws.close(1008, 'Unauthorized');
            return;
          }
          authenticated = true;
          authenticatedUserId = session.userId;
          connectedWsClients.add(ws);
          ws.send(JSON.stringify({ type: 'AUTH_OK', userId: session.userId, expiresAt: session.exp }));
          console.log(`[WS Chat] Driver connected (online: ${connectedWsClients.size})`);
          return;
        }

        if (!authenticated) return;

        if (data.type === 'SEND_MESSAGE' && data.message) {
          const msg = data.message;
          if (msg.userId !== authenticatedUserId) return;
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
        } else if (data.type === 'ADD_REACTION' && data.messageId) {
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
