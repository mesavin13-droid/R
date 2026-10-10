import { NotificationItem, RoadEvent, DriverQuestion, UserProfile } from '../types';
import { TelegramService } from './telegramService';

const NOTIFS_KEY = 'roadlive_notifs_v1';
const PUSH_SUB_KEY = 'roadlive_push_subscribed';

export const NOTIFY_RADIUS_M = {
  /** SOS / помощь — доедут за ~10 минут по городу. */
  sos: 5000,
  /** Всё остальное (ДТП, переезды, вопросы) — только кто реально рядом. */
  standard: 2000,
} as const;

export function notifyRadiusFor(type: string): number {
  return type === 'assistance' ? NOTIFY_RADIUS_M.sos : NOTIFY_RADIUS_M.standard;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export class NotificationService {
  private static notifications: NotificationItem[] = [
    {
      id: 'notif-1',
      title: '🚧 Переезд закрыт на вашем районе',
      message: 'На ул. Троллейная маневровый поезд перекрыл переезд. 24 водителя подтвердили.',
      type: 'alert',
      eventId: 'ev-1',
      read: false,
      createdAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    },
    {
      id: 'notif-2',
      title: '💬 Новый ответ на ваш вопрос',
      message: 'Андрей К. ответил на вопрос о переезде: «По Немировича быстрее проедешь сейчас».',
      type: 'answer',
      read: true,
      createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    },
    {
      id: 'notif-3',
      title: '⭐ Ваше подтверждение помогло 18 водителям',
      message: 'Ваш статус на ул. Большевистская отмечен как полезный. +0.05 к рейтингу!',
      type: 'confirmation',
      read: true,
      createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
  ];

  static getNotifications(): NotificationItem[] {
    try {
      const stored = localStorage.getItem(NOTIFS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}
    return this.notifications;
  }

  static addNotification(item: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>): NotificationItem {
    const list = this.getNotifications();
    const newItem: NotificationItem = {
      ...item,
      id: `notif-${Date.now()}`,
      read: false,
      createdAt: new Date().toISOString(),
    };
    list.unshift(newItem);
    try {
      localStorage.setItem(NOTIFS_KEY, JSON.stringify(list));
    } catch {}
    return newItem;
  }

  static markAllAsRead(): void {
    const list = this.getNotifications().map((n) => ({ ...n, read: true }));
    try {
      localStorage.setItem(NOTIFS_KEY, JSON.stringify(list));
    } catch {}
  }

  static isPushSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  static getPermissionState(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    return Notification.permission;
  }

  static async isSubscribed(): Promise<boolean> {
    if (!this.isPushSupported()) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return Boolean(sub);
    } catch {
      return false;
    }
  }

  /**
   * Subscribe to Web Push using configured VAPID public key
   */
  static async subscribeToPush(user?: UserProfile): Promise<{ success: boolean; message: string }> {
    if (!this.isPushSupported()) {
      return { success: false, message: 'Web Push не поддерживается в этом браузере' };
    }

    try {
      // 1. Request Browser Permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return { success: false, message: 'Разрешение на уведомления было отклонено' };
      }

      // 2. Fetch VAPID Public Key from server or env
      let vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        const keyRes = await fetch('/api/push/public-key');
        if (keyRes.ok) {
          const keyData = await keyRes.json();
          vapidPublicKey = keyData.publicKey;
        }
      }

      if (!vapidPublicKey) {
        return { success: false, message: 'VAPID публичный ключ не настроен' };
      }

      // 3. Register Push Subscription on Service Worker
      const reg = await navigator.serviceWorker.ready;
      let subscription = await reg.pushManager.getSubscription();

      if (!subscription) {
        const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey as BufferSource,
        });
      }

      // 4. Send subscription to Backend
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subscription,
          districtId: 'tsentralniy',
        }),
      });

      if (!response.ok) {
        throw new Error('Не удалось сохранить подписку на сервере');
      }

      localStorage.setItem(PUSH_SUB_KEY, 'true');

      // Add in-app confirmation
      this.addNotification({
        title: '🔔 Уведомления активированы',
        message: 'SOS — в радиусе 5 км, ДТП и перекрытия — в радиусе 2 км от вас.',
        type: 'system',
      });

      return {
        success: true,
        message: 'Вы успешно подписаны на критические уведомления ROADLIVE!',
      };
    } catch (err: any) {
      console.error('[WebPush] Subscription error:', err);
      return { success: false, message: err.message || 'Ошибка подписки на уведомления' };
    }
  }

  /**
   * Unsubscribe from Web Push
   */
  static async unsubscribeFromPush(): Promise<{ success: boolean; message: string }> {
    if (!this.isPushSupported()) {
      return { success: false, message: 'Web Push не поддерживается' };
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ endpoint }),
        });
      }
      localStorage.removeItem(PUSH_SUB_KEY);
      return { success: true, message: 'Уведомления отключены' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Broadcast critical road event (e.g. major accident, road closure, closed railway crossing)
   */
  static async broadcastCriticalEvent(
    event: RoadEvent,
    authorCoords?: { lat: number; lng: number } | null,
  ): Promise<void> {
    const isCritical =
      (event.type === 'accident' && (event.subType === 'road_blocked' || event.subType === 'major')) ||
      (event.type === 'crossing' && event.subType === 'closed') ||
      (event.type === 'road' && (event.subType === 'closure' || event.subType === 'ice')) ||
      event.type === 'hazard' ||
      event.type === 'assistance'; // also SOS events!

    const currentUserId = TelegramService.getCachedAuthoritativeIdentity()?.userId || null;
    const isAuthor = Boolean(currentUserId && event.userId === currentUserId);

    // Save in-app notification only if NOT the author!
    if (isCritical && !isAuthor) {
      this.addNotification({
        title: `🚨 ${event.title}`,
        message: `${event.address}. ${event.description || 'Движение сильно затруднено.'}`,
        type: 'alert',
        eventId: event.id,
      });
    }

    // Call server push broadcast API — pass the event position so the server
    // notifies only drivers inside the radius (SOS 5 km, rest 2 km).
    try {
      await fetch('/api/push/broadcast-critical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          eventId: event.id,
          event: {
            id: event.id,
            latitude: event.latitude,
            longitude: event.longitude,
            ...(authorCoords ? { lat: authorCoords.lat, lng: authorCoords.lng } : {}),
          },
        }),
      });
    } catch (err) {
      console.warn('[WebPush] Server broadcast error:', err);
    }
  }

  /**
   * Broadcast localized driver question alert to nearby users in radius
   */
  static async broadcastQuestionAlert(
    question: DriverQuestion,
    authorName: string,
    authorCoords?: { lat: number; lng: number } | null,
  ): Promise<void> {
    const currentUserId = TelegramService.getCachedAuthoritativeIdentity()?.userId || null;
    const isAuthor = Boolean(currentUserId && question.userId === currentUserId);

    if (!isAuthor) {
      this.addNotification({
        title: `❓ Вопрос от ${authorName} на районе`,
        message: `📍 ${question.address}: «${question.question}»`,
        type: 'alert',
      });
    }

    try {
      await fetch('/api/push/broadcast-critical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          event: {
            id: question.id,
            userId: question.userId,
            title: `Вопрос водителя (${question.category})`,
            address: question.address,
            description: question.question,
            type: 'question',
            latitude: question.latitude,
            longitude: question.longitude,
            ...(authorCoords ? { lat: authorCoords.lat, lng: authorCoords.lng } : {}),
          },
          isCritical: true,
        }),
      });
    } catch (err) {
      console.warn('[WebPush] Question push broadcast error:', err);
    }
  }

  /**
   * Send test push notification
   */
  static async sendTestPush(): Promise<{ success: boolean; message: string }> {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();

      const response = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          targetEndpoint: sub?.endpoint,
        }),
      });

      const data = await response.json();
      return {
        success: data.success,
        message: data.message || (data.success ? 'Тестовый пуш отправлен' : 'Ошибка отправки'),
      };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }
}
