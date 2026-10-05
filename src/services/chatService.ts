import { ChatChannel, ChatMessage, UserProfile } from '../types';
import { CHAT_CHANNELS, INITIAL_CHAT_MESSAGES } from '../data/chatData';
import { localRealtime } from '../lib/supabase';
import { TelegramService } from './telegramService';

const CHAT_STORAGE_KEY_PREFIX = 'roadlive_chat_messages_v2';

function getChatStorageKey(): string {
  const identity = TelegramService.getCachedAuthoritativeIdentity();
  return identity?.userId ? `${CHAT_STORAGE_KEY_PREFIX}:${identity.userId}` : `${CHAT_STORAGE_KEY_PREFIX}:demo`;
}

export class ChatService {
  private static messages: ChatMessage[] = [];
  private static socket: WebSocket | null = null;
  private static listeners: Array<(msg: ChatMessage) => void> = [];
  private static channelListeners: Array<(channelId: string) => void> = [];
  private static isConnecting = false;
  private static reconnectTimer: any = null;

  static initialize(): void {
    if (this.messages.length > 0) return;

    try {
      const stored = localStorage.getItem(getChatStorageKey());
      if (stored) {
        this.messages = JSON.parse(stored);
      } else {
        this.messages = [...INITIAL_CHAT_MESSAGES];
        this.persist();
      }
    } catch {
      this.messages = [...INITIAL_CHAT_MESSAGES];
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

  static getMessages(channelId: string): ChatMessage[] {
    this.initialize();
    return this.messages.filter((m) => m.channelId === channelId);
  }

  static connectWebSocket(): void {
    if (typeof window === 'undefined') return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (this.isConnecting) return;

    const sessionToken = TelegramService.getSessionToken();
    if (!sessionToken) return;

    this.isConnecting = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/chat`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        this.isConnecting = false;
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
        // Auto-reconnect after 3 seconds
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          this.connectWebSocket();
        }, 3000);
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
          headers: { 'Content-Type': 'application/json', ...TelegramService.getAuthHeaders() },
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
          headers: { 'Content-Type': 'application/json', ...TelegramService.getAuthHeaders() },
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
