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

  if (event.action === 'close') {
    return;
  }

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // Focus existing window if open
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url && 'focus' in client) {
          client.postMessage({
            type: 'NAVIGATE_TO_EVENT',
            data: event.notification.data,
          });
          return client.focus();
        }
      }
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
