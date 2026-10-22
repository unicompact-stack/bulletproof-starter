import { useEffect, useRef, useState } from "react";

/* ─────────────────────────── Иконки (inline SVG) ─────────────────────────── */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const IconBolt = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M13.2 2.2 4.6 13.1c-.4.5 0 1.2.6 1.2h4.9l-1.5 7.2c-.1.7.7 1.1 1.2.6l8.6-10.9c.4-.5 0-1.2-.6-1.2h-4.9l1.5-7.2c.1-.7-.7-1.1-1.2-.6Z" />
  </svg>
);

const IconGrid = () => (
  <svg viewBox="0 0 24 24" {...stroke} aria-hidden>
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
  </svg>
);

const IconLayers = () => (
  <svg viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m4.5 12.6 7.5 4.2 7.5-4.2" />
    <path d="m4.5 16.6 7.5 4.2 7.5-4.2" />
  </svg>
);

const IconClock = () => (
  <svg viewBox="0 0 24 24" {...stroke} aria-hidden>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2.2" />
  </svg>
);

const IconMusic = () => (
  <svg viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="M9 18.5V6.2c0-.5.3-.9.8-1l9-2c.6-.2 1.2.3 1.2 1v11.6" />
    <circle cx="6.5" cy="18.5" r="2.5" />
    <circle cx="17.5" cy="15.8" r="2.5" />
  </svg>
);

const IconGear = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
  </svg>
);

const IconExpand = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="M8 3.5H5a1.5 1.5 0 0 0-1.5 1.5v3M16 3.5h3A1.5 1.5 0 0 1 20.5 5v3M8 20.5H5A1.5 1.5 0 0 1 3.5 19v-3M16 20.5h3a1.5 1.5 0 0 0 1.5-1.5v-3" />
  </svg>
);

const IconPlay = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M9 6.4c0-.9 1-1.5 1.8-1l8.4 5.6c.7.5.7 1.5 0 2l-8.4 5.6c-.8.5-1.8-.1-1.8-1V6.4Z" />
  </svg>
);

const IconPause = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="6" y="4.5" width="4" height="15" rx="1.4" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.4" />
  </svg>
);

const IconReset = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="M3.5 8.5A9 9 0 1 1 3 13" />
    <path d="M3 4v4.5h4.5" />
  </svg>
);

const IconCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="m4.5 12.5 5 5 10-11" />
  </svg>
);

const IconSave = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="M5 3.5h11L20.5 8v11a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5Z" />
    <path d="M7.5 3.5V9h8V3.5" />
    <circle cx="12" cy="15" r="2.4" />
  </svg>
);

/* ─────────────────────────────── Данные ─────────────────────────────── */

const NAV = [
  { id: "overview", label: "Обзор", tile: "t-blue", icon: <IconGrid /> },
  { id: "content", label: "Контент", tile: "t-orange", icon: <IconLayers /> },
  { id: "timer", label: "Таймер", tile: "t-magenta", icon: <IconClock /> },
  { id: "music", label: "Музыка", tile: "t-purple", icon: <IconMusic /> },
] as const;

const TABS = ["Эфир", "Сценарий", "Медиа"] as const;
const SCREENS = ["Сцена 1", "Экран 2"] as const;

const PRESETS: Record<(typeof SCREENS)[number], { title: string; sub: string }> = {
  "Сцена 1": { title: "Добро пожаловать", sub: "Пресет · Splash" },
  "Экран 2": { title: "Следующий спикер", sub: "Пресет · Speaker" },
};

/* ─────────────────────────────── Часы ─────────────────────────────── */

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const p = (n: number) => String(n).padStart(2, "0");
  return { time: `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}` };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/* ─────────────────────────────── App ─────────────────────────────── */

export default function App() {
  const [nav, setNav] = useState<string>("overview");
  const [tab, setTab] = useState<(typeof TABS)[number]>("Эфир");
  const [screen, setScreen] = useState<(typeof SCREENS)[number]>("Сцена 1");
  const [titles, setTitles] = useState(false);
  const [logo, setLogo] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [saved, setSaved] = useState(false);

  /* 3D-ручка: угол -135°..135°, перетаскивание вверх/вниз */
  const [angle, setAngle] = useState(40);
  const drag = useRef<{ y: number; a: number } | null>(null);
  const signal = Math.round(((angle + 135) / 270) * 100);

  const saveTimer = useRef<number | null>(null);
  const { time } = useClock();

  const preset = PRESETS[screen];

  const reset = () => {
    setScreen("Сцена 1");
    setTitles(false);
    setLogo(false);
    setPlaying(false);
    setAngle(40);
  };

  const save = () => {
    setSaved(true);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => setSaved(false), 1800);
  };

  const onKnobDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, a: angle };
  };
  const onKnobMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    const delta = drag.current.y - e.clientY;
    setAngle(clamp(drag.current.a + delta * 1.4, -135, 135));
  };
  const onKnobUp = () => {
    drag.current = null;
  };
  const onKnobKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      setAngle((a) => clamp(a + 9, -135, 135));
    }
    if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      setAngle((a) => clamp(a - 9, -135, 135));
    }
  };

  /* Радужное кольцо датчика: радуга до signal%, дальше — трек */
  const gaugeBg = `conic-gradient(from -90deg, #34d399 0%, #22d3ee ${signal * 0.25}%, #3b82f6 ${
    signal * 0.5
  }%, #a855f7 ${signal * 0.75}%, #fb923c ${signal}%, rgba(255,255,255,0.09) ${signal}% 100%)`;

  return (
    <div className="app">
      {/* ─────────── Sidebar ─────────── */}
      <aside className="panel sidebar">
        <div className="brand">
          <div className="brand-logo" aria-hidden>
            <IconBolt />
          </div>
          <div>
            <div className="brand-name">Pulte</div>
            <div className="brand-sub">Пульт ведущего</div>
          </div>
        </div>

        <nav className="nav" aria-label="Основная навигация">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-item${nav === item.id ? " is-active" : ""}`}
              onClick={() => setNav(item.id)}
              aria-pressed={nav === item.id}
            >
              <span className={`nav-tile ${item.tile}`} aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span className="status-dot" aria-hidden />
          <div>
            <div className="status-title">Система онлайн</div>
            <div className="status-sub">v2.4 · связь стабильна</div>
          </div>
          <div className="gauge-col" title={`Сигнал ${signal}%`}>
            <div className="gauge" style={{ background: gaugeBg }}>
              <div className="gauge-hole">{signal}</div>
            </div>
            <div className="gauge-dots" aria-hidden>
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </aside>

      {/* ─────────── Main ─────────── */}
      <main className="panel main">
        {/* Скобы LED-полосы */}
        <span className="strip-clamp strip-clamp--top" aria-hidden />
        <span className="strip-clamp strip-clamp--bottom" aria-hidden />

        {/* Topbar */}
        <div className="topbar">
          <div className="tabs" role="tablist" aria-label="Разделы эфира">
            {TABS.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={`tab${tab === t ? " is-active" : ""}`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="topbar-right">
            <span className="live-badge">
              <span className="status-dot" aria-hidden />
              ЭФИР
            </span>
            <span className="clock">
              {time}
              <small>МСК</small>
            </span>
            <button className="icon-btn" title="Настройки" aria-label="Настройки">
              <IconGear />
            </button>
            <button className="icon-btn" title="На весь экран" aria-label="На весь экран">
              <IconExpand />
            </button>
          </div>
        </div>

        {/* Mode-bar */}
        <div className="mode-bar">
          <div className="mode-group" role="group" aria-label="Экран">
            <span className="mode-label">Экран</span>
            {SCREENS.map((s) => (
              <button
                key={s}
                className={`chip${screen === s ? " is-on" : ""}`}
                onClick={() => setScreen(s)}
                aria-pressed={screen === s}
              >
                {s}
              </button>
            ))}
          </div>

          <span className="mode-sep" aria-hidden />

          <div className="mode-group" role="group" aria-label="Поверх">
            <span className="mode-label">Поверх</span>
            <button
              className={`chip${titles ? " is-on" : ""}`}
              onClick={() => setTitles((v) => !v)}
              aria-pressed={titles}
            >
              Титры
            </button>
            <button
              className={`chip${logo ? " is-on" : ""}`}
              onClick={() => setLogo((v) => !v)}
              aria-pressed={logo}
            >
              Логотип
            </button>
          </div>

          <span className="mode-sep" aria-hidden />

          <div className="knob-wrap">
            <span className="mode-label">Сигнал</span>
            <button
              className="knob"
              onPointerDown={onKnobDown}
              onPointerMove={onKnobMove}
              onPointerUp={onKnobUp}
              onPointerCancel={onKnobUp}
              onKeyDown={onKnobKey}
              aria-label={`Сигнал ${signal} процентов. Тяните вверх или вниз`}
              aria-valuenow={signal}
              aria-valuemin={0}
              aria-valuemax={100}
              role="slider"
            >
              <span className="knob-ind" style={{ transform: `rotate(${angle}deg)` }} aria-hidden />
            </button>
            <span className="knob-val">
              {signal}
              <small>%</small>
            </span>
          </div>

          <span className="mode-hint">
            Активно: <b>{screen}</b>
          </span>
        </div>

        {/* Stage */}
        <section className={`stage${playing ? " is-live" : ""}`} aria-label="Пресвью сцены">
          <div
            className="stage-orb"
            aria-hidden
            style={{ opacity: 0.2 + (signal / 100) * 0.8 }}
          />

          {playing && (
            <span className="stage-flag">
              <span className="status-dot" aria-hidden />В ЭФИРЕ
            </span>
          )}

          {logo && (
            <span className="corner-logo">
              <span className="mini-logo" aria-hidden>
                <IconBolt size={13} />
              </span>
              Pulte
            </span>
          )}

          <div className="stage-content" key={screen}>
            <h1 className="stage-title">{preset.title}</h1>
            <div className="stage-sub">{preset.sub}</div>
          </div>

          {titles && (
            <div className="lower-third">
              <div>
                <div className="lower-third-name">Анна Соколова</div>
                <div className="lower-third-role">Ведущая эфира</div>
              </div>
            </div>
          )}

          {playing && (
            <div className="eq" aria-hidden>
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          )}
        </section>

        {/* Controls */}
        <div className="controls">
          <button className="btn btn-dark" onClick={reset}>
            <IconReset />
            Сбросить
          </button>

          <button className={`btn btn-primary${saved ? " is-saved" : ""}`} onClick={save}>
            {saved ? <IconCheck /> : <IconSave />}
            {saved ? "Сохранено" : "Сохранить настройки"}
          </button>

          <button
            className={`btn-play${playing ? " is-playing" : ""}`}
            onClick={() => setPlaying((v) => !v)}
            aria-label={playing ? "Пауза" : "Запустить эфир"}
            title={playing ? "Пауза" : "Play"}
          >
            {playing ? <IconPause /> : <IconPlay />}
          </button>
        </div>
      </main>
    </div>
  );
}
