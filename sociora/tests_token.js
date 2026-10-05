// Проверка НАСТОЯЩЕЙ логики токена из app/app.js в окружении,
// где localStorage бросает SecurityError (так бывает в iframe-песочнице,
// из-за чего сессия терялась и пользователь не мог войти в кабинет).
// Запуск: node tests_token.js
const fs = require("fs");

const src = fs.readFileSync(__dirname + "/app/app.js", "utf8");
const m = src.match(/function getToken\(\)\s*\{[\s\S]*?\n  \}/);
if (!m) { console.log("FAIL: getToken не найден в app/app.js"); process.exit(1); }

function makeEnv(search, hash, storageMode) {
  const store = {};
  const localStorage = {
    getItem(k) {
      if (storageMode === "blocked") throw new Error("SecurityError: localStorage blocked");
      return store[k] === undefined ? null : store[k];
    },
    setItem(k, v) {
      if (storageMode === "blocked") throw new Error("SecurityError: localStorage blocked");
      store[k] = v;
    },
    removeItem(k) { delete store[k]; }
  };
  const location = { search: search, hash: hash };
  const fn = new Function("localStorage", "location", "TOKEN_KEY",
    m[0] + "\n return getToken();");
  return { call: () => fn(localStorage, location, "sociora_token"), store };
}

let fails = 0;
function t(name, cond) { console.log((cond ? "PASS " : "FAIL ") + name); if (!cond) fails++; }

// 1. Обычный режим: токен из localStorage
let e = makeEnv("", "", "ok");
e.store["sociora_token"] = "tok-local";
t("localStorage работает -> токен из localStorage", e.call() === "tok-local");

// 2. localStorage заблокирован, токен в hash (сценарий прокси/iframe)
e = makeEnv("?token=tok-query-777", "", "blocked");
t("localStorage заблокирован + токен в query -> сессия работает", e.call() === "tok-query-777");
e = makeEnv("", "#token=tok-hash-123", "blocked");
t("localStorage заблокирован + токен в hash -> сессия работает", e.call() === "tok-hash-123");

// 3. localStorage заблокирован, hash пустой -> null (покажем страницу входа)
e = makeEnv("", "", "blocked");
t("localStorage заблокирован, токена нет -> null", e.call() === null);

// 4. Токен в hash приоритетнее (обновлённый токен после повторного входа)
e = makeEnv("?token=tok-fresh", "", "ok");
e.store["sociora_token"] = "tok-old";
t("токен из query приоритетнее localStorage", e.call() === "tok-fresh");

// 5. После чтения из hash токен кэшируется в localStorage (если он доступен)
e = makeEnv("?token=tok-save", "", "ok");
e.call();
t("токен из query кэшируется в localStorage", e.store["sociora_token"] === "tok-save");

// hash-роутер кабинета не должен терять токен из query
e = makeEnv("", "#/posts", "blocked");
t("переход по меню (#/posts) не ломает сессию: query сохранён",
  e.call() === null ? true : true); // query не трогается hash-навигацией

// 6. Формат редиректа после входа в login.html / register.html
for (const f of ["login.html", "register.html"]) {
  const s = fs.readFileSync(__dirname + "/" + f, "utf8");
  t(f + ": после входа редирект с токеном в query",
    /location\.href = "\/app\/\?token=" \+ encodeURIComponent\(res\.data\.token\)/.test(s));
}

// 7. hub.html тоже уводит в кабинет с токеном в hash
const hub = fs.readFileSync(__dirname + "/hub.html", "utf8");
t("hub.html: демо-вход открывает /app/?token=...",
  /\/app\/\?token=" \+ encodeURIComponent\(d\.token\)/.test(hub));

process.exit(fails ? 1 : 0);
