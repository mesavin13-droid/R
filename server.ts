import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket as WsClient } from 'ws';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
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
app.post('/api/push/subscribe', rateLimit(30, 60_000), (req: Request, res: Response) => {
  const { subscription, userId, districtId } = req.body;

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
app.post('/api/push/unsubscribe', rateLimit(30, 60_000), (req: Request, res: Response) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint обязателен' });
  }

  const deleted = subscriptions.delete(endpoint);
  if (deleted) {
    saveSubscriptions();
    console.log(`[Push] Unsubscribed (remaining: ${subscriptions.size})`);
  }

  res.json({ success: true, deleted, subscribersCount: subscriptions.size });
});

// 5. Broadcast Critical Road Event
app.post('/api/push/broadcast-critical', rateLimit(10, 60_000), async (req: Request, res: Response) => {
  const { event } = req.body;

  if (!event || !event.title) {
    return res.status(400).json({ error: 'Данные события не переданы' });
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
app.post('/api/push/test', rateLimit(5, 60_000), async (req: Request, res: Response) => {
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
    try {
      await webpush.sendNotification(item.subscription, testPayload);
      return res.json({ success: true, message: 'Тестовый пуш отправлен на ваше устройство' });
    } catch (err: any) {
      return res.status(500).json({ error: `Ошибка отправки: ${err.message}` });
    }
  }

  // Send to all subscribers if no specific endpoint given
  const endpoints = Array.from(subscriptions.keys());
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

app.get('/api/chat/messages', (req: Request, res: Response) => {
  const channelId = req.query.channelId as string;
  if (channelId) {
    return res.json(chatMessages.filter((m) => m.channelId === channelId));
  }
  res.json(chatMessages);
});

app.post('/api/chat/messages', rateLimit(60, 60_000), (req: Request, res: Response) => {
  const { message } = req.body;
  if (!message || !message.content) {
    return res.status(400).json({ error: 'Сообщение пустое' });
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

app.post('/api/chat/reaction', rateLimit(120, 60_000), (req: Request, res: Response) => {
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
    ws.on('error', (err) => console.warn('[WS Chat] Socket error:', err));
    connectedWsClients.add(ws);
    console.log(`[WS Chat] Driver connected (online: ${connectedWsClients.size})`);

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === 'SEND_MESSAGE' && data.message) {
          const msg = data.message;
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
      connectedWsClients.delete(ws);
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
