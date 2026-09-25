/**
 * db.ts - IndexedDB persistent storage for FSM tasks.
 * Обеспечивает надёжное хранение задач (включая фото data-URL) в браузере.
 * Перенесено из prototype (js/db.js) с усилением: атомарное сохранение всех задач.
 */

const DB_NAME = 'fsm-db';
const DB_VERSION = 1;
const STORE_NAME = 'tasks';
const ALL_KEY = 'fsm_tasks_all';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = (e) => reject((e.target as IDBOpenDBRequest).error);
  });
}

export const db = {
  /** Загрузить все задачи. Возвращает null, если хранилище пустое. */
  async getTasks<T>(): Promise<T[] | null> {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(ALL_KEY);
      req.onsuccess = () => {
        const result = req.result as { key: string; tasks: T[] } | undefined;
        resolve(result ? result.tasks : null);
      };
      req.onerror = () => reject(req.error);
    });
  },

  /** Сохранить все задачи одним атомарным объектом. */
  async saveTasks<T>(tasks: T[]): Promise<void> {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ key: ALL_KEY, tasks });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /** Полностью очистить хранилище задач. */
  async clear(): Promise<void> {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(ALL_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};

/** Проверка доступности IndexedDB */
export function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}