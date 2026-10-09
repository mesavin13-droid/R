type UserRole = 'driver' | 'moderator' | 'admin' | 'owner';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramAuthResponse {
  authenticated: boolean;
  user: TelegramUser;
  role: UserRole;
  isAdmin: boolean;
  isOwner: boolean;
}

interface VerifiedIdentity {
  userId: string;
  role: UserRole;
  isAdmin: boolean;
  isOwner: boolean;
  expiresAt: number;
}

export interface ChannelSubscriptionStatus {
  enabled: boolean;
  subscribed: boolean;
  staffBypass?: boolean;
  status?: string | null;
  error?: string | null;
  channel?: { username?: string; link: string } | null;
}

const STAFF_ROLES: UserRole[] = ['moderator', 'admin', 'owner'];

function readRole(value: unknown): UserRole {
  return STAFF_ROLES.includes(value as UserRole) ? (value as UserRole) : 'driver';
}

let verifiedIdentity: VerifiedIdentity | null = null;

export class TelegramService {
  static isTelegramWebApp(): boolean {
    return typeof window !== 'undefined' && Boolean((window as any).Telegram?.WebApp?.initData);
  }

  /** True inside any Telegram client, even before initData is readable. */
  static isTelegramClient(): boolean {
    return typeof window !== 'undefined' && Boolean((window as any).Telegram?.WebApp);
  }

  static getInitData(): string | null {
    if (typeof window === 'undefined') return null;
    const initData = (window as any).Telegram?.WebApp?.initData;
    return typeof initData === 'string' && initData.length > 0 ? initData : null;
  }

  /**
   * Authenticate the Mini App on the server.
   * The server validates Telegram's initData signature and sets an HttpOnly session cookie.
   */
  static async authenticate(): Promise<TelegramAuthResponse> {
    const initData = this.getInitData();
    if (!initData) {
      throw new Error('Telegram initData is unavailable');
    }

    const response = await fetch('/api/telegram/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ initData }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.authenticated || !data?.user) {
      throw new Error(data?.error || 'Telegram authentication failed');
    }

    verifiedIdentity = {
      userId: `tg-${data.user.id}`,
      role: readRole(data.role),
      isAdmin: Boolean(data.isAdmin),
      isOwner: Boolean(data.isOwner) || data.role === 'owner',
      expiresAt: Number(data.expiresAt || 0),
    };
    return data as TelegramAuthResponse;
  }

  static clearSession(): void {
    if (typeof window !== 'undefined') {
      fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    }
    verifiedIdentity = null;
  }

  static getCachedAuthoritativeIdentity(): { userId: string; role: UserRole; isAdmin: boolean; isOwner: boolean } | null {
    if (!verifiedIdentity) return null;
    if (!verifiedIdentity.expiresAt || verifiedIdentity.expiresAt <= Math.floor(Date.now() / 1000)) {
      verifiedIdentity = null;
      return null;
    }
    return {
      userId: verifiedIdentity.userId,
      role: verifiedIdentity.role,
      isAdmin: verifiedIdentity.isAdmin,
      isOwner: verifiedIdentity.isOwner,
    };
  }

  static async getAuthoritativeIdentity(): Promise<{ userId: string; role: UserRole; isAdmin: boolean; isOwner: boolean } | null> {
    const readIdentity = async (): Promise<{ userId: string; role: UserRole; isAdmin: boolean; isOwner: boolean } | null> => {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
      });
      if (!response.ok) return null;
      const data = await response.json().catch(() => null);
      if (!data?.authenticated || typeof data.userId !== 'string') return null;
      verifiedIdentity = {
        userId: data.userId,
        role: readRole(data.role),
        isAdmin: Boolean(data.isAdmin),
        isOwner: Boolean(data.isOwner) || data.role === 'owner',
        expiresAt: Number(data.expiresAt || Math.floor(Date.now() / 1000) + 300),
      };
      return {
        userId: verifiedIdentity.userId,
        role: verifiedIdentity.role,
        isAdmin: verifiedIdentity.isAdmin,
        isOwner: verifiedIdentity.isOwner,
      };
    };

    let identity = await readIdentity();
    if (identity) return identity;

    // The session cookie can be missing or rejected (e.g. it expired, or the
    // app was reopened before the cross-site cookie was re-sent). Re-run the
    // initData handshake once to mint a fresh cookie, then retry — this turns a
    // hard "invalid session" error into a silent self-heal for the driver.
    if (this.getInitData()) {
      try {
        await this.authenticate();
      } catch {
        return null;
      }
      identity = await readIdentity();
    }
    return identity;
  }

  static getAuthHeaders(): Record<string, string> {
    return {};
  }

  /**
   * Server-verified status of the mandatory channel subscription gate.
   * The server calls Telegram getChatMember itself; the client only renders
   * what the server says. Returns the live response (already typed below).
   */
  static async checkChannelSubscription(): Promise<ChannelSubscriptionStatus> {
    const response = await fetch('/api/telegram/subscription', {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error('Не удалось проверить подписку на канал');
    }
    const data = await response.json().catch(() => null);
    if (!data || typeof data.enabled !== 'boolean') {
      throw new Error('Некорректный ответ сервера');
    }
    return data as ChannelSubscriptionStatus;
  }

  static async getWsToken(): Promise<string | null> {
    const response = await fetch('/api/auth/ws-token', {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    return data?.wsToken || null;
  }

  static getTelegramUser(): TelegramUser | null {
    if (typeof window === 'undefined') return null;
    const tg = (window as any).Telegram?.WebApp;
    // initDataUnsafe is only for non-authoritative UI data.
    // Authorization always uses server-validated initData.
    return tg?.initDataUnsafe?.user || null;
  }

  static ready(): void {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      tg.ready();
      tg.expand();
    }
  }
}
