import React, { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, AlertTriangle, Send, MapPin, Navigation } from 'lucide-react';

type AlertMode = 'live' | 'fixed';
type AlertRadiusKm = 5 | 15 | 30 | 50;
type Coordinates = { lat: number; lng: number };
const RADII: AlertRadiusKm[] = [5, 15, 30, 50];

/**
 * Each Telegram-authenticated browser/PWA device owns a real VAPID Web Push
 * subscription and an independent server-saved geographic alert preference.
 */
export const WebPushPanel: React.FC = () => {
  const [configured, setConfigured] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState('');
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [radiusKm, setRadiusKm] = useState<AlertRadiusKm>(5);
  const [mode, setMode] = useState<AlertMode>('live');
  const [fixedCoords, setFixedCoords] = useState<Coordinates | null>(null);
  const [saved, setSaved] = useState(true);

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const supportedNow = () => window.isSecureContext && 'serviceWorker' in navigator &&
    'PushManager' in window && 'Notification' in window;

  const registration = async () => {
    let current = await navigator.serviceWorker.getRegistration('/');
    if (!current) current = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return current;
  };

  const vapidKey = (base64Url: string): Uint8Array<ArrayBuffer> => {
    const normalized = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };

  const readFreshGps = (): Promise<Coordinates> => new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Геолокация не поддерживается. Откройте ROAD LIVE через HTTPS.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(position => {
      const { latitude, longitude, accuracy } = position.coords;
      const ageMs = Date.now() - position.timestamp;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
          Math.abs(latitude) > 85 || Math.abs(longitude) > 180 ||
          !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 1000 ||
          ageMs > 120000 || ageMs < -60000) {
        reject(new Error('GPS-точка неточная или устарела. Попробуйте ещё раз на улице.'));
        return;
      }
      resolve({ lat: latitude, lng: longitude });
    }, error => {
      reject(new Error(error.code === 1
        ? 'Разрешите геолокацию в настройках устройства.'
        : 'Не удалось получить GPS-точку. Попробуйте ещё раз.'));
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 });
  });

  useEffect(() => {
    let live = true;
    (async () => {
      const available = supportedNow();
      if (!live) return;
      setSupported(available);
      if (!available) return;
      setPermission(Notification.permission);
      const keyResponse = await fetch('/api/push/public-key');
      const config = keyResponse.ok ? await keyResponse.json() : null;
      if (!live) return;
      setConfigured(Boolean(config?.configured && config?.publicKey));
      setVapidPublicKey(typeof config?.publicKey === 'string' ? config.publicKey : '');
      if (!config?.configured) return;

      const existing = await (await registration()).pushManager.getSubscription();
      if (!live || !existing) return;
      setSubscribed(true);
      const response = await fetch(`/api/push/preferences?endpoint=${encodeURIComponent(existing.endpoint)}`, {
        credentials: 'include', cache: 'no-store',
      });
      if (!response.ok) {
        if (live) {
          setSubscribed(false);
          setMessage('Подписка найдена в браузере, но не на сервере. Нажмите «Включить Web Push» для восстановления.');
        }
        return;
      }
      const preferences = await response.json();
      if (!live) return;
      setRadiusKm(RADII.includes(preferences.alertRadiusKm) ? preferences.alertRadiusKm : 5);
      setMode(preferences.alertMode === 'fixed' ? 'fixed' : 'live');
      setFixedCoords(preferences.fixedCoords || null);
      setSaved(true);
    })().catch(() => { if (live) setMessage('Не удалось проверить Web Push. Проверьте сеть и повторите попытку.'); });
    return () => { live = false; };
  }, []);

  const withBusy = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try { await action(); }
    catch (error: any) { setMessage(error?.message || 'Не удалось выполнить действие.'); }
    finally { setBusy(false); }
  };

  const rememberSpot = () => withBusy(async () => {
    const coords = await readFreshGps();
    setFixedCoords(coords);
    setSaved(false);
    setMessage('Точка выбрана. Нажмите «Сохранить настройки» или «Включить Web Push».');
  });

  const writePreferences = async (subscription: PushSubscription, coords?: Coordinates) => {
    if (mode === 'fixed' && !fixedCoords) {
      throw new Error('Для фоновых уведомлений по району сначала нажмите «Моё местоположение».');
    }
    const response = await fetch('/api/push/subscribe', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        alertMode: mode, alertRadiusKm: radiusKm,
        fixedCoords: mode === 'fixed' ? fixedCoords : undefined,
        coords,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Сервер отклонил настройки Web Push.');
    setSubscribed(true);
    setSaved(true);
  };

  const enable = () => withBusy(async () => {
    if (!supportedNow()) throw new Error('Web Push недоступен в этом браузере.');
    if (!configured || !vapidPublicKey) throw new Error('Серверные VAPID-ключи недоступны.');
    if (mode === 'fixed' && !fixedCoords) throw new Error('Сначала выберите место для уведомлений.');
    // iOS requires the permission request in the direct user gesture;
    // do not await a network request before asking for permission.
    const allowed = await Notification.requestPermission();
    setPermission(allowed);
    if (allowed !== 'granted') throw new Error('Разрешите уведомления в настройках устройства.');
    const sw = await registration();
    const subscription = (await sw.pushManager.getSubscription()) ??
      await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey(vapidPublicKey) });
    // A fresh GPS fix is optional for the moving mode: until one arrives,
    // the server will not target this device with proximity notifications.
    let coords: Coordinates | undefined;
    if (mode === 'live') {
      try { coords = await readFreshGps(); } catch {
        // Keep subscription active but do not invent a location.
      }
    }
    await writePreferences(subscription, coords);
    setMessage(mode === 'fixed'
      ? `Web Push включён для вашего района в радиусе ${radiusKm} км даже при закрытом приложении.`
      : `Web Push включён, радиус ${radiusKm} км. Для уведомлений нужна свежая GPS-точка.`);
  });

  const savePreferences = () => withBusy(async () => {
    const existing = await (await registration()).pushManager.getSubscription();
    if (!existing) {
      setSubscribed(false);
      throw new Error('Подписка не найдена. Сначала включите Web Push.');
    }
    await writePreferences(existing);
    setMessage(`Настройки сохранены на сервере: ${radiusKm} км, ${mode === 'fixed' ? 'мой район' : 'в движении'}.`);
  });

  const disable = () => withBusy(async () => {
    const existing = await (await registration()).pushManager.getSubscription();
    if (!existing) { setSubscribed(false); return; }
    const response = await fetch('/api/push/unsubscribe', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: existing.endpoint }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Не удалось отключить подписку на сервере.');
    await existing.unsubscribe();
    setSubscribed(false);
    setSaved(true);
    setMessage('Web Push отключён для этого устройства.');
  });

  const test = () => withBusy(async () => {
    const existing = await (await registration()).pushManager.getSubscription();
    if (!existing) throw new Error('Сначала включите Web Push.');
    const response = await fetch('/api/push/test', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetEndpoint: existing.endpoint }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Не удалось отправить проверочное уведомление.');
    setMessage(data.message || 'Тестовое уведомление отправлено на это устройство.');
  });

  const selectRadius = (radius: AlertRadiusKm) => { setRadiusKm(radius); setSaved(false); };
  const selectMode = (next: AlertMode) => { setMode(next); setSaved(false); };

  return (
    <section className="p-4 rounded-2xl bg-surface-800 border border-white/10 space-y-4">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
          {subscribed ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">Web Push рядом с вами</h2>
          <p className="text-[11px] text-muted">Системные уведомления · Telegram-аккаунт</p>
        </div>
      </header>

      {isIOS && !isStandalone && (
        <p className="text-xs text-warning bg-warning/10 border border-warning/20 p-3 rounded-xl">
          iPhone: откройте сайт в Safari → «Поделиться» → «На экран Домой».
          Затем откройте установленное приложение и разрешите уведомления.
        </p>
      )}
      {!supported && <p className="text-xs text-warning">Web Push в этом браузере недоступен.
        Для iPhone используйте установленное на главный экран PWA.</p>}
      {supported && !configured && <p className="text-xs text-warning">VAPID-ключи на сервере не настроены.</p>}

      <div>
        <p className="text-xs font-semibold text-white mb-2">Радиус уведомлений</p>
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Радиус оповещений">
          {RADII.map(radius => (
            <button key={radius} type="button" onClick={() => selectRadius(radius)} disabled={busy}
              aria-pressed={radiusKm === radius}
              className={`py-2.5 rounded-xl text-xs font-bold border ${radiusKm === radius
                ? 'bg-accent text-white border-accent' : 'bg-surface-900 text-muted border-white/10'}`}>
              {radius} км
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-white mb-2">Где получать оповещения</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} aria-pressed={mode === 'live'} onClick={() => selectMode('live')}
            className={`px-2 py-3 rounded-xl border text-xs flex justify-center items-center gap-1.5 ${mode === 'live'
              ? 'bg-accent/20 border-accent text-white' : 'bg-surface-900 border-white/10 text-muted'}`}>
            <Navigation className="w-4 h-4" /> В движении
          </button>
          <button type="button" disabled={busy} aria-pressed={mode === 'fixed'} onClick={() => selectMode('fixed')}
            className={`px-2 py-3 rounded-xl border text-xs flex justify-center items-center gap-1.5 ${mode === 'fixed'
              ? 'bg-accent/20 border-accent text-white' : 'bg-surface-900 border-white/10 text-muted'}`}>
            <MapPin className="w-4 h-4" /> Мой район
          </button>
        </div>
        {mode === 'fixed' ? (
          <div className="mt-2 space-y-2">
            <button type="button" onClick={rememberSpot} disabled={busy}
              className="w-full py-2.5 border border-white/15 rounded-xl text-white text-xs font-semibold">
              <MapPin className="w-4 h-4 inline mr-1" /> Запомнить моё местоположение
            </button>
            <p className="text-[11px] text-muted">
              {fixedCoords
                ? `Центр: ${fixedCoords.lat.toFixed(5)}, ${fixedCoords.lng.toFixed(5)}`
                : 'Выберите GPS-точку. Уведомления будут приходить по этому району даже при закрытом сайте.'}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-muted">Оповещения привязаны к последнему точному GPS.
            Через 8 минут без обновления местоположения рассылка приостанавливается.</p>
        )}
      </div>

      <div className="flex gap-2 items-center">
        <span className={`text-xs flex items-center gap-1 ${subscribed ? 'text-success' : 'text-muted'}`}>
          {subscribed ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {subscribed ? 'Подключено' : 'Не подключено'}
        </span>
        {permission === 'denied' && <span className="text-xs text-danger">Запрещено браузером</span>}
        {subscribed && !saved && <span className="text-xs text-warning">Есть несохранённые изменения</span>}
      </div>

      {subscribed ? (
        <div className="space-y-2">
          {!saved && <button type="button" disabled={busy} onClick={savePreferences}
            className="w-full py-3 rounded-xl text-xs font-bold bg-accent text-white disabled:opacity-40">
            Сохранить настройки
          </button>}
          <button type="button" disabled={busy} onClick={test}
            className="w-full py-2.5 rounded-xl border border-white/15 text-xs font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40">
            <Send className="w-4 h-4" /> Отправить тестовый Web Push
          </button>
          <button type="button" disabled={busy} onClick={disable}
            className="w-full py-2.5 rounded-xl text-xs text-muted underline disabled:opacity-40">
            Отключить уведомления
          </button>
        </div>
      ) : (
        <button type="button" disabled={busy || !supported || !configured} onClick={enable}
          className="w-full py-3 rounded-xl text-xs font-bold bg-accent text-white disabled:opacity-40">
          {busy ? 'Подождите…' : 'Включить Web Push'}
        </button>
      )}
      {message && <p role="status" className="text-[11px] text-muted leading-relaxed">{message}</p>}
      <p className="text-[10px] text-muted leading-relaxed">
        Регистрация и действия — через Telegram. Web Push получает только это устройство.
        Геопозиция нужна исключительно для оповещений по выбранному радиусу.
      </p>
    </section>
  );
};
