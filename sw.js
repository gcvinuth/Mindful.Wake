/* MindfulWake Service Worker — Cross-platform notification support */

const CACHE_NAME = 'mindfulwake-v3';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './questions.js',
  './manifest.json',
  './mindfulwake_icon_1776407461951.png'
];

// ── Install: pre-cache all assets ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: purge old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first strategy ───────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});

// ── Alarm scheduling via SW messages ─────────────────────────────────────────
// Map of alarmId → alarm data for timers managed inside the SW
const pendingAlarms = new Map();

self.addEventListener('message', (event) => {
  const { type, alarm } = event.data || {};

  if (type === 'SCHEDULE_ALARM' && alarm) {
    scheduleAlarm(alarm);
  }

  if (type === 'CANCEL_ALARM' && alarm?.id) {
    const existing = pendingAlarms.get(alarm.id);
    if (existing?.timerId) clearTimeout(existing.timerId);
    pendingAlarms.delete(alarm.id);
  }

  if (type === 'CANCEL_ALL') {
    for (const { timerId } of pendingAlarms.values()) {
      if (timerId) clearTimeout(timerId);
    }
    pendingAlarms.clear();
  }
});

function scheduleAlarm(alarm) {
  // Cancel any existing timer for this alarm
  const existing = pendingAlarms.get(alarm.id);
  if (existing?.timerId) clearTimeout(existing.timerId);

  const now = Date.now();
  const nextFire = alarm.nextFireMs; // Computed by app.js and passed in
  if (!nextFire || nextFire <= now) return;

  const delay = nextFire - now;
  // Don't schedule more than 24 hours ahead (SW can be killed)
  if (delay > 24 * 60 * 60 * 1000) return;

  const timerId = setTimeout(() => {
    fireAlarmNotification(alarm);
    pendingAlarms.delete(alarm.id);
  }, delay);

  pendingAlarms.set(alarm.id, { timerId, alarm });
}

function fireAlarmNotification(alarm) {
  const label = alarm.label || 'Time to wake up!';
  const time  = alarm.timeStr || '';

  // Icon paths — SW uses relative to its own scope
  const icon  = './mindfulwake_icon_1776407461951.png';
  const badge = './mindfulwake_icon_1776407461951.png';

  const options = {
    body: `${time ? time + ' — ' : ''}${label}\nTap to start your wake-up challenge! 🧠`,
    icon,
    badge,
    tag: `mw-alarm-${alarm.id}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [400, 150, 400, 150, 600, 300, 600], // Samsung / Android pattern
    actions: [
      { action: 'wake', title: '🧠 Wake Up!',  icon },
      { action: 'snooze', title: '😴 Snooze', icon },
    ],
    data: { alarmId: alarm.id, url: './' },
  };

  // Android / Samsung: use image for richer card
  // iOS Safari (iOS 16.4+): requireInteraction + actions are ignored but rest works
  self.registration.showNotification('⏰ MindfulWake', options);
}

// ── Push (server-sent, optional fallback) ────────────────────────────────────
self.addEventListener('push', (event) => {
  let title = '⏰ MindfulWake';
  let options = {
    body: 'Wake up! Your challenge awaits.',
    icon: './mindfulwake_icon_1776407461951.png',
    badge: './mindfulwake_icon_1776407461951.png',
    vibrate: [400, 150, 400, 150, 600],
    requireInteraction: true,
    tag: 'mw-push',
    data: { url: './' },
    actions: [
      { action: 'wake', title: '🧠 Wake Up!' },
      { action: 'snooze', title: '😴 Snooze' },
    ],
  };

  if (event.data) {
    try {
      const d = event.data.json();
      title = d.title || title;
      options.body = d.body || d.message || options.body;
      if (d.tag) options.tag = d.tag;
    } catch {
      options.body = event.data.text() || options.body;
    }
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action  = event.action;
  const data    = event.notification.data || {};
  const url     = data.url || './';

  if (action === 'snooze') {
    // Post message to open clients so app can handle snooze
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        if (clients.length > 0) {
          clients[0].postMessage({ type: 'SNOOZE_ALARM', alarmId: data.alarmId });
          return clients[0].focus();
        }
        return self.clients.openWindow(url + '?action=snooze&id=' + (data.alarmId || ''));
      })
    );
    return;
  }

  // Default / 'wake' action — open or focus the app
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.postMessage({ type: 'ALARM_TRIGGERED', alarmId: data.alarmId });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url + '?action=wake&id=' + (data.alarmId || ''));
      }
    })
  );
});

// ── Notification close (dismissed by user) ───────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  // Could track dismissals; no-op for now
});
