// Service Worker for PulseChat Web Push Notifications (RFC 8291/8292)

self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'PulseChat', body: event.data.text() };
  }

  const title = payload.title || 'PulseChat';
  const options = {
    body: payload.body || 'You have a new message',
    icon: payload.icon || '/favicon.svg',
    badge: '/favicon.svg',
    tag: payload.tag || 'pulsechat-notification',
    data: {
      url: payload.url || '/chat',
      timestamp: payload.timestamp || Date.now(),
    },
    requireInteraction: Boolean(payload.tag && payload.tag.startsWith('call-')),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/chat';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url.includes(targetUrl)) {
            return client.focus();
          }
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

