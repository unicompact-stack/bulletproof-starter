# Душа компании — MVP

Личный веб-курс по коммуникативным навыкам: 6 уроков, упражнения, самопроверка
и сохранение прогресса. Стек: React + Vite + TypeScript + Tailwind CSS.

## Запуск

```bash
npm install
npm run dev
```

Откроется `http://localhost:5173`.

## Сборка и проверки

```bash
npm run build   # tsc -b && vite build
npm run preview # предпросмотр production-сборки
npm test        # 26 тестов: парсер, прогресс, рендер
npm run lint    # tsc --noEmit
```

## Как устроено

- **Контент** — канонические файлы `../library/lessons/lesson-01.md` … `lesson-06.md`.
- **Загрузка контента** — `vite-plugin-content.ts` отдаёт markdown как
  виртуальные модули `virtual:content/lesson-01.md`. Дублирования нет.
- **Парсер** — `src/lib/lesson.ts` разбирает урок на тело, чек-лист
  самопроверки и подсказку для ответа.
- **Прогресс** — `localStorage`, ключ `dusha-kompanii:progress:v1`. Ответы и
  отметки сохраняются автоматически и восстанавливаются после перезагрузки.
- **Приватность** — данные не отправляются на сервер.

## Структура

```
app/
├── src/
│   ├── components/     # LessonList, LessonView, LibraryView, Markdown
│   ├── data/           # lessons.ts, library.ts — импорт и парсинг
│   ├── lib/            # lesson.ts, progress.ts, library.ts + тесты
│   ├── App.tsx         # состояние и навигация
│   ├── index.css       # Tailwind и типографика markdown
│   └── types.ts
├── vite-plugin-content.ts
├── vite.config.ts
└── package.json
```

## Библиотека

В приложении есть страница **«Библиотека»** (кнопка в шапке главного экрана):

- 55 источников из `library/sources.md`;
- поиск по названию и автору;
- фильтры по уроку и статусу;
- оценка по рубрике и ссылка на источник.

Данные читаются из `library/sources.md` через виртуальный модуль
`virtual:library/sources` (плагин `vite-plugin-content.ts`). Реестр остаётся
единственным источником правды.

## Что проверено

- `npm run build` — проходит.
- `npm test` — 26 тестов, включая рендер приложения, сохранение ответа и
  страницу библиотеки.
- Вёрстка адаптивная: `max-w-3xl`, отступы `px-5`, переносы строк; проверять
  на ширине 390 px в браузере.
