// Service Worker Push Event & Notification Handling for ROADLIVE
self.addEventListener('push', function (event) {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || '🚨 ROADLIVE: Дорожная обстановка';
    const options = {
      body: payload.body || 'Новое критическое дорожное событие.',
      icon: payload.icon || '/pwa-192x192.png',
      badge: payload.badge || '/icon.svg',
      tag: payload.tag || 'critical-event',
      renotify: true,
      vibrate: [300, 100, 300, 100, 300],
      data: payload.data || {},
      actions: [
        { action: 'view', title: 'Посмотреть на карте' },
        { action: 'close', title: 'Закрыть' },
      ],
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('[ServiceWorker] Push error:', err);
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  if (event.action === 'close') return;

  // URLs are relative to our own PWA origin. Never open arbitrary external
  // links carried in push payloads.
  var rawUrl = event.notification.data && event.notification.data.url || '/';
  var target;
  try {
    target = new URL(String(rawUrl), self.location.origin);
    if (target.origin !== self.location.origin) target = new URL('/', self.location.origin);
  } catch (_) {
    target = new URL('/', self.location.origin);
  }

  event.waitUntil((async function () {
    var list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (var i = 0; i < list.length; i++) {
      var windowClient = list[i];
      if (!windowClient.url || !windowClient.url.startsWith(self.location.origin + '/')) continue;
      try {
        // Client.navigate is critical: focusing the existing page alone does
        // not select the road event from ?event=<id>.
        var navigated = typeof windowClient.navigate === 'function'
          ? await windowClient.navigate(target.href)
          : windowClient;
        if (navigated && typeof navigated.focus === 'function') {
          await navigated.focus();
          if (typeof windowClient.navigate !== 'function') {
            windowClient.postMessage({
              type: 'NAVIGATE_TO_EVENT',
              data: event.notification.data || {},
            });
          }
          return;
        }
      } catch (error) {
        // Safari PWA can reject navigation during a service-worker wakeup.
      }
    }
    if (clients.openWindow) return clients.openWindow(target.href);
  })());
});
