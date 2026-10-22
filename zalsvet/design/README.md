# design — визуальный редизайн ЗалСвет

**Задача:** изменить **только оформление** пульта (CSS/классы). Логику и API не ломать.

## С чего начать (для агента/нейронки)

1. Прочитай **[TZ-UI-GLASS.md](./TZ-UI-GLASS.md)** — полное ТЗ.
2. Глянь **[UI-SYSTEM.md](./UI-SYSTEM.md)** — токены и компоненты.
3. Референс-макет (React, **не копировать как прод**):  
   **[ui-reference/neumorphic-host-control-panel/](./ui-reference/neumorphic-host-control-panel/)**  
   Главное: `src/index.css` + `src/App.tsx` (как выглядят кнопки/панели).

## Папки, которые просит ТЗ создать в `zalsvet/`

```
static/css/tokens.css   # цвета, радиусы, шрифт (§4 TZ)
static/css/glass.css    # .panel .btn* .chip .nav* .stage (§5 TZ)
static/css/admin.css    # override под текущий HTML
```

(Если в проекте уже есть `public/css/` — клади туда.)

## Ссылки

- Ветка: `arena/e77ce4e9-bulletproof-starter`
- Проект демо: `zalsvet/`
- Не переписывать `server.js` / `lib/` ради красоты.
