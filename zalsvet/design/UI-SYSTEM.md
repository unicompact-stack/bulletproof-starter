# Дизайн-система «Pulte · Dark Neumorphic Glass»

**Источник (макет, удалить потом):**  
`Аватар/avatar_host/111/neumorphic-host-control-panel/`

Это **не** React-прод. Это **референс оформления** для пульта: кнопки, панели, сцена, mode-bar.  
Логика/API — остаются в Flask `/admin` + `/host`.

---

## Суть стиля

1. **Стекло:** `backdrop-filter: blur` + полупрозрачные панели  
2. **Толщина:** жёсткая нижняя грань `0 6px 0 #000` + мягкая большая тень  
3. **Неон:** фиолет `#a855f7`, glow вокруг active/primary  
4. **3D-кнопки:** градиент сверху-вниз, inset-свет, при нажатии `translateY` в «ямку»  
5. **Цветные плитки-иконки:** синий / оранж / magenta / purple  
6. **Сцена:** radial-свечение, orb, scan-lines, live-флаг  

Палитра не «детский clay» и не «бурый театр» — **тёмный неон + физическая кнопка**.

---

## CSS-токены (переносить как есть)

```css
:root {
  --bg: #090b10;
  --panel: rgba(25, 30, 40, 0.7);
  --panel-deep: rgba(9, 11, 16, 0.6);
  --neon: #a855f7;
  --neon-soft: #d8b4fe;
  --glow: rgba(168, 85, 247, 0.6);
  --glow-soft: rgba(168, 85, 247, 0.32);
  --coral: #f97362;          /* Play / срочный акцент */
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
  --edge-bright: rgba(216, 180, 255, 0.45);
  --edge-dark: rgba(0, 0, 0, 0.8);
  --r-panel: 28px;
  --r-screen: 36px;
  --r-chunk: 20px;
  --r-pill: 999px;
  --font: "Manrope", "Segoe UI", sans-serif;
}
```

### Фон body
```css
body {
  background-color: var(--bg);
  background-image:
    radial-gradient(900px 520px at 12% -10%, rgba(168, 85, 247, 0.13), transparent 60%),
    radial-gradient(800px 600px at 105% 110%, rgba(99, 60, 180, 0.12), transparent 60%),
    linear-gradient(rgba(255, 255, 255, 0.022) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.022) 1px, transparent 1px);
  background-size: auto, auto, 44px 44px, 44px 44px;
  background-attachment: fixed;
}
```

### Панель (sidebar / main)
```css
.panel {
  background: var(--panel);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-top-color: var(--edge-light);
  border-radius: var(--r-panel);
  box-shadow:
    0 6px 0 var(--edge-dark),
    0 26px 48px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
```

---

## Компоненты (что копировать в admin.html)

### 1. Primary button
- Градиент: `#c48afd → --neon → #8c2fe6`
- Pill, padding ~15×28, weight 800
- Тень: `0 6px 0 edge-dark` + neon glow + inset white top + inset violet bottom
- `:active { transform: translateY(5px) }` + тень «в 1px»

### 2. Dark button (вторичная)
- Градиент `#262d3a → #151a23`, текст `#cdd5e0`
- Та же «толщина» 3D, без неона
- Hover: brightness 1.12

### 3. Icon button
- 46×46 circle
- Тёмный градиент + edge + inset
- Hover: неон-soft цвет +конский glow

### 4. Chip (mode-bar)
- Pill, ~9×19, weight 700
- Off: deep panel + inset
- On: градиент violet soft + border neon + glow + text-shadow «объём»

### 5. Mode-bar
- Вдавленная панель: `panel-deep` + inset black
- Лейблы uppercase 11px muted letter-spacing .18em
- Разделители — тонкий gradient vertical line

### 6. Nav item + tile
- Tile 34×34, radius 11, цветной градиент (blue/orange/magenta/purple)
- Active: violet wash + neon rail 3px слева + glow tile
- `:active { translateY(2px) }`

### 7. Stage preview
- Radius 36, radial purple glow, scan-lines, optional orb
- is-live: усиленный glow
- Title: 800, text-shadow объём + neon

### 8. Play button (круг coral)
- 68×68, coral gradient, strong glow — для «в эфир»

### 9. Бейджи
- Live / clock / status-dot с blink
- Pill + blur + border neon

---

## Каркас layout

```
.app grid: 260px | 1fr, gap 20, padding 20, max-width ~1460
.sidebar  sticky top 20
.main     relative; LED-полоса слева (опционально, можно упростить)
```

Для Flask admin допустимо упростить: sidebar 240 + main 1fr, без LED, если мешает.

---

## Что НЕ брать из макета

- React / Vite / Tailwind / TypeScript  
- Фейковый state без API («Сохранить настройки» без бэкенда)  
- Название «Pulte» как бренд (можно оставить внутренне, в UI — «Аватар» / «ЗалСвет» / нейтрально)  
- Всё сразу на `/host` (сцена зала должна быть **чище**, не пульт)  

---

## Связь с ТЗ

- База стиля: **этот документ** (из прототипа)  
- Применение: `templates/admin.html` (+ при желании host в упрощённом виде)  
- План внедрения: `plans/2026-10-22-admin-glass-plan.md`
