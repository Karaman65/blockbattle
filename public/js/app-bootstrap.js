if ('serviceWorker' in navigator) {
  const isLocalDev = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  if (isLocalDev) {
    navigator.serviceWorker.getRegistrations()
      .then(registrations => registrations.forEach(registration => registration.unregister()))
      .catch(() => {});
    if (window.caches) {
      caches.keys().then(keys => keys.forEach(key => caches.delete(key))).catch(() => {});
    }
  } else {
    navigator.serviceWorker.register('/sw.js?v=105').catch(() => {});
  }
}
