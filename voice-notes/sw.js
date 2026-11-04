/* ==========================================================================
   sw.js — Service Worker: офлайн-кэш приложения
   --------------------------------------------------------------------------
   Две независимые «полки»:
     • voice-notes-static-<версия> — сам сайт (html/css/js/иконки/vosk.js);
     • voice-notes-models-v1       — модель Vosk (~40 МБ), которую скачивает
       сама страница через Cache API. Её НИКОГДА не удаляем при обновлении,
       иначе каждое обновление приложения стирало бы модель.

   При изменении sw.js (или app.js/style.css с новой логикой) поднимай
   VERSION — старый статический кэш будет удалён при активации.
   ========================================================================== */

var VERSION = 'v1.0.0';

var STATIC_CACHE = 'voice-notes-static-' + VERSION;
var MODELS_CACHE = 'voice-notes-models-v1'; // должен совпадать с VoskEngine.MODELS_CACHE

var PRECACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './vosk-engine.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  // Тяжёлый движок кэшируем сразу: без него офлайн-распознавание не работает.
  './lib/vosk/vosk-browser/dist/vosk.js'
];

/* --------------------------------------------------------------- install -- */

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function (cache) {
      // Кэшируем по одному: если один файл недоступен, установка не падает.
      return Promise.all(PRECACHE.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function (error) {
          console.warn('[sw] не удалось закэшировать', url, error);
        });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

/* -------------------------------------------------------------- activate -- */

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        // Оставляем только свой статический кэш и кэш модели.
        if (key === STATIC_CACHE || key === MODELS_CACHE) return undefined;
        console.log('[sw] удаляю устаревший кэш', key);
        return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ----------------------------------------------------------------- fetch -- */

self.addEventListener('fetch', function (event) {
  var request = event.request;

  if (request.method !== 'GET') return;

  var url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Модель скачивает страница через Cache API — Service Worker её не трогает.
  if (url.pathname.indexOf('/models/') !== -1) return;

  // Range-запросы (медиа) не кэшируем.
  if (request.headers.has('range')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

function handleNavigation(request) {
  return fetch(request).then(function (response) {
    if (response && response.ok) {
      var copy = response.clone();
      caches.open(STATIC_CACHE).then(function (cache) {
        cache.put('./index.html', copy).catch(function () { /* ignore */ });
      });
    }
    return response;
  }).catch(function () {
    return caches.match('./index.html').then(function (cached) {
      if (cached) return cached;
      return caches.match('./');
    }).then(function (cached) {
      if (cached) return cached;
      return new Response(
        '<!doctype html><meta charset="utf-8"><title>Нет сети</title>' +
        '<body style="font:16px system-ui;background:#12141a;color:#eef1f8;padding:24px">' +
        '<h1>Нет сети</h1><p>Открой приложение хотя бы раз с интернетом, чтобы оно закэшировалось.</p>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    });
  });
}

function cacheFirst(request) {
  return caches.match(request).then(function (cached) {
    if (cached) return cached;

    return fetch(request).then(function (response) {
      if (!response || !response.ok || response.type === 'opaque') return response;

      var copy = response.clone();
      caches.open(STATIC_CACHE).then(function (cache) {
        cache.put(request, copy).catch(function () { /* ignore */ });
      });

      return response;
    });
  });
}
