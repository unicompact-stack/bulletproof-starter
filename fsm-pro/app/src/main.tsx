import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Регистрация Service Worker только в production-сборке (PWA / offline-first).
// В dev-режиме отключаем, чтобы кэш не мешал видеть свежие изменения.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        // Проверяем обновления SW раз в час — новая версия подтягивается сама
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      })
      .catch((err) => {
        console.log('SW registration failed:', err);
      });
  });

  // Новая версия SW активировалась (после деплоя) — перезагружаем страницу один раз,
  // чтобы пользователь сразу увидел свежую версию без чистки кэша.
  let reloadedAfterUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedAfterUpdate) return;
    reloadedAfterUpdate = true;
    window.location.reload();
  });
}
