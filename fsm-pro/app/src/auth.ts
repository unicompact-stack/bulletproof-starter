/**
 * auth.ts — централизованная логика входа в FSM PRO.
 *
 * Коды доступа по умолчанию (демо): 1111 / 9999.
 * Руководитель может изменить их в админ-панели (Настройки → Коды доступа),
 * а также выдать личный код каждому мастеру при создании пользователя.
 * Настройки хранятся в localStorage и НЕ прошиты в коде.
 */

export type AuthMode = 'worker' | 'manager' | 'demo';

/** Демо-коды по умолчанию (используются, пока руководитель не изменил их в админке). */
export const WORKER_CODE = '1111';
export const MANAGER_CODE = '9999';

const STORAGE_KEY = 'fsm_auth_mode';
const CODES_KEY = 'fsm_access_codes';

/** Формат настраиваемых кодов (задаётся из админ-панели). */
export interface AccessCodes {
  /** Общий код работника (вход в панель мастера). */
  worker: string;
  /** Код руководителя (вход в админ-панель). */
  manager: string;
  /** Личные коды мастеров: userId → код. Вход таким кодом = панель этого мастера. */
  personal: Record<string, string>;
}

/** Читает настроенные коды (с демо-значениями по умолчанию). */
export function getAccessCodes(): AccessCodes {
  try {
    const raw = localStorage.getItem(CODES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AccessCodes>;
      return {
        worker: parsed.worker || WORKER_CODE,
        manager: parsed.manager || MANAGER_CODE,
        personal: parsed.personal || {},
      };
    }
  } catch {
    // ignore
  }
  return { worker: WORKER_CODE, manager: MANAGER_CODE, personal: {} };
}

/** Сохраняет коды (вызывается из админ-панели). */
export function saveAccessCodes(codes: AccessCodes): void {
  localStorage.setItem(CODES_KEY, JSON.stringify(codes));
}

/** Сброс кодов к демо-значениям по умолчанию. */
export function resetAccessCodes(): void {
  localStorage.removeItem(CODES_KEY);
}

/** Возвращает userId, если код совпадает с личным кодом мастера. */
export function resolveUserCode(rawCode: string): string | null {
  const code = rawCode.trim();
  const { personal } = getAccessCodes();
  for (const [userId, c] of Object.entries(personal)) {
    if (c === code) return userId;
  }
  return null;
}

/**
 * Разбирает введённый код и возвращает роль, которой он соответствует.
 * Возвращает null, если код не распознан.
 * Порядок: личный код мастера → код руководителя → общий код работника.
 */
export function resolveAuthCode(rawCode: string): 'worker' | 'manager' | null {
  const code = rawCode.trim();
  if (resolveUserCode(code)) return 'worker';
  const { worker, manager } = getAccessCodes();
  if (code === manager) return 'manager';
  if (code === worker) return 'worker';
  return null;
}

/** Сохраняет выбранный режим в localStorage (переживает перезагрузку). */
export function persistAuthMode(mode: AuthMode | null): void {
  if (mode === null) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, mode);
  }
}

/** Читает сохранённый режим (для восстановления сессии). */
export function readPersistedAuthMode(): AuthMode | null {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'worker' || saved === 'manager' || saved === 'demo' ? saved : null;
}
