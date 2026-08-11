self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() }; }
  const icon = new URL("icon-192.png", self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(payload.title || "Codex Reset Watch", {
    body: payload.body || "A monitored Codex window changed.",
    tag: payload.tag || "codex-reset-watch",
    icon,
    badge: icon,
    data: { url: payload.url || "./" },
    renotify: true
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil((async () => {
    const clientsForScope = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clientsForScope.find(client => client.url.startsWith(self.registration.scope));
    if (existing) {
      await existing.focus();
      return;
    }
    await clients.openWindow(target);
  })());
});
