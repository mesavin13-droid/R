import { ChatChannel, ChatMessage, UserProfile } from '../types';
import { CHAT_CHANNELS } from '../data/chatData';
import { localRealtime } from '../lib/supabase';
import { TelegramService } from './telegramService';

const CHAT_STORAGE_KEY_PREFIX = 'roadlive_chat_messages_v3';

function getChatStorageKey(): string {
  const identity = TelegramService.getCachedAuthoritativeIdentity();
  return identity?.userId ? `${CHAT_STORAGE_KEY_PREFIX}:${identity.userId}` : `${CHAT_STORAGE_KEY_PREFIX}:anon`;
}

export class ChatService {
  private static messages: ChatMessage[] = [];
  private static socket: WebSocket | null = null;
  private static listeners: Array<(msg: ChatMessage) => void> = [];
  private static channelListeners: Array<(channelId: string) => void> = [];
  private static isConnecting = false;
  private static reconnectTimer: any = null;
  private static reconnectAttempts = 0;

  static initialize(): void {
    if (this.messages.length > 0) return;

    try {
      const stored = localStorage.getItem(getChatStorageKey());
      this.messages = stored ? JSON.parse(stored) : [];
    } catch {
      this.messages = [];
    }

    this.connectWebSocket();
  }

  private static persist(): void {
    try {
      localStorage.setItem(getChatStorageKey(), JSON.stringify(this.messages.slice(0, 300)));
    } catch (e) {
      console.warn('Storage quota exceeded for chat', e);
    }
  }

  static getChannels(): ChatChannel[] {
    return CHAT_CHANNELS;
  }
  static async refreshFromServer(channelId?: string): Promise<void> {
    if (!TelegramService.isTelegramWebApp() || !TelegramService.getCachedAuthoritativeIdentity()) return;
    try {
      const url = channelId ? '/api/chat/messages?channelId=' + encodeURIComponent(channelId) : '/api/chat/messages';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) return;
      const rows = await response.json();
      if (!Array.isArray(rows)) return;

      // Merge instead of overwriting: only append genuinely new messages and
      // update reaction counts on ones we already have. Overwriting the whole
      // array every poll made the chat list flicker and re-trigger listeners
      // constantly (which read like the screen "reloading"). Merging keeps the
      // UI stable and only notifies when something actually changed.
      let changed = false;
      for (const row of rows) {
        if (!row || typeof row.id !== 'string') continue;
        const existing = this.messages.find((m) => m.id === row.id);
        if (!existing) {
          this.messages.push(row);
          changed = true;
        } else if (JSON.stringify(existing.reactions || {}) !== JSON.stringify(row.reactions || {})) {
          existing.reactions = row.reactions || {};
          changed = true;
        }
      }

      if (!changed) return;

      this.messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      this.persist();
      this.listeners.forEach((fn) => fn(rows[rows.length - 1]));
    } catch (err) {
      console.warn('[Chat] Server refresh failed:', err);
    }
  }


  static getMessages(channelId: string): ChatMessage[] {
    this.initialize();
    return this.messages.filter((m) => m.channelId === channelId);
  }

  static async connectWebSocket(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (this.isConnecting) return;

    const sessionToken = await TelegramService.getWsToken();
    if (!sessionToken) return;

    this.isConnecting = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/chat`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        ws.send(JSON.stringify({ type: 'AUTH', token: sessionToken }));
        console.log('[Chat WS] Connected to live driver radio');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'CHAT_MESSAGE' && data.message) {
            this.handleIncomingMessage(data.message);
          } else if (data.type === 'CHAT_REACTION' && data.messageId) {
            this.handleIncomingReaction(data.messageId, data.emoji);
          }
        } catch (e) {
          console.error('[Chat WS] Message parse error:', e);
        }
      };

      ws.onclose = () => {
        this.isConnecting = false;
        this.socket = null;
        this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, 6);
        const delay = Math.min(3000 * 2 ** (this.reconnectAttempts - 1), 60_000);
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          this.connectWebSocket();
        }, delay);
      };

      ws.onerror = () => {
        this.isConnecting = false;
      };

      this.socket = ws;
    } catch (err) {
      this.isConnecting = false;
      console.warn('[Chat WS] Could not connect directly, using local bus fallback', err);
    }
  }

  private static handleIncomingMessage(msg: ChatMessage): void {
    // Idempotency: skip if already exists
    if (this.messages.some((m) => m.id === msg.id)) {
      return;
    }

    this.messages.push(msg);
    this.persist();

    // Notify listeners
    this.listeners.forEach((fn) => fn(msg));
    this.channelListeners.forEach((fn) => fn(msg.channelId));
  }

  private static handleIncomingReaction(messageId: string, emoji: string): void {
    const target = this.messages.find((m) => m.id === messageId);
    if (target) {
      target.reactions = target.reactions || {};
      target.reactions[emoji] = (target.reactions[emoji] || 0) + 1;
      this.persist();
      this.listeners.forEach((fn) => fn(target));
    }
  }

  static async sendMessage(
    channelId: string,
    content: string,
    user: UserProfile,
    location?: { name?: string; lat?: number; lng?: number }
  ): Promise<ChatMessage> {
    this.initialize();

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      channelId,
      userId: user.id,
      userName: user.fullName,
      userLevel: user.level,
      userRating: user.rating,
      content: content.trim(),
      locationName: location?.name,
      latitude: location?.lat,
      longitude: location?.lng,
      reactions: {},
      createdAt: new Date().toISOString(),
    };

    // Apply locally
    this.handleIncomingMessage(newMsg);

    // Send via WebSocket if open
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: 'SEND_MESSAGE',
          message: newMsg,
        })
      );
    } else {
      // Fallback to HTTP POST
      try {
        await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ message: newMsg }),
        });
      } catch (err) {
        console.warn('[Chat] Failed HTTP broadcast:', err);
      }
    }

    // Broadcast on local bus
    localRealtime.broadcast('chat_channel', { type: 'NEW_MESSAGE', message: newMsg });

    return newMsg;
  }

  static async addReaction(messageId: string, emoji: string): Promise<void> {
    this.handleIncomingReaction(messageId, emoji);

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: 'ADD_REACTION',
          messageId,
          emoji,
        })
      );
    } else {
      try {
        await fetch('/api/chat/reaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ messageId, emoji }),
        });
      } catch {}
    }
  }

  static subscribe(listener: (msg: ChatMessage) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  static subscribeChannel(listener: (channelId: string) => void): () => void {
    this.channelListeners.push(listener);
    return () => {
      this.channelListeners = this.channelListeners.filter((l) => l !== listener);
    };
  }
}
