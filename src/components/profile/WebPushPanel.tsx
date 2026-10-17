import React, { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, AlertTriangle, Send } from 'lucide-react';

/** Real browser Web Push with the server's VAPID public key.
 * No notification permission prompt until the driver taps Enable.
 * The backend requires a server-verified Telegram session for every write.
 */
export const WebPushPanel: React.FC = () => {
  const [configured, setConfigured] = useState(false);
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [permission, setPermission] = useState<NotificationPermission>('default');

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const supportedNow = () =>
    window.isSecureContext && 'serviceWorker' in navigator &&
    'PushManager' in window && 'Notification' in window;

  const registration = async () => {
    // VitePWA registers /sw.js automatically. Recover on first install if
    // the registration has not yet been created.
    let current = await navigator.serviceWorker.getRegistration('/');
    if (!current) current = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return current;
  };

  const vapidKey = (base64Url: string): Uint8Array<ArrayBuffer> => {
    const normalized = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };

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
      if (!config?.configured) return;
      const existing = await (await registration()).pushManager.getSubscription();
      if (live) setSubscribed(Boolean(existing));
    })().catch(() => { if (live) setMessage('Не удалось проверить настройки Web Push.'); });
    return () => { live = false; };
  }, []);

  const withBusy = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try { await action(); }
    catch (error: any) { setMessage(error?.message || 'Не удалось выполнить действие.'); }
    finally { setBusy(false); }
  };

  const enable = () => withBusy(async () => {
    if (!supportedNow()) throw new Error('Web Push недоступен в этом браузере.');
    const keyResponse = await fetch('/api/push/public-key');
    const config = keyResponse.ok ? await keyResponse.json() : null;
    if (!config?.configured || typeof config.publicKey !== 'string' || !config.publicKey) {
      throw new Error('На сервере пока не настроены VAPID-ключи.');
    }
    const allowed = await Notification.requestPermission();
    setPermission(allowed);
    if (allowed !== 'granted') throw new Error('Разрешите уведомления в настройках устройства.');
    const sw = await registration();
    const subscription = (await sw.pushManager.getSubscription()) ??
      await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey(config.publicKey) });
    const response = await fetch('/api/push/subscribe', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Сервер отклонил подписку.');
    setSubscribed(true);
    setMessage('Web Push подключён. Оповещения о событиях будут приходить с учётом вашей GPS-позиции.');
  });

  const disable = () => withBusy(async () => {
    const current = await (await registration()).pushManager.getSubscription();
    if (!current) { setSubscribed(false); return; }
    const response = await fetch('/api/push/unsubscribe', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: current.endpoint }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Не удалось удалить подписку с сервера.');
    await current.unsubscribe();
    setSubscribed(false);
    setMessage('Web Push выключен.');
  });

  const test = () => withBusy(async () => {
    const current = await (await registration()).pushManager.getSubscription();
    if (!current) throw new Error('Сначала включите Web Push.');
    const response = await fetch('/api/push/test', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetEndpoint: current.endpoint }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Не удалось отправить проверочное сообщение.');
    setMessage(data.message || 'Проверочное уведомление отправлено.');
  });

  return (
    <section className="p-4 rounded-2xl bg-surface-800 border border-white/10 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
          {subscribed ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">Системные Web Push</h2>
          <p className="text-[11px] text-muted">ДТП, SOS и предупреждения рядом</p>
        </div>
      </div>
      {isIOS && !isStandalone && (
        <p className="text-xs text-warning bg-warning/10 border border-warning/20 p-3 rounded-xl">
          На iPhone откройте ROAD LIVE в Safari, нажмите «Поделиться» → «На экран Домой».
          Затем откройте установленное приложение и разрешите уведомления.
        </p>
      )}
      {!supported && (
        <p className="text-xs text-warning">Этот браузер не поддерживает Web Push или сайт открыт без HTTPS.
          Попробуйте установленное PWA в Safari или совместимый браузер.</p>
      )}
      {supported && !configured && (
        <p className="text-xs text-warning">VAPID-ключи пока не активны на сервере.</p>
      )}
      <div className="flex items-center gap-2">
        <span className={`text-xs flex items-center gap-1 ${subscribed ? 'text-success' : 'text-muted'}`}>
          {subscribed ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {subscribed ? 'Уведомления включены' : 'Уведомления выключены'}
        </span>
        {permission === 'denied' && <span className="text-xs text-danger">Запрещены браузером</span>}
      </div>
      <button type="button" onClick={subscribed ? disable : enable}
        disabled={busy || !supported || (!subscribed && !configured)}
        className="w-full py-3 rounded-xl text-xs font-bold bg-accent text-white disabled:opacity-40">
        {busy ? 'Подождите…' : subscribed ? 'Выключить Web Push' : 'Включить Web Push'}
      </button>
      {subscribed && <button type="button" onClick={test} disabled={busy}
        className="w-full py-2.5 rounded-xl border border-white/15 text-xs font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40">
        <Send className="w-4 h-4" /> Проверить уведомление
      </button>}
      {message && <p role="status" className="text-[11px] text-muted leading-relaxed">{message}</p>}
      <p className="text-[10px] text-muted leading-relaxed">
        Для уведомлений рядом нужен доступ к геолокации. Web Push работает с настоящей
        серверной подпиской и Telegram-аккаунтом, но доставка зависит от поддержки устройства и сети.
      </p>
    </section>
  );
};
