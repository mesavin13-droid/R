export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export class TelegramService {
  static isTelegramWebApp(): boolean {
    return typeof window !== 'undefined' && Boolean((window as any).Telegram?.WebApp?.initData);
  }

  static getTelegramUser(): TelegramUser | null {
    if (typeof window === 'undefined') return null;
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initDataUnsafe?.user) {
      return tg.initDataUnsafe.user;
    }
    return null;
  }

  static ready(): void {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      tg.ready();
      tg.expand();
    }
  }
}
