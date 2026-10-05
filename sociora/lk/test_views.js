// Полный прогон кабинета: рендерим каждый раздел через настоящий render()
// и проверяем итоговый HTML (включая асинхронные под-рендеры).
const fs = require("fs");

let src = fs.readFileSync(__dirname + "/app.js", "utf8");
src = src.replace("var views = {};", "var views = globalThis.__views = {};");
src = src.replace("function render() {", "globalThis.__render = render; function render() {");
["renderAnalytics", "loadThemes", "renderSocials", "renderBilling"].forEach(function (fn) {
  src = src.replace("function " + fn + "(", "globalThis.__" + fn + " = " + fn + "; function " + fn + "(");
});
src = src.replace("(function () {", "").replace(/\}\)\(\);\s*$/, "");
src = "var global = globalThis;\n" + src;

function fakeEl() {
  return {
    innerHTML: "", textContent: "", value: "", hidden: false, title: "",
    classList: { toggle() {}, add() {}, remove() {} },
    querySelectorAll() { return []; },
    appendChild() {}, remove() {},
    setAttribute() {}, getAttribute() { return null; },
    onclick: null, disabled: false
  };
}
const els = {};
global.document = {
  querySelector(sel) { return els[sel] || (els[sel] = fakeEl()); },
  querySelectorAll() { return []; },
  createElement() { return fakeEl(); }
};
global.window = { addEventListener() {}, scrollTo() {} };
global.location = { hash: "", search: "", href: "" };
global.requestAnimationFrame = function (fn) { fn(); };
global.localStorage = { _d: {}, getItem(k) { return this._d[k] === undefined ? null : this._d[k]; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } };

const USER = {
  id: 1, email: "owner@sociora.local", name: "Владелец", plan: "business",
  plan_name: "Business", plan_active: true, days_left: 29, is_admin: false, blocked: false,
  posts_balance: 300, posts_total: 12, tone: "дружелюбный", created_at: "2026-10-01T10:00:00",
  limits: { posts: 300, socials: 3, projects: 3, themes: 100 }
};
const STATS = { projects: 2, posts_draft: 4, posts_scheduled: 2, posts_published: 4, socials: 4, views: 2537 };
const PROJECTS = [{ id: 1, name: "Салон Лилия", niche: "салон красоты", tone: "дружелюбный", status: "analyzed" }];
const POSTS = [
  { id: 1, project_id: 1, title: "Топ-5 ошибок в уходе за волосами", body: "Текст поста про уход.", rubric: "Полезный", status: "published", views: 769, likes: 30, comments: 8, reposts: 4, networks: '["telegram"]', created_at: "2026-10-02T10:00:00" },
  { id: 2, project_id: 1, title: "Как выбрать салон рядом с домом", body: "Текст.", rubric: "Экспертный", status: "draft", views: 0, likes: 0, comments: 0, reposts: 0, networks: '[]', created_at: "2026-10-03T10:00:00" },
  { id: 3, project_id: 1, title: "Акция недели", body: "Текст.", rubric: "Продающий", status: "scheduled", views: 0, likes: 0, comments: 0, reposts: 0, networks: '["telegram","vk"]', created_at: "2026-10-04T10:00:00", scheduled_at: "2026-10-07T10:00" },
  { id: 4, project_id: 1, title: "История клиентки", body: "Текст.", rubric: "История", status: "approved", views: 0, likes: 0, comments: 0, reposts: 0, networks: '[]', created_at: "2026-10-05T10:00:00" }
];

global.fetch = function (url) {
  const u = String(url);
  let data = {};
  if (u.includes("/api/me")) data = { ok: true, user: USER, stats: STATS };
  else if (u.includes("/api/projects/")) data = { ok: true, project: { ...PROJECTS[0], analysis: { niche_label: "салон красоты", audience: "Женщины 25-45", pains: ["нет времени"], recommendation: "Начинайте с экспертных постов" } }, themes: [{ id: 1, title: "Уход за волосами", rubric: "Полезный" }, { id: 2, title: "Тренды сезона", rubric: "Новости" }], posts: [], socials: [] };
  else if (u.includes("/api/projects")) data = { ok: true, projects: PROJECTS };
  else if (u.includes("/api/posts")) data = { ok: true, posts: POSTS };
  else if (u.includes("/api/socials")) data = { ok: true, socials: [{ id: 1, network: "telegram", channel: "@liliya", project_name: "Салон Лилия" }], projects: PROJECTS };
  else if (u.includes("/api/analytics")) data = { ok: true, network: "all", overall: { views: 2537, likes: 90, comments: 24, reposts: 12, subscribers: 710, er: 4.97 }, series: [{ day: "Пн", views: 300 }, { day: "Вт", views: 420 }], top_posts: POSTS, voice: [{ name: "Полезный", views: 1200, pct: 100 }], insight: "Охваты растут." };
  else if (u.includes("/api/tariffs")) data = { ok: true, plans: { trial: { name: "Trial", price: 0, posts: 15, socials: 1, projects: 1, themes: 10 }, start: { name: "Start", price: 1290, posts: 50, socials: 1, projects: 1, themes: 10 }, pro: { name: "Pro", price: 4200, posts: 150, socials: 3, projects: 1, themes: 30 }, business: { name: "Business", price: 11900, posts: 300, socials: 3, projects: 3, themes: 100 } }, packs: { 100: { posts: 100, price: 1590 } }, current: "business" };
  else if (u.includes("/api/payments")) data = { ok: true, payments: [{ id: 1, kind: "plan", item: "business", amount: 11900, status: "paid", created_at: "2026-10-01T10:00:00" }] };
  else data = { ok: true };
  return Promise.resolve({ json: () => Promise.resolve(data) });
};

let fails = 0;
function t(name, cond, extra) {
  console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : " -- " + (extra || "")));
  if (!cond) fails++;
}

try {
  new Function(src)();
} catch (e) {
  console.log("FAIL загрузка app.js:", e.message);
  process.exit(1);
}

const ROUTES = {
  dashboard: ["Здравствуйте", "Новый пост", "Всего постов", "На проверке", "Запланировано", "Опубликовано", "постов осталось", "Управление подпиской", "Последние посты", "Салон Лилия"],
  posts: ["Лента постов", "Черновики", "Запланированы", "Опубликованы", "На проверке", "Telegram", "ВКонтакте"],
  quick: ["Быстрый пост", "Сгенерировать пост", "Рубрика"],
  analytics: ["Аналитика"],  // контент грузится асинхронно — см. async-проверку
  competitors: ["Конкуренты", "Запустить анализ ниши"],
  learning: ["Самообучение", "Профиль голоса канала", "Тон голоса"],
  kb: ["База знаний", "Частые вопросы"],
  themes: ["Темы", "Новый проект", "Уход за волосами", "Написать пост"],
  schedule: ["Расписание", "Составить план на неделю", "Акция недели"],
  socials: ["Соцсети", "Подключить соцсеть", "@liliya", "Telegram"],
  settings: ["Настройки", "Тон голоса канала", "Владелец"],
  billing: ["Биллинг", "Тарифы", "Пакеты постов", "История операций", "Business", "1 590"],
  profile: ["Профиль", "owner@sociora.local", "Business"],
  support: ["Поддержка", "support@sociora.ru", "@sociora_support"]
};

// асинхронные под-рендеры: обращаемся к ним напрямую и ждём заполнения
const ASYNC = {
  analytics: ["__renderAnalytics", "#an-body", ["Просмотры по дням", "AI-анализ", "Подписчики", "Вовлечённость", "Голос канала", "Топ постов"]],
  themes: ["__loadThemes", "#t-themes", ["Уход за волосами", "Написать пост"]],
  socials: ["__renderSocials", "#so-body", ["Подключить соцсеть", "@liliya", "Telegram"]],
  billing: ["__renderBilling", "#b-body", ["Тарифы", "Пакеты постов", "История операций", "Business", "1 590"]]
};
function runAsync() {
  const keys = Object.keys(ASYNC);
  function next() {
    if (!keys.length) { console.log("\nАсинхронные разделы проверены."); return finish(); }
    const k = keys.shift();
    const spec = ASYNC[k];
    const fn = globalThis[spec[0]];
    const el = els[spec[1]] || (els[spec[1]] = fakeEl());
    if (spec[1] === "#t-themes") { els["#t-project"] = fakeEl(); els["#t-project"].value = "1"; }
    try { fn(); } catch (e) { t("раздел " + k + " (async)", false, e.message); return next(); }
    setTimeout(function () {
      const html = el.innerHTML || "";
      const missing = spec[2].filter(function (m) { return html.indexOf(m) === -1; });
      t("раздел " + k + " — async-контент (" + html.length + " симв.)", !missing.length, "нет: " + missing.join(", "));
      const junk = html.match(/undefined|NaN|\[object Object\]/g);
      if (junk) t("раздел " + k + ": нет мусора", false, junk.join(","));
      next();
    }, 90);
  }
  next();
}

const queue = Object.keys(ROUTES);
function step() {
  if (!queue.length) {
    console.log(fails ? "\nПроблем: " + fails : "\nВсе разделы кабинета рендерятся корректно.");
    process.exit(fails ? 1 : 0);
  }
  const route = queue.shift();
  global.location.hash = "#/" + route;
  try {
    globalThis.__render();
  } catch (e) {
    t("раздел " + route, false, e.message);
    return step();
  }
  setTimeout(function () {
    const html = els["#view"].innerHTML || "";
    const missing = ROUTES[route].filter(function (m) { return html.indexOf(m) === -1; });
    t("раздел " + route + " (" + html.length + " симв.)", !missing.length, "нет: " + missing.join(", "));
    const opens = (html.match(/<div/g) || []).length;
    const closes = (html.match(/<\/div>/g) || []).length;
    if (opens !== closes) t("раздел " + route + ": <div> сбалансированы", false, opens + "/" + closes);
    const junk = html.match(/undefined|NaN|\[object Object\]|null/g);
    if (junk) t("раздел " + route + ": нет мусора", false, junk.join(","));
    step();
  }, 70);
}

function finish() {
  console.log(fails ? "\nПроблем: " + fails : "\nВсе разделы кабинета рендерятся корректно.");
  process.exit(fails ? 1 : 0);
}

setTimeout(function () { step(); }, 80);
setTimeout(runAsync, 80);
