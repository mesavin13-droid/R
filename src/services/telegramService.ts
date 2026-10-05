type UserRole = 'driver' | 'admin';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramAuthResponse {
  authenticated: boolean;
  sessionToken: string;
  user: TelegramUser;
  role: UserRole;
  isAdmin: boolean;
}

const SESSION_KEY = 'roadlive_telegram_session_v1';

export class TelegramService {
  static isTelegramWebApp(): boolean {
    return typeof window !== 'undefined' && Boolean((window as any).Telegram?.WebApp?.initData);
  }

  static getInitData(): string | null {
    if (typeof window === 'undefined') return null;
    const initData = (window as any).Telegram?.WebApp?.initData;
    return typeof initData === 'string' && initData.length > 0 ? initData : null;
  }

  /**
   * Authenticate the Mini App on the server.
   * The server validates Telegram's initData signature before returning a short-lived session.
   */
  static async authenticate(): Promise<TelegramAuthResponse> {
    const initData = this.getInitData();
    if (!initData) {
      throw new Error('Telegram initData is unavailable');
    }

    const response = await fetch('/api/telegram/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.authenticated || !data?.sessionToken || !data?.user) {
      throw new Error(data?.error || 'Telegram authentication failed');
    }

    sessionStorage.setItem(SESSION_KEY, data.sessionToken);
    return data as TelegramAuthResponse;
  }

  static getSessionToken(): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(SESSION_KEY);
  }

  static clearSession(): void {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }

  static getAuthHeaders(): Record<string, string> {
    const token = this.getSessionToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
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
