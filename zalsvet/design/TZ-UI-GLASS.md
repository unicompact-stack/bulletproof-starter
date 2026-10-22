# ТЗ для нейронки: визуальный редизайн пульта (только UI, логику не ломать)

## 0. Главное правило

У тебя **уже рабочий проект** (сервер, API, страницы, кнопки-обработчики).  
**Не переписывай с нуля.** Не меняй бэкенд, не меняй имена API, не выбрасывай JS-логику.

Меняй **только визуальный слой**: CSS, классы на HTML, при необходимости порядок/структуру блоков **без** потери функций.

Проверка успеха: после правок **всё то же работает** (озвучка, фразы, экран, PIN и т.д.), но выглядит как тёмный неоновый пульт «стекло + 3D-кнопки».

---

## 1. Что такое стиль (одна фраза)

**Dark Neumorphic Glass** — глубокий тёмный фон, полупрозрачные панели с blur, объёмные кнопки с «толщиной» снизу, фиолетовое неоновое свечение на active/primary, цветные плитки-иконки, pill-чипы.

Не пастельный clay. Не коричневый «театр». Не плоский Material.

---

## 2. Структура папок и файлов

Создай/используй **только** визуальный слой. Имена путей адаптируй под текущий проект (если у тебя уже есть `static/`, `templates/`, `public/` — клади туда по аналогии).

### 2.1. Обязательно создать

```
design/
  UI-SYSTEM.md          # короткая шпаргалка для тебя и человека (что за стиль)
static/
  css/
    tokens.css          # только CSS-переменные (цвета, радиусы, шрифты)
    glass.css           # компоненты: панели, кнопки, chips, nav, stage
    admin.css           # точечные правки текущего admin (если нужен override)
```

Если у проекта иная раскладка, эквивалент:

```
<pроект>/design/UI-SYSTEM.md
<pроект>/assets/css/tokens.css
<pроект>/assets/css/glass.css
<pроект>/assets/css/admin.css
```

### 2.2. Подключать в таком порядке (в HTML пульта/админки)

```html
<link rel="stylesheet" href=".../tokens.css">
<link rel="stylesheet" href=".../glass.css">
<link rel="stylesheet" href=".../admin.css">
<!-- старый CSS админки — ПОСЛЕДНИМ НЕ ставить, если он перебивает glass.
     Если старый CSS есть: убери из него дублирующие цвета/кнопки или поставь admin.css последним как override. -->
```

### 2.3. Что НЕ создавать

- Новый backend / routers / API
- React/Vite/новый сборщик, если проект без него
- Копию всего чужого CSS-файла «в лоб» без разбора
- Отдельный «второй админ» — правь текущий экран пульта

### 2.4. Референс-макет (если есть доступ)

Человек может дать папку-макет вида `neumorphic-host-control-panel` (React demo).  
Используй её **только как картинку-эталон**. Не копируй React. Вытащи **CSS-идеи** (см. §4).

---

## 3. Границы: можно / нельзя

### Можно
- Новые CSS-файлы и CSS-переменные
- Добавлять/менять `class` на существующих тегах
- Оборачивать блоки в `<div class="panel">` без удаления кнопок и data-атрибутов
- Менять фон, тени, скругления, шрифты, отступы
- Переименовывать **только CSS-классы оформления** (не id, не JS-селекторы API)

### Нельзя
- Менять URL эндпоинтов и payload JSON
- Удалять `onclick` / `addEventListener` / существующие id, которые использует JS
- «Чинить» логику, которую не просили
- Вводить обязательный Node/React
- Ломать PIN/авторизацию
- Прятать функциональные кнопки только ради красоты

### Правило переноса
Если сомневаешься: **сначала сохрани работающий HTML+JS**, поверх навесь стекло-классы. Не «с нуля, потом подключу API» — так ломается.

---

## 4. Дизайн-токены (вставить в `tokens.css`)

```css
:root {
  --bg: #090b10;
  --panel: rgba(25, 30, 40, 0.7);
  --panel-deep: rgba(9, 11, 16, 0.6);
  --neon: #a855f7;
  --neon-soft: #d8b4fe;
  --glow: rgba(168, 85, 247, 0.6);
  --glow-soft: rgba(168, 85, 247, 0.32);
  --coral: #f97362;
  --coral-deep: #e8442a;
  --coral-glow: rgba(244, 84, 47, 0.55);
  --c-blue: #3b82f6;
  --c-orange: #f97316;
  --c-magenta: #ec4899;
  --c-cyan: #22d3ee;
  --c-green: #34d399;
  --text: #ffffff;
  --muted: #8892a0;
  --edge-light: rgba(255, 255, 255, 0.12);
  --edge-bright: rgba(216, 180, 254, 0.45);
  --edge-dark: rgba(0, 0, 0, 0.8);
  --r-panel: 28px;
  --r-screen: 36px;
  --r-chunk: 20px;
  --r-pill: 999px;
  --font: "Manrope", "Segoe UI", sans-serif;
}
```

Шрифт подключить один раз (Google Fonts):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

Фон страницы пульта:

```css
body, .app-body {
  margin: 0;
  font-family: var(--font);
  color: var(--text);
  background-color: var(--bg);
  background-image:
    radial-gradient(900px 520px at 12% -10%, rgba(168, 85, 247, 0.13), transparent 60%),
    radial-gradient(800px 600px at 105% 110%, rgba(99, 60, 180, 0.12), transparent 60%),
    linear-gradient(rgba(255, 255, 255, 0.022) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.022) 1px, transparent 1px);
  background-size: auto, auto, 44px 44px, 44px 44px;
  background-attachment: fixed;
  -webkit-font-smoothing: antialiased;
}
```

---

## 5. Компоненты (вставить в `glass.css`)

### 5.1. Панель-стекло

```css
.panel {
  background: var(--panel);
  -webkit-backdrop-filter: blur(18px);
  backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-top-color: var(--edge-light);
  border-left-color: rgba(255, 255, 255, 0.09);
  border-radius: var(--r-panel);
  box-shadow:
    0 6px 0 var(--edge-dark),
    0 26px 48px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
```

Каркас (если уместно):

```css
.app-shell {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 20px;
  padding: 20px;
  min-height: 100vh;
  max-width: 1460px;
  margin: 0 auto;
}
@media (max-width: 900px) {
  .app-shell { grid-template-columns: 1fr; }
}
```

Если текущий layout уже рабочий — **не ломай grid**, а просто навесь `.panel` на существующие колонки.

### 5.2. Кнопка primary (главная: Сохранить / Озвучить)

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 26px;
  border-radius: var(--r-pill);
  font-family: var(--font);
  font-size: 15px;
  font-weight: 800;
  border: 1px solid transparent;
  cursor: pointer;
  transition: filter .2s ease, box-shadow .25s ease, transform .12s ease, background .25s ease;
}
.btn:active { transform: translateY(5px); }
.btn:focus-visible {
  outline: 2px solid var(--neon-soft);
  outline-offset: 3px;
}

.btn-primary {
  color: #fff;
  background: linear-gradient(180deg, #c48afd 0%, var(--neon) 48%, #8c2fe6 100%);
  border-color: rgba(124, 36, 209, 0.7);
  border-top-color: rgba(255, 255, 255, 0.6);
  text-shadow: 0 1px 0 rgba(0,0,0,.45), 0 -1px 1px rgba(255,255,255,.4);
  box-shadow:
    0 6px 0 var(--edge-dark),
    0 0 22px var(--glow),
    0 0 60px var(--glow-soft),
    0 18px 34px rgba(0,0,0,.45),
    inset 0 1px 0 rgba(255,255,255,.45),
    inset 0 0 16px rgba(216,180,254,.45),
    inset 0 -4px 10px rgba(88,20,160,.55);
}
.btn-primary:hover { filter: brightness(1.09); }
.btn-primary:active {
  box-shadow:
    0 1px 0 var(--edge-dark),
    0 0 22px var(--glow),
    0 6px 14px rgba(0,0,0,.4),
    inset 0 1px 0 rgba(255,255,255,.4),
    inset 0 0 16px rgba(216,180,254,.45),
    inset 0 -2px 8px rgba(88,20,160,.55);
}
```

### 5.3. Вторичная тёмная кнопка

```css
.btn-dark {
  color: #cdd5e0;
  background: linear-gradient(180deg, #262d3a 0%, #151a23 100%);
  border-color: rgba(255,255,255,.07);
  border-top-color: var(--edge-light);
  box-shadow:
    0 6px 0 var(--edge-dark),
    0 16px 30px rgba(0,0,0,.45),
    inset 0 1px 0 rgba(255,255,255,.12),
    inset 0 -3px 8px rgba(0,0,0,.5);
}
.btn-dark:hover { color: #fff; filter: brightness(1.12); }
```

### 5.4. Иконка-кнопка 46×46

```css
.icon-btn {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--muted);
  background: linear-gradient(180deg, rgba(34,40,52,.9), rgba(16,20,27,.9));
  border: 1px solid rgba(255,255,255,.07);
  border-top-color: var(--edge-light);
  box-shadow:
    0 5px 0 var(--edge-dark),
    0 12px 22px rgba(0,0,0,.4),
    inset 0 1px 0 rgba(255,255,255,.1),
    inset 0 -3px 6px rgba(0,0,0,.45);
  cursor: pointer;
  transition: color .2s ease, box-shadow .25s ease, transform .12s ease;
}
.icon-btn:hover {
  color: var(--neon-soft);
  box-shadow:
    0 5px 0 var(--edge-dark),
    0 0 16px var(--glow-soft),
    0 12px 22px rgba(0,0,0,.4),
    inset 0 1px 0 rgba(255,255,255,.12),
    inset 0 0 12px rgba(168,85,247,.25);
}
.icon-btn:active { transform: translateY(4px); }
```

### 5.5. Chip (переключатель в mode-bar)

```css
.chip {
  padding: 9px 19px;
  border-radius: var(--r-pill);
  font-family: var(--font);
  font-size: 13.5px;
  font-weight: 700;
  color: var(--muted);
  background: var(--panel-deep);
  border: 1px solid rgba(255,255,255,.06);
  border-top-color: rgba(255,255,255,.1);
  box-shadow:
    0 3px 0 rgba(0,0,0,.55),
    inset 0 1px 0 rgba(255,255,255,.08),
    inset 0 -2px 5px rgba(0,0,0,.35);
  cursor: pointer;
  transition: color .2s ease, background .25s ease, box-shadow .25s ease, transform .12s ease;
}
.chip:hover { color: #fff; }
.chip:active { transform: translateY(2px); }
.chip.is-on,
.chip[aria-pressed="true"] {
  color: #fff;
  background: linear-gradient(180deg, rgba(168,85,247,.3), rgba(168,85,247,.12));
  border-color: rgba(168,85,247,.45);
  border-top-color: var(--edge-bright);
  box-shadow:
    0 4px 0 rgba(0,0,0,.75),
    0 0 16px var(--glow),
    0 0 42px var(--glow-soft),
    inset 0 1px 0 rgba(255,255,255,.4),
    inset 0 0 12px rgba(216,180,254,.45);
  text-shadow: 0 1px 0 rgba(0,0,0,.45), 0 -1px 1px rgba(255,255,255,.35);
}
```

### 5.6. Mode-bar (вдавленная полоса под превью)

```css
.mode-bar {
  display: flex;
  align-items: center;
  gap: 14px 26px;
  flex-wrap: wrap;
  padding: 14px 20px;
  border-radius: 24px;
  background: var(--panel-deep);
  border: 1px solid rgba(255,255,255,.05);
  border-top-color: rgba(255,255,255,.08);
  box-shadow:
    inset 0 3px 10px rgba(0,0,0,.6),
    inset 0 -1px 0 rgba(255,255,255,.05);
}
.mode-label {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--muted);
  margin-right: 4px;
}
```

### 5.7. Навигация + цветная плитка-иконка

```css
.nav-item {
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  padding: 13px 16px;
  border-radius: var(--r-chunk);
  font-size: 15px;
  font-weight: 600;
  color: var(--muted);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: color .2s ease, background .25s ease, box-shadow .25s ease, transform .15s ease;
}
.nav-item:hover {
  color: #fff;
  background: rgba(255,255,255,.045);
  border-top-color: rgba(255,255,255,.08);
}
.nav-item:active { transform: translateY(2px); }
.nav-item.is-active {
  color: #fff;
  background: linear-gradient(180deg, rgba(168,85,247,.3), rgba(168,85,247,.1));
  border-color: rgba(168,85,247,.35);
  border-top-color: var(--edge-bright);
  box-shadow:
    0 4px 0 rgba(0,0,0,.55),
    0 0 18px var(--glow-soft),
    inset 0 0 16px rgba(168,85,247,.3),
    inset 0 1px 0 rgba(216,180,254,.35);
}
.nav-item.is-active::before {
  content: "";
  position: absolute;
  left: -1px;
  top: 22%;
  bottom: 22%;
  width: 3px;
  border-radius: 3px;
  background: var(--neon-soft);
  box-shadow: 0 0 10px var(--glow), 0 0 22px var(--glow);
}
.nav-item { position: relative; }

.nav-tile {
  width: 34px;
  height: 34px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 11px;
  color: #fff;
  border-top: 1px solid rgba(255,255,255,.4);
  box-shadow:
    0 3px 0 rgba(0,0,0,.65),
    inset 0 1px 0 rgba(255,255,255,.35),
    inset 0 -3px 7px rgba(0,0,0,.3);
}
.t-blue    { background: linear-gradient(160deg, #60a5fa, #2563eb); box-shadow: 0 3px 0 rgba(0,0,0,.65), 0 0 12px rgba(59,130,246,.55), inset 0 1px 0 rgba(255,255,255,.35); }
.t-orange  { background: linear-gradient(160deg, #fdba74, #ea580c); box-shadow: 0 3px 0 rgba(0,0,0,.65), 0 0 12px rgba(249,115,22,.55), inset 0 1px 0 rgba(255,255,255,.35); }
.t-magenta { background: linear-gradient(160deg, #f472b6, #c026d3); box-shadow: 0 3px 0 rgba(0,0,0,.65), 0 0 12px rgba(236,72,153,.55), inset 0 1px 0 rgba(255,255,255,.35); }
.t-purple  { background: linear-gradient(160deg, #c084fc, #7c3aed); box-shadow: 0 3px 0 rgba(0,0,0,.65), 0 0 12px rgba(168,85,247,.55), inset 0 1px 0 rgba(255,255,255,.35); }
```

### 5.8. Превью сцены (если на пульте есть «экран»)

```css
.stage {
  position: relative;
  min-height: 320px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: var(--r-screen);
  background:
    radial-gradient(120% 90% at 50% 42%, rgba(168,85,247,.2) 0%, rgba(168,85,247,.05) 45%, transparent 68%),
    radial-gradient(90% 70% at 50% 118%, rgba(99,60,180,.16), transparent 60%),
    #0a0d14;
  border: 1px solid rgba(255,255,255,.07);
  border-top-color: var(--edge-light);
  box-shadow:
    0 6px 0 rgba(0,0,0,.65),
    0 24px 46px rgba(0,0,0,.45),
    inset 0 0 70px rgba(0,0,0,.65),
    inset 0 0 130px rgba(168,85,247,.1);
}
.stage::after {
  content: "";
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(0deg, rgba(255,255,255,.026) 0 1px, transparent 1px 3px);
  pointer-events: none;
}
.stage-title {
  position: relative;
  z-index: 2;
  font-size: clamp(28px, 4vw, 48px);
  font-weight: 800;
  letter-spacing: -.02em;
  text-shadow: 0 2px 0 rgba(0,0,0,.7), 0 -1px 1px rgba(255,255,255,.22), 0 0 30px var(--glow);
}
```

### 5.9. Круглая play (coral), если есть «эфир / озвучить экран»

```css
.btn-play {
  width: 68px;
  height: 68px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(160deg, #ffb59e 0%, var(--coral) 45%, var(--coral-deep) 100%);
  border: 1px solid rgba(190,48,24,.7);
  border-top-color: rgba(255,255,255,.65);
  box-shadow:
    0 6px 0 var(--edge-dark),
    0 0 22px var(--coral-glow),
    0 0 56px rgba(244,84,47,.3),
    inset 0 1px 0 rgba(255,255,255,.45);
  cursor: pointer;
  transition: transform .12s ease, filter .2s ease, box-shadow .25s ease;
}
.btn-play:active { transform: translateY(5px); filter: brightness(.95); }
```

### 5.10. Вводы (тёмные)

```css
.input, input[type="text"], input[type="password"], textarea, select {
  font-family: var(--font);
  color: var(--text);
  background: rgba(9, 11, 16, 0.65);
  border: 1px solid rgba(255,255,255,.08);
  border-top-color: rgba(0,0,0,.6);
  border-radius: 14px;
  padding: 12px 16px;
  box-shadow: inset 0 3px 8px rgba(0,0,0,.45);
}
.input:focus, input:focus, textarea:focus, select:focus {
  outline: none;
  border-color: rgba(168,85,247,.5);
  box-shadow: inset 0 3px 8px rgba(0,0,0,.45), 0 0 0 3px rgba(168,85,247,.2);
}
```

---

## 6. Как применять к текущему HTML (алгоритм для нейронки)

1. **Найди** главный файл пульта/админки (например `templates/admin.html`, `admin/index.html`, `public/admin.html`).
2. **Прочитай** существующие обработчики: какие `id`/`class` использует JS. Составь список «нельзя ломать».
3. **Подключи** `tokens.css` → `glass.css` → точечный override.
4. **Оберни** крупные блоки в `class="panel"`: sidebar, main, карточки настроек.
5. **Перекрась кнопки:**
   - главная действие → `btn btn-primary`
   - отмена/сброс → `btn btn-dark`
   - переключатели → `chip` (+ `is-on` или `aria-pressed="true"`)
   - иконки сверху → `icon-btn`
6. **Навигацию** → `nav-item` + `nav-tile t-blue|t-orange|t-magenta|t-purple`.
7. **Mode-bar** (если есть ряды «На экране / Поверх») → `mode-bar` + `mode-label` + `chip`.
8. **Не трогай** JS-файлы, кроме случаев, когда селектор ломается из-за смены class — тогда поправь **только селектор**, логику оставь.
9. Прогони вручную: PIN → озвучка → фразы → на экран → сценарий/звук (что есть).
10. Если неон слишком яркий: уменьшь `--glow` / `--glow-soft` альфы в `tokens.css` — **одной строкой**.

---

## 7. Каркас страницы (минимальный, если строишь layout заново)

Строить **вокруг** уже работающих блоков, не вместо них:

```
app-shell
├── aside.panel.sidebar
│   ├── brand (лого + «Пульт ведущего»)
│   ├── nav (nav-item + tiles)
│   └── sidebar-foot (статус онлайн, опционально)
└── main.panel.main
    ├── topbar (время, live-badge, icon-btn)
    ├── mode-bar (chips)          # если нужно по ТЗ продукта
    ├── stage (превью)            # если есть
    └── controls (btn-dark | btn-primary | btn-play)
```

Всё **внутри** controls/mode-bar — **существующие** формы и кнопки продукта, а не пустышки.

---

## 8. `/host` (экран зала) — отдельно, мягко

Если есть публичный экран:
- фон тёмный, минимум «пультовых» панелей
- допустимо: `#0a0d14` + мягкое radial-свечение
- субтитры/кнопка звука — стекло, **без** двойного неона на всё
- не тащить sidebar пульта на экран зала

---

## 9. Чек-лист сдачи

- [ ] Работает: авторизация/PIN, все прежние действия
- [ ] CSS подключён отдельными файлами (не 2000 строк inline)
- [ ] Есть `.panel`, `.btn-primary`, `.btn-dark`, `.chip`, `.icon-btn`
- [ ] Focus-visible на интерактивах
- [ ] На ~1280px нет наезда блоков (wrap mode-bar)
- [ ] Читаемость: muted не мажется в фон
- [ ] Бэкенд/эндпоинты не менялись
- [ ] `prefers-reduced-motion: reduce` → убрать пульсации glow (по желанию, 5 строк)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
}
```

---

## 10. Папки ещё раз (кратко для промпта нейронке)

Создай:

1. **`design/UI-SYSTEM.md`** — 10–20 строк: что за стиль, ссылки на css, правила «не ломать JS»
2. **`static/css/tokens.css`** (или `assets/css/tokens.css`) — §4
3. **`static/css/glass.css`** — §5
4. **`static/css/admin.css`** — только override под текущую разметку

Измени **только** HTML пульта: подключение линков + классы.  
Логику и API — **не трогать**.

---

## 11. Запрет на «красиво вместо работающего»

Если выбор: «переписать с нуля и потом подключить API» vs «оставить разметку, навесить стекло» —  
**всегда второй путь.** Стиль важен, но пульт должен включать вечер.
