/**
 * sw.js — Service Worker для FSM PRO.
 * Стратегия обновлений (исправлена 2026-08-21):
 *  - Навигация (index.html): СНАЧАЛА СЕТЬ → при офлайне кэш.
 *    Новая версия на сервере = новая версия у пользователя после обычного обновления страницы.
 *  - Хэшированные ассеты (/assets/*.js|css): cache-first — их имена меняются при каждой сборке.
 *  - При активации новой версии SW старый кэш удаляется, страница перезагружается (см. main.tsx).
 * Работает из подпапки (GitHub Pages) через self.registration.scope.
 */

const CACHE_NAME = 'fsm-pro-cache-v3';
const SCOPE = self.registration.scope; // e.g. https://user.github.io/repo/

const STATIC_ASSETS = [
  SCOPE,
  new URL('index.html', SCOPE).href,
  new URL('manifest.json', SCOPE).href,
  new URL('favicon.svg', SCOPE).href,
  new URL('icons/icon-192.png', SCOPE).href,
  new URL('icons/icon-512.png', SCOPE).href,
];

// Устанавливаем и кэшируем базовые ассеты
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Активация: чистим кэши ВСЕХ старых версий
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Только свой origin (не трогаем внешние запросы)
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 1) Навигация: сеть первым делом — пользователь всегда видит свежую версию, офлайн — кэш
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(SCOPE, clone));
          }
          return response;
        })
        .catch(() => caches.match(SCOPE).then((c) => c || caches.match(request)))
    );
    return;
  }

  // 2) Хэшированные ассеты сборки: cache-first (имена уникальны для каждой версии)
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // 3) Остальное (иконки, manifest): сеть → кэш → кэш-обновление в фоне
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
