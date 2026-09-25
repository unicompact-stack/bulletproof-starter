/**
 * geo.ts — Утилиты геолокации.
 * Кэширует последнюю известную позицию устройства и предоставляет
 * быстрый синхронный доступ к координатам (для фиксации фото/статусов).
 */

const FALLBACK = { lat: 55.75124, lng: 37.61842 };
const STORAGE_KEY = 'fsm_last_location';

let cached: { lat: number; lng: number } | null = null;

/** Быстрый снимок текущих координат (кэш или дефолт Москва). */
export function getLocationSnapshot(): { lat: number; lng: number } {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      cached = JSON.parse(raw);
      return cached!;
    }
  } catch {
    // ignore
  }
  return FALLBACK;
}

/** Запускает асинхронный запрос геопозиции и кэширует результат. */
export function initGeoTracking(): void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return;
  try {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        cached = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
        } catch {
          // ignore
        }
      },
      () => {
        // ignore errors
      },
      { timeout: 4000, maximumAge: 60000 }
    );
  } catch {
    // ignore
  }
}

/** Получить свежую позицию асинхронно (для явных действий). */
export function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(getLocationSnapshot());
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        cached = loc;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
        } catch {
          // ignore
        }
        resolve(loc);
      },
      () => resolve(getLocationSnapshot()),
      { timeout: 4000, maximumAge: 30000 }
    );
  });
}