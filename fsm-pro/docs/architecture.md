# Архитектура FSM PRO (реальное состояние)

**Дата обновления:** 2026-09-09
**Важно:** этот документ описывает то, что **есть в коде**, а не планы.
Планы — в [`plans/`](../plans/), продуктовые решения — в [`PRODUCT-CORE.md`](../PRODUCT-CORE.md).

> Прежний документ `FSM_System_Architecture_and_Specification.md` описывал
> React Native + NestJS + PostgreSQL + PostGIS + BullMQ. Ничего из этого создано не было.
> Он удалён как вводящий в заблуждение.

---

## Стек

| Слой | Технология |
|---|---|
| UI | React 19 + TypeScript |
| Сборка | Vite 8 |
| Стили | Tailwind CSS 4 |
| Иконки | Lucide React |
| Хранилище | IndexedDB (`src/db.ts`) + localStorage (9 ключей) |
| Офлайн | Service Worker (`public/sw.js`) |
| Синхронизация вкладок | BroadcastChannel |
| Бэкенд | **отсутствует** |

---

## Схема данных (текущая)

```
Браузер одного устройства
┌─────────────────────────────────────────────┐
│ AppContext.tsx (1188 строк)                 │
│  ├── tasks[]        → IndexedDB  (fsm_tasks_all)
│  ├── users[]        → localStorage (fsm_users)
│  ├── chatMessages[] → localStorage (fsm_chat)
│  ├── presence       → localStorage (fsm_presence)
│  ├── unreadTech / unreadManager → localStorage
│  ├── customWorkTypes → localStorage
│  ├── authMode / currentRole → localStorage
│  └── offlineQueue[] (в памяти)
│         │
│         └── BroadcastChannel 'fsm-sync'
│             → синхронизация между вкладками ОДНОГО браузера
└─────────────────────────────────────────────┘
```

**Следствие:** диспетчер и мастер на разных устройствах друг друга не видят.

---

## Модель данных

Текущая — в `app/src/types/index.ts` (`Task`, `User`, `TaskStatus`, `ChatMessage`).

Целевая (для сервера) — в [`database_schema.sql`](../database_schema.sql):
`companies / users / teams / team_members / sites / tasks / photos / comments`.
Модель согласована и переживёт смену стека.

---

## Статусная машина

```
new ──назначение──▶ assigned ──взял──▶ in_progress ──отправил──▶ under_review
                                            ▲                          │
                                            │                          ├──принял──▶ completed
                                            └──────вернул на доработку─┘
```

- `isOverdue` — флаг на карточке, **не статус**
- возврат на доработку — возврат в `in_progress` + комментарий в истории, **не статус**

---

## Роли

| Роль | Разделы | Компоненты |
|---|---|---|
| **Работник (мастер)** | Все задачи, Мои, Чат, Помощь | `components/mobile/*` |
| **Руководитель** | Главная, Задачи, Бригады, Проверка | `components/admin/AdminDashboard.tsx` |

Вход — по 4-значному коду (`src/auth.ts`). Коды хранятся в `localStorage`,
настраиваются в админке. Личный код мастера открывает панель именно этого мастера.

---

## Офлайн

1. Действие пользователя → оптимистичное обновление UI
2. Запись в IndexedDB / localStorage
3. При отсутствии сети — действие кладётся в `offlineQueue`
4. При появлении сети — очередь разбирается (`syncOfflineQueue`)

Очередь живёт в памяти: **перезагрузка страницы её теряет.** Это известное ограничение.

---

## Чего в архитектуре НЕТ

- сервера и общей базы
- реальной авторизации и сессий
- Push-уведомлений
- тестов
- разделения слоёв: UI работает с `localStorage` напрямую

План устранения — [`plans/2026-09-09-fsm-pro-foundation.md`](../plans/2026-09-09-fsm-pro-foundation.md).

---

## Деплой

GitHub Pages: `https://unicompact-stack.github.io/fsm-pro/`
Сборка: `cd app && npm run build` → `dist/` в корне репозитория.
Публикация: `scripts/deploy_gh.py` (загрузка через GitHub Contents API).

⚠️ **Риск:** Pages сейчас отдаёт корень репозитория. После перехода на публикацию
из `dist/` через GitHub Actions скрипт `deploy_gh.py` станет не нужен.
Пока Actions не настроен, чистить корень боевого репозитория нельзя — сайт упадёт.
