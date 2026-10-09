/* ============================================================
   Sociora — личный кабинет. Ванильный JS, без зависимостей.
   Регистрации и входа нет: сервер сам определяет владельца кабинета.
   ============================================================ */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  var view = $("#view");

  var TITLES = {
    dashboard: "Дашборд", posts: "Лента постов", quick: "Быстрый пост",
    analytics: "Аналитика", competitors: "Конкуренты", learning: "Самообучение",
    kb: "База знаний", themes: "Темы", schedule: "Расписание", socials: "Соцсети",
    settings: "Настройки", billing: "Биллинг", profile: "Профиль", support: "Поддержка"
  };

  var STATUS = {
    draft: { label: "Черновик", cls: "draft" },
    approved: { label: "На проверке", cls: "approved" },
    scheduled: { label: "Запланирован", cls: "scheduled" },
    published: { label: "Опубликован", cls: "published" }
  };
  var NETWORKS = { telegram: "Telegram", vk: "ВКонтакте", max: "MAX" };
  var PLAN_LABEL = { trial: "Trial", start: "Start", pro: "Pro", business: "Business" };

  var state = {
    user: null, stats: null, projects: [],
    route: "dashboard", filter: "all", analyticsNetwork: "all",
    quickMode: "scratch", quickPost: null, quickPreviewNet: "telegram"
  };

  /* ---------------- утилиты ---------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) {
    if (typeof n === "string") { return n; }
    return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  function dt(s) {
    if (!s) return "—";
    var d = new Date(String(s).replace(" ", "T"));
    if (isNaN(d)) return String(s).slice(0, 16);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) + ", " +
      d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  function dshort(s) {
    if (!s) return "—";
    var d = new Date(String(s).replace(" ", "T"));
    if (isNaN(d)) return String(s).slice(0, 10);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  }
  function toast(msg, isError) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("error", !!isError);
    t.hidden = false;
    requestAnimationFrame(function () { t.classList.add("show"); });
    clearTimeout(t._timer);
    t._timer = setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () { t.hidden = true; }, 400);
    }, 3200);
  }
  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin"
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!d.ok) { throw new Error(d.error || "Ошибка запроса"); }
        return d;
      });
    });
  }
  function planName(p) { return PLAN_LABEL[p] || p; }
  function statusChip(s) {
    var st = STATUS[s] || { label: s, cls: "draft" };
    return '<span class="chip ' + st.cls + '">' + esc(st.label) + "</span>";
  }
  function netChips(networks) {
    var nets = [];
    try { nets = JSON.parse(networks || "[]"); } catch (e) { nets = []; }
    if (!nets.length) return "";
    return nets.map(function (n) { return '<span class="chip rubric">' + esc(NETWORKS[n] || n) + "</span>"; }).join("");
  }
  function projectName(id) {
    for (var i = 0; i < state.projects.length; i++) {
      if (state.projects[i].id === id) return state.projects[i].name;
    }
    return "—";
  }
  function projectOptions(selected) {
    return state.projects.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === selected ? " selected" : "") + ">" + esc(p.name) + "</option>";
    }).join("");
  }
  function noProjects() {
    return '<div class="empty">Пока нет проектов. Создайте первый — ИИ проанализирует нишу и предложит темы.<div style="margin-top:14px"><a class="btn btn-primary btn-sm" href="#/themes">Создать проект</a></div></div>';
  }

  /* ============================================================
     ПРЕДСТАВЛЕНИЯ
     ============================================================ */
  var views = {};

  /* ---------- Дашборд ---------- */
  views.dashboard = function () {
    var u = state.user, s = state.stats || {};
    var limit = (u.limits && u.limits.posts) || 1;
    var used = Math.max(0, limit - u.posts_balance);
    var pct = Math.min(100, Math.round(used / limit * 100));
    var recent = (state.posts || []).slice(0, 5);
    return '' +
      '<div class="page-head">' +
        '<div class="grow"><h1>Здравствуйте! 👋</h1>' +
        '<div class="sub">Вот что происходит с вашим контентом</div></div>' +
        '<a class="btn btn-primary" href="#/quick">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 5v14M5 12h14"/></svg>' +
          "Новый пост</a>" +
      "</div>" +

      '<div class="kpi-grid">' +
        kpi("purple", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7l-5-5Z"/><path d="M14 2v5h5M9 13h6M9 17h4"/></svg>', s.posts_total_all || 0, "Всего постов") +
        kpi("amber", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>', s.posts_approved || 0, "На проверке") +
        kpi("blue", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>', s.posts_scheduled || 0, "Запланировано") +
        kpi("green", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>', s.posts_published || 0, "Опубликовано") +
      "</div>" +

      '<div class="card"><div class="plan-card">' +
        '<div class="plan-left">' +
          '<div class="plan-badges">' +
            '<span class="badge accent">' + esc(planName(u.plan)) + "</span>" +
            '<span class="badge">' + esc(u.limits && u.limits.socials) + " соцсети</span>" +
            '<span class="badge">' + esc(u.limits && u.limits.projects) + " проектов</span>" +
          "</div>" +
          '<div class="big">' + fmt(u.posts_balance) + " постов осталось</div>" +
          '<div class="small">из ' + fmt(limit) + " в этом периоде</div>" +
          '<div class="progress"><i style="width:' + pct + '%"></i></div>' +
        "</div>" +
        '<a class="btn btn-ghost" href="#/billing">Управление подпиской →</a>' +
      "</div></div>" +

      '<div class="card"><div class="card-head">' +
        "<h2>Последние посты</h2><div class=grow></div>" +
        '<a class="link" href="#/posts">Все посты →</a></div>' +
        (recent.length
          ? '<div class="post-list">' + recent.map(postRow).join("") + "</div>"
          : '<div class="empty">Постов пока нет. Нажмите «Новый пост» — ИИ напишет первый текст за пару секунд.</div>') +
      "</div>";
  };

  function kpi(cls, icon, value, label) {
    return '<div class="kpi"><div class="kpi-ico ' + cls + '">' + icon + "</div>" +
      "<div><b>" + fmt(value) + "</b><span>" + esc(label) + "</span></div></div>";
  }

  function postRow(p) {
    return '<div class="post-row"><div class="grow">' +
      '<div class="post-title">' + esc(p.title) + "</div>" +
      '<div class="post-meta">' + statusChip(p.status) +
        '<span class="chip rubric">' + esc(p.rubric || "ИИ") + "</span>" +
        netChips(p.networks) +
        "<span>" + esc(projectName(p.project_id)) + "</span>" +
        "<span>" + dt(p.created_at) + "</span>" +
        (p.status === "published" ? "<span>👁 " + fmt(p.views) + "</span>" : "") +
      "</div>" +
      '<div class="post-snippet">' + esc(String(p.body || "").slice(0, 220)) + "</div>" +
      "</div>" +
      '<div class="row-actions">' + postActions(p) + "</div>" +
      "</div>";
  }

  function postActions(p) {
    var a = "";
    if (p.status === "draft") {
      a += '<button class="btn btn-ghost btn-sm" data-act="approve" data-id="' + p.id + '">На проверку</button>';
    }
    if (p.status === "draft" || p.status === "approved") {
      a += '<button class="btn btn-primary btn-sm" data-act="publish" data-id="' + p.id + '">Опубликовать</button>';
    }
    if (p.status !== "published") {
      a += '<button class="btn btn-ghost btn-sm" data-act="schedule" data-id="' + p.id + '">В расписание</button>';
    }
    a += '<button class="btn btn-ghost btn-sm" data-act="regenerate" data-id="' + p.id + '">Перегенерировать</button>';
    a += '<button class="btn btn-danger btn-sm" data-act="delete" data-id="' + p.id + '">Удалить</button>';
    return a;
  }

  /* ---------- Лента постов ---------- */
  views.posts = function () {
    var f = state.filter;
    var list = (state.posts || []).filter(function (p) { return f === "all" || p.status === f; });
    var counts = { all: (state.posts || []).length, draft: 0, approved: 0, scheduled: 0, published: 0 };
    (state.posts || []).forEach(function (p) { counts[p.status] = (counts[p.status] || 0) + 1; });
    return '' +
      '<div class="page-head"><div class="grow"><h1>Лента постов</h1>' +
      '<div class="sub">Все тексты, которые написал ИИ, и их статусы</div></div>' +
      '<a class="btn btn-primary" href="#/quick">Новый пост</a></div>' +
      '<div class="filters">' +
        filterBtn("all", "Все", counts.all) + filterBtn("draft", "Черновики", counts.draft) +
        filterBtn("approved", "На проверке", counts.approved) +
        filterBtn("scheduled", "Запланированы", counts.scheduled) +
        filterBtn("published", "Опубликованы", counts.published) +
      "</div>" +
      (list.length
        ? '<div class="post-list">' + list.map(postRow).join("") + "</div>"
        : '<div class="empty">В этом фильтре пока пусто.</div>');
  };
  function filterBtn(key, label, count) {
    return '<button data-filter="' + key + '" class="' + (state.filter === key ? "active" : "") + '">' +
      esc(label) + " · " + count + "</button>";
  }

  /* ---------- Быстрый пост (Поэтапно: 1. Текст → 2. Размещение без токена) ---------- */
  views.quick = function () {
    var p = state.projects[0];
    var m = state.quickMode || "scratch";
    var hasDraft = !!state.quickPost;
    var labels = {
      scratch: "Своя тема или задумка (необязательно — если пусто, ИИ выберет сам)",
      rewrite: "Вставьте текст, который нужно переписать своими словами",
      source: "Вставьте новость, заметку или ссылку — ИИ соберёт пост с выводом"
    };
    var placeholders = {
      scratch: "Например: 5 ошибок при уходе за волосами зимой",
      rewrite: "Вставьте сюда чужой пост или черновик для рерайта…",
      source: "Вставьте сюда текст новости, тезисы статьи или ссылку на первоисточник…"
    };
    return '' +
      '<div class="page-head"><div class="grow"><h1>Быстрый пост</h1>' +
      '<div class="sub">Поэтапно и без токенов: 1) создаём и проверяем текст → 2) нажимаем «Разместить» через браузер</div></div></div>' +
      '<div class="steps-bar">' +
        '<div class="step-pill ' + (hasDraft ? "done" : "active") + '">' +
          '<span class="step-num">' + (hasDraft ? "✓" : "1") + "</span>" +
          '<div><b>Этап 1. Создать и проверить текст</b><span>С нуля, рерайт или по источнику (как в ContentPilot)</span></div>' +
        "</div>" +
        '<div class="step-pill ' + (hasDraft ? "active" : "") + '">' +
          '<span class="step-num">2</span>' +
          '<div><b>Этап 2. Нажать «Разместить» (без токена)</b><span>Программа сама публикует через ваш браузер как человек</span></div>' +
        "</div>" +
      "</div>" +
      (state.projects.length
        ? '<div class="card">' +
            '<div class="card-head"><h2>Этап 1. Подготовка текста</h2><span class="badge accent">без токенов</span></div>' +
            '<div class="mode-tabs">' +
              '<button type="button" class="mode-tab' + (m === "scratch" ? " active" : "") + '" data-qmode="scratch">01 С нуля</button>' +
              '<button type="button" class="mode-tab' + (m === "rewrite" ? " active" : "") + '" data-qmode="rewrite">02 Рерайт</button>' +
              '<button type="button" class="mode-tab' + (m === "source" ? " active" : "") + '" data-qmode="source">03 По источнику</button>' +
            "</div>" +
            '<div class="form-row">' +
              '<div class="field"><label>Проект</label><select id="q-project">' + projectOptions(p && p.id) + "</select></div>" +
              '<div class="field"><label>Рубрика (необязательно)</label><select id="q-rubric">' +
                '<option value="">Любая — на выбор ИИ</option>' +
                ["Экспертный", "Полезный", "Продающий", "История", "Развлекательный", "Новости"].map(function (r) {
                  return '<option>' + r + "</option>";
                }).join("") +
              "</select></div>" +
            "</div>" +
            '<div class="field"><label>' + esc(labels[m]) + '</label>' +
              '<textarea id="q-source" placeholder="' + esc(placeholders[m]) + '" style="min-height:74px"></textarea>' +
            "</div>" +
            '<button class="btn btn-primary" id="q-generate">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>' +
              "Сгенерировать пост</button>" +
            '<div class="hint">Списание: 1 пост с баланса. Сначала ИИ создаст текст, затем вы проверите его и нажмёте «Разместить».</div>' +
            '<div id="q-result" style="margin-top:18px">' + (hasDraft ? renderQuickStage2(state.quickPost) : "") + "</div>" +
          "</div>"
        : noProjects());
  };

  function renderQuickStage2(p) {
    if (!p) return "";
    var pnet = state.quickPreviewNet || "telegram";
    var chanName = projectName(p.project_id) || "Мой канал";
    var firstChar = chanName.charAt(0).toUpperCase();
    return '' +
      '<div style="border-top:1px solid var(--line);padding-top:18px;margin-top:6px">' +
        '<div class="card-head"><h2>Проверка текста и Этап 2: Размещение без токена</h2>' +
          statusChip(p.status) +
        "</div>" +
        '<div class="grid-2">' +
          '<div>' +
            '<div class="field"><label>Заголовок поста (можно подправить руками)</label>' +
              '<input id="q-edit-title" value="' + esc(p.title) + '">' +
            "</div>" +
            '<div class="field"><label>Текст поста</label>' +
              '<textarea id="q-edit-body" style="min-height:190px">' + esc(p.body) + "</textarea>" +
            "</div>" +
            '<div class="hint">Промпт для картинки: ' + esc(p.image_prompt || "—") + "</div>" +
          "</div>" +
          '<div>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
              '<b style="font-size:13px;color:var(--text-2)">Глазами читателя (макет):</b>' +
              '<div class="mode-tabs" style="margin:0">' +
                [["telegram", "Telegram"], ["vk", "VK"], ["max", "MAX"]].map(function (n) {
                  return '<button type="button" class="mode-tab' + (pnet === n[0] ? " active" : "") + '" data-pnet="' + n[0] + '" style="padding:5px 10px;font-size:12px">' + n[1] + "</button>";
                }).join("") +
              "</div>" +
            "</div>" +
            '<div class="phone-mock">' +
              '<div class="phone-top"><span>9:41</span><span>' + esc(NETWORKS[pnet] || pnet) + " · Предпросмотр</span></div>" +
              '<div class="phone-chan"><span class="phone-ava">' + esc(firstChar) + "</span><div><b style=\"font-size:13.5px;display:block\">" + esc(chanName) + '</b><span style="font-size:11.5px;color:var(--muted)">ваш канал · без токенов</span></div></div>' +
              '<div class="phone-msg"><b id="q-mock-title">' + esc(p.title) + '</b><span id="q-mock-body">' + esc(p.body) + '</span><div class="phone-time">сейчас · ✓✓</div></div>' +
            "</div>" +
          "</div>" +
        "</div>" +
        '<div style="margin-top:18px;padding:16px;border-radius:14px;background:var(--bg);border:1px solid var(--line-2)">' +
          '<b style="font-size:14.5px;display:block;margin-bottom:4px">Этап 2. Куда разместить этот пост? (через браузер, без токенов)</b>' +
          '<span style="font-size:13px;color:var(--muted)">Программа использует ваш вход в браузере и публикует пост сама, как человек:</span>' +
          '<div class="net-checks">' +
            '<label class="net-check"><input type="checkbox" class="q-net-cb" value="telegram" checked> Telegram Web</label>' +
            '<label class="net-check"><input type="checkbox" class="q-net-cb" value="vk" checked> ВКонтакте</label>' +
            '<label class="net-check"><input type="checkbox" class="q-net-cb" value="max"> MAX Web</label>' +
          "</div>" +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
            '<button class="btn btn-primary" id="q-publish-browser" data-id="' + p.id + '">🚀 Разместить через браузер (без токена)</button>' +
            '<button class="btn btn-ghost" id="q-copy-open" data-id="' + p.id + '">📋 Скопировать текст + открыть соцсеть в вкладке</button>' +
            '<button class="btn btn-ghost btn-sm" data-act="regenerate" data-id="' + p.id + '">Перегенерировать</button>' +
          "</div>" +
          '<div id="q-delivery"></div>' +
        "</div>" +
      "</div>";
  }

  /* ---------- Аналитика ---------- */
  views.analytics = function () {
    return '' +
      '<div class="page-head"><div class="grow"><h1>Аналитика</h1>' +
      '<div class="sub">Просмотры, подписчики и вовлечённость по всем сетям</div></div></div>' +
      '<div class="filters">' +
        [["all", "Общий"], ["vk", "ВКонтакте"], ["telegram", "Telegram"], ["max", "MAX"]].map(function (n) {
          return '<button data-net="' + n[0] + '" class="' + (state.analyticsNetwork === n[0] ? "active" : "") + '">' + n[1] + "</button>";
        }).join("") +
      "</div>" +
      '<div id="an-body"><div class="loading">Считаем статистику…</div></div>';
  };

  function renderAnalytics() {
    var box = $("#an-body");
    if (!box) return;
    box.innerHTML = '<div class="loading">Считаем статистику…</div>';
    api("GET", "/api/analytics?network=" + state.analyticsNetwork).then(function (d) {
      var o = d.overall;
      var max = Math.max.apply(null, d.series.map(function (s) { return s.views; }).concat([1]));
      box.innerHTML = '' +
        '<div class="kpi-grid">' +
          kpi("purple", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>', o.views, "Просмотры") +
          kpi("blue", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9" r="2.6"/><path d="M15 20a5.5 5.5 0 0 1 6.5-5.4"/></svg>', o.subscribers, "Подписчики") +
          kpi("green", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8Z"/></svg>', o.er + "%", "Вовлечённость") +
          kpi("amber", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l2-5.6a8.4 8.4 0 0 1 3.5-11.3A8.4 8.4 0 0 1 21 11.5Z"/></svg>', o.comments, "Комментарии") +
        "</div>" +

        '<div class="card"><div class="card-head"><h2>Просмотры по дням</h2></div>' +
          '<div class="chart">' + d.series.map(function (s) {
            return '<div class="col"><b>' + fmt(s.views) + '</b><div class="stack"><i style="height:' +
              Math.round(s.views / max * 100) + '%"></i></div><small>' + esc(s.day) + "</small></div>";
          }).join("") + "</div></div>" +

        '<div class="grid-2">' +
          '<div class="card"><div class="card-head"><h2>Голос канала</h2></div>' +
            (d.voice.length
              ? d.voice.map(function (v) {
                  return '<div class="bar-row"><span class="name">' + esc(v.name) + '</span>' +
                    '<span class="track"><i style="width:' + v.pct + '%"></i></span>' +
                    '<span class="val">' + fmt(v.views) + "</span></div>";
                }).join("")
              : '<div class="empty">Опубликуйте посты — увидим, какие рубрики заходят лучше.</div>') +
          "</div>" +
          '<div class="card"><div class="card-head"><h2>Топ постов</h2></div>' +
            (d.top_posts.length
              ? '<div class="list-plain">' + d.top_posts.map(function (p) {
                  return '<div class="item"><div class="grow"><b>' + esc(p.title.slice(0, 60)) + "</b>" +
                    "<span>👁 " + fmt(p.views) + " · ❤ " + fmt(p.likes) + " · 💬 " + fmt(p.comments) + "</span></div>" +
                    statusChip(p.status) + "</div>";
                }).join("") + "</div>"
              : '<div class="empty">Пока нет опубликованных постов.</div>') +
          "</div>" +
        "</div>" +

        '<div class="card"><div class="card-head">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:20px;height:20px;color:var(--accent)"><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5.9 1.2.9 1.9V17h5.4v-1.3c0-.7.3-1.4.9-1.9A6 6 0 0 0 12 3Z"/><path d="M9.5 20h5"/></svg>' +
          "<h2>AI-анализ</h2></div>" +
          '<div style="font-size:14.5px;color:var(--text-2);line-height:1.65">' + esc(d.insight) + "</div>" +
        "</div>";
    }).catch(function (e) {
      box.innerHTML = '<div class="empty">Не удалось загрузить аналитику: ' + esc(e.message) + "</div>";
    });
  }

  /* ---------- Конкуренты ---------- */
  views.competitors = function () {
    var p = state.projects[0];
    return '' +
      '<div class="page-head"><div class="grow"><h1>Конкуренты</h1>' +
      '<div class="sub">Мониторинг ниши: что публикуют конкуренты и где есть окно возможностей</div></div></div>' +
      (state.projects.length
        ? '<div class="card"><div class="form-row">' +
            '<div class="field"><label>Проект</label><select id="c-project">' + projectOptions(p && p.id) + "</select></div>" +
            '<div class="field"><label>&nbsp;</label><button class="btn btn-primary" id="c-run" style="width:100%">Запустить анализ ниши</button></div>' +
          '</div><div id="c-result"></div></div>' +
          '<div class="grid-3" style="margin-top:16px">' +
            compCard("Кофейня рядом", "12 постов/мес", "↑ растёт") +
            compCard("Салон на Ленина", "8 постов/мес", "→ стабильно") +
            compCard("Бьюти-студия", "4 поста/мес", "↓ сдает") +
          "</div>"
        : noProjects());
  };
  function compCard(name, posts, trend) {
    return '<div class="card"><div class="card-head"><h2 style="font-size:15px">' + esc(name) + "</h2></div>" +
      '<div style="font-size:13.5px;color:var(--muted)">' + esc(posts) + "</div>" +
      '<div style="margin-top:8px"><span class="badge green">' + esc(trend) + "</span></div></div>";
  }

  /* ---------- Самообучение ---------- */
  views.learning = function () {
    var themes = (state.themes || []).length;
    var posts = (state.posts || []).length;
    return '' +
      '<div class="page-head"><div class="grow"><h1>Самообучение</h1>' +
      '<div class="sub">ИИ изучает ваши посты и пишет дальше в tone of voice вашего канала</div></div></div>' +
      '<div class="kpi-grid">' +
        kpi("purple", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M14 3v5h5M8 13h8M8 17h5"/></svg>', posts, "Постов изучено") +
        kpi("amber", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5.9 1.1.9 1.8h5.2c0-.7.3-1.3.9-1.8A6 6 0 0 0 12 3Z"/></svg>', themes, "Тем в работе") +
        kpi("blue", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>', state.user ? state.user.tone : "—", "Тон голоса") +
        kpi("green", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>', (state.stats && state.stats.views) || 0, "Просмотров всего") +
      "</div>" +
      '<div class="card"><div class="card-head"><h2>Профиль голоса канала</h2></div>' +
        '<div class="bar-row"><span class="name">Сторителлинг</span><span class="track"><i style="width:82%"></i></span><span class="val">82%</span></div>' +
        '<div class="bar-row"><span class="name">Экспертность</span><span class="track"><i style="width:64%"></i></span><span class="val">64%</span></div>' +
        '<div class="bar-row"><span class="name">Польза</span><span class="track"><i style="width:57%"></i></span><span class="val">57%</span></div>' +
        '<div class="bar-row"><span class="name">Продажи</span><span class="track"><i style="width:31%"></i></span><span class="val">31%</span></div>' +
        '<div class="hint">Профиль обновляется автоматически на свежей статистике: чем больше постов, тем точнее ИИ попадает в тон канала.</div>' +
      "</div>" +
      '<div class="card"><div class="card-head"><h2>Как это работает</h2></div>' +
        '<div class="list-plain">' +
          learnItem("ИИ пишет в голосе вашего канала", "Тон, темы и приёмы подбираются под вашу аудиторию, а не по шаблону.") +
          learnItem("Учится на ваших постах", "Анализируем, что заходит: истории, экспертиза, полезность или развлечение.") +
          learnItem("Чем дольше ведёте канал, тем точнее", "Каждая публикация уточняет профиль — ручной настройки не нужно.") +
        "</div></div>";
  };
  function learnItem(title, text) {
    return '<div class="item"><div class="grow"><b>' + esc(title) + "</b><span>" + esc(text) + "</span></div></div>";
  }

  /* ---------- База знаний ---------- */
  views.kb = function () {
    var items = [
      ["Быстрый старт за 5 минут", "Проект → анализ ниши → первая тема → пост → публикация.", "#/quick"],
      ["Как писать посты, которые заходят", "Сторителлинг + польза + мягкий призыв. ИИ предложит рубрики.", "#/themes"],
      ["Расписание и контент-план", "План на неделю в один клик: 7 постов сразу в статусе «запланирован».", "#/schedule"],
      ["Подключение соцсетей без токенов", "Telegram Web, ВКонтакте и MAX через обычный вход в браузере (как человек).", "#/socials"],
      ["Тарифы и пакеты постов", "Trial, Start, Pro, Business и докуповые пакеты постов.", "#/billing"]
    ];
    return '' +
      '<div class="page-head"><div class="grow"><h1>База знаний</h1>' +
      '<div class="sub">Короткие инструкции по всем разделам кабинета</div></div></div>' +
      '<div class="card"><div class="list-plain">' +
        items.map(function (i) {
          return '<div class="item"><div class="grow"><b>' + esc(i[0]) + "</b><span>" + esc(i[1]) + "</span></div>" +
            '<a class="btn btn-ghost btn-sm" href="' + i[2] + '">Открыть</a></div>';
        }).join("") +
      "</div></div>" +
      '<div class="card"><div class="card-head"><h2>Частые вопросы</h2></div>' +
        '<div class="list-plain">' +
          learnItem("Сколько постов в тарифе?", "Trial — 15, Start — 50, Pro — 150, Business — 300 в месяц. Не хватает — докупите пакет.") +
          learnItem("Что если ИИ написал не то?", "Нажмите «Перегенерировать» и добавьте комментарий: «сделай короче», «больше пользы».") +
          learnItem("Можно ли править текст вручную?", "Да, любой пост редактируется до публикации.") +
          learnItem("Где посмотреть статистику?", "Раздел «Аналитика»: просмотры, охваты, ER и топ постов по дням.") +
        "</div></div>";
  }

  /* ---------- Темы ---------- */
  views.themes = function () {
    var p = state.projects[0];
    return '' +
      '<div class="page-head"><div class="grow"><h1>Темы</h1>' +
      '<div class="sub">ИИ анализирует нишу и предлагает направления для контента</div></div></div>' +
      '<div class="card">' +
        '<div class="form-row">' +
          '<div class="field"><label>Проект</label><select id="t-project">' +
            (state.projects.length ? projectOptions(p && p.id) : '<option value="">— нет проектов —</option>') +
          "</select></div>" +
          '<div class="field"><label>&nbsp;</label><button class="btn btn-ghost" id="t-analyze" style="width:100%">Переанализировать нишу</button></div>' +
        "</div>" +
        '<div id="t-themes"></div>' +
        '<div style="margin-top:18px;border-top:1px solid var(--line);padding-top:18px">' +
          "<h2 style=\"font-size:15.5px;margin-bottom:12px\">Новый проект</h2>" +
          '<div class="form-row">' +
            '<div class="field"><label>Название</label><input id="n-name" placeholder="Например: Салон Лилия"></div>' +
            '<div class="field"><label>Ниша</label><input id="n-niche" placeholder="салон красоты"></div>' +
          "</div>" +
          '<button class="btn btn-primary" id="n-create">Создать проект</button>' +
        "</div>" +
      "</div>";
  };

  function loadThemes() {
    var box = $("#t-themes");
    if (!box) return;
    var pid = $("#t-project") ? $("#t-project").value : null;
    if (!pid) { box.innerHTML = noProjects(); return; }
    box.innerHTML = '<div class="loading">Загружаем темы…</div>';
    api("GET", "/api/projects/" + pid).then(function (d) {
      state.themes = d.themes;
      if (!d.themes.length) {
        box.innerHTML = '<div class="empty">Тем пока нет — нажмите «Переанализировать нишу».</div>';
        return;
      }
      box.innerHTML = '<div class="list-plain">' + d.themes.map(function (t) {
        return '<div class="theme-item"><span class="chip rubric">' + esc(t.rubric || "ИИ") + "</span>" +
          '<div class="grow"><b>' + esc(t.title) + "</b></div>" +
          '<button class="btn btn-ghost btn-sm" data-write="' + t.id + '" data-project="' + pid + '">Написать пост</button></div>';
      }).join("") + "</div>";
    }).catch(function (e) {
      box.innerHTML = '<div class="empty">' + esc(e.message) + "</div>";
    });
  }

  /* ---------- Расписание ---------- */
  views.schedule = function () {
    var scheduled = (state.posts || []).filter(function (p) { return p.status === "scheduled"; });
    return '' +
      '<div class="page-head"><div class="grow"><h1>Расписание</h1>' +
      '<div class="sub">Посты, которые уйдут в соцсети автоматически</div></div>' +
      (state.projects.length ? '<button class="btn btn-primary" id="s-week">Составить план на неделю</button>' : "") +
      "</div>" +
      (scheduled.length
        ? '<div class="card"><div class="post-list">' + scheduled.map(postRow).join("") + "</div></div>"
        : '<div class="card"><div class="empty">В расписании пусто. Одобрите посты и нажмите «В расписание» — или сразу составьте план на неделю.</div></div>');
  }

  /* ---------- Соцсети ---------- */
  views.socials = function () {
    return '' +
      '<div class="page-head"><div class="grow"><h1>Соцсети</h1>' +
      '<div class="sub">Подключение без API-токенов: войдите один раз через браузер как обычный человек, дальше программа размещает сама</div></div></div>' +
      '<div id="so-body"><div class="loading">Загружаем соцсети…</div></div>';
  };

  function renderSocials() {
    var box = $("#so-body");
    if (!box) return;
    api("GET", "/api/socials").then(function (d) {
      var limits = state.user.limits || {};
      var left = Math.max(0, (limits.socials || 1) - d.socials.length);
      var browserNets = [
        ["telegram", "Telegram Web", "https://web.telegram.org/a/", "Вход по QR-коду с телефона — без создания ботов и токенов"],
        ["vk", "ВКонтакте", "https://vk.com/", "Обычный вход в свой аккаунт ВК через браузер"],
        ["max", "MAX Web", "https://web.max.ru/", "Вход по QR-коду в веб-версию MAX без ключей API"]
      ];
      box.innerHTML = '' +
        '<div class="card">' +
          '<div class="card-head"><h2>Шаг 1. Браузерный вход (один раз, без токенов)</h2><span class="badge green">работает как человек</span></div>' +
          '<div class="hint" style="margin-bottom:12px">На вашем компьютере программа открывает постоянный профиль браузера (папка <b>data/browser_profile</b>). Вы один раз входите в соцсеть как обычно, и дальше при нажатии «Разместить» программа сама публикует посты через этот браузер.</div>' +
          '<div class="grid-3">' +
            browserNets.map(function (b) {
              return '<div class="plan-opt">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
                  "<b>" + esc(b[1]) + '</b><span class="badge green">сессия готова</span>' +
                "</div>" +
                '<div style="font-size:12.5px;color:var(--muted);margin-bottom:12px;line-height:1.45">' + esc(b[3]) + "</div>" +
                '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
                  '<button class="btn btn-primary btn-sm" data-browser-login="' + b[0] + '" data-url="' + b[2] + '">Войти через браузер</button>' +
                  '<a class="btn btn-ghost btn-sm" href="' + b[2] + '" target="_blank" rel="noopener">Открыть ↗</a>' +
                "</div>" +
              "</div>";
            }).join("") +
          "</div>" +
        "</div>" +

        (d.socials.length
          ? '<div class="card"><div class="card-head"><h2>Подключено (' + d.socials.length + " из " + (limits.socials || 1) + ")</h2></div>" +
            '<div class="list-plain">' + d.socials.map(function (s) {
              var wurl = s.web_url || "https://web.telegram.org/a/";
              return '<div class="item"><span class="chip rubric">' + esc(NETWORKS[s.network] || s.network) + "</span>" +
                '<div class="grow"><b>' + esc(s.channel) + '</b><span>' + esc(s.project_name || "") + " · без токена (через браузер)</span></div>" +
                '<a class="btn btn-ghost btn-sm" href="' + esc(wurl) + '" target="_blank" rel="noopener">Открыть ↗</a>' +
                '<button class="btn btn-danger btn-sm" data-unlink="' + s.id + '">Отключить</button></div>';
            }).join("") + "</div></div>"
          : '<div class="card"><div class="empty">Соцсети пока не подключены.</div></div>') +

        '<div class="card"><div class="card-head"><h2>Подключить соцсеть</h2>' +
          (left ? '<span class="badge green">доступно: ' + left + "</span>" : '<span class="badge amber">лимит тарифа</span>') + "</div>" +
          (left
            ? '<div class="form-row">' +
                '<div class="field"><label>Сеть</label><select id="so-net">' +
                  '<option value="telegram">Telegram</option><option value="vk">ВКонтакте</option><option value="max">MAX</option></select></div>' +
                '<div class="field"><label>Проект</label><select id="so-project">' + projectOptions() + "</select></div>" +
              "</div>" +
              '<div class="form-row">' +
                '<div class="field"><label>Ссылка на ваш канал или группу (без токена)</label><input id="so-channel" placeholder="@my_channel или https://vk.com/club123"></div>' +
                '<div class="field"><label>Способ подключения</label><input value="Через браузер (как человек — токен не нужен)" disabled><input type="hidden" id="so-token" value="browser-session"></div>' +
              "</div>" +
              '<button class="btn btn-primary" id="so-connect">Подключить без токена</button>' +
              '<div class="hint">Никаких API-ключей и токенов не нужно: просто укажите адрес вашей группы или канала.</div>'
            : '<div class="empty">На текущем тарифе лимит соцсетей исчерпан. Перейдите в <a href="#/billing" style="color:var(--accent-ink);font-weight:600">Биллинг</a>, чтобы повысить тариф.</div>') +
        "</div>";
      bindEvents();
    }).catch(function (e) {
      box.innerHTML = '<div class="empty">' + esc(e.message) + "</div>";
    });
  }

  /* ---------- Настройки ---------- */
  views.settings = function () {
    var u = state.user;
    var tones = ["дружелюбный", "экспертный", "продающий", "вдохновляющий", "лаконичный", "с юмором"];
    return '' +
      '<div class="page-head"><div class="grow"><h1>Настройки</h1>' +
      '<div class="sub">Имя и тон голоса, в котором ИИ пишет посты</div></div></div>' +
      '<div class="card">' +
        '<div class="field"><label>Как к вам обращаться</label><input id="s-name" value="' + esc(u.name) + '"></div>' +
        '<div class="field"><label>Тон голоса канала</label><select id="s-tone">' +
          tones.map(function (t) {
            return '<option' + (t === u.tone ? " selected" : "") + ">" + t + "</option>";
          }).join("") + "</select></div>" +
        '<div class="hint">Тон применяется ко всем новым постам во всех проектах.</div>' +
        '<div style="margin-top:16px"><button class="btn btn-primary" id="s-save">Сохранить</button></div>' +
      "</div>";
  }

  /* ---------- Биллинг ---------- */
  views.billing = function () {
    return '' +
      '<div class="page-head"><div class="grow"><h1>Биллинг</h1>' +
      '<div class="sub">Тариф, пакеты постов и история операций</div></div></div>' +
      '<div id="b-body"><div class="loading">Загружаем тарифы…</div></div>';
  };

  function renderBilling() {
    var box = $("#b-body");
    if (!box) return;
    api("GET", "/api/tariffs").then(function (d) {
      var plans = d.plans;
      var order = ["trial", "start", "pro", "business"];
      var feats = {
        trial: ["15 постов в подарок", "1 соцсеть", "1 проект", "до 10 тем"],
        start: ["50 постов в месяц", "1 проект", "1 соцсеть", "до 10 тем", "Картинки от ИИ"],
        pro: ["150 постов в месяц", "3 соцсети", "до 30 тем", "Аналитика по всем сетям", "Приоритетная поддержка"],
        business: ["300 постов в месяц", "3 проекта", "3 соцсети на проект", "до 100 тем", "Менеджер в Telegram"]
      };
      box.innerHTML = '' +
        '<div class="card" style="margin-bottom:16px"><div class="plan-card">' +
          '<div class="plan-left">' +
            '<div class="plan-badges"><span class="badge accent">Текущий тариф: ' + esc(planName(d.current)) + "</span>" +
            (state.user.plan_active ? '<span class="badge green">активен</span>' : '<span class="badge amber">истёк</span>') + "</div>" +
            '<div class="big">' + fmt(state.user.posts_balance) + " постов на балансе</div>" +
            '<div class="small">' + (state.user.days_left != null ? "до конца периода: " + state.user.days_left + " дн." : "период не ограничен") + "</div>" +
          "</div>" +
        "</div></div>" +

        '<div class="card"><div class="card-head"><h2>Тарифы</h2><div class="hint">Демо-оплата: тариф активируется сразу, без реальных списаний</div></div>' +
          '<div class="plan-pick">' + order.map(function (key) {
            var p = plans[key];
            var cur = key === d.current;
            return '<div class="plan-opt' + (cur ? " current" : "") + '">' +
              "<h3>" + esc(p.name) + "</h3>" +
              '<div class="price">' + (p.price ? fmt(p.price) + " ₽" : "0 ₽") + " <small>/ мес</small></div>" +
              "<ul>" + (feats[key] || []).map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" +
              (cur
                ? '<button class="btn btn-ghost" disabled style="width:100%">Ваш тариф</button>'
                : '<button class="btn btn-primary" data-plan="' + key + '" style="width:100%">Выбрать</button>') +
            "</div>";
          }).join("") + "</div></div>" +

        '<div class="card"><div class="card-head"><h2>Пакеты постов</h2></div>' +
          '<div class="grid-4">' + Object.keys(d.packs).map(function (k) {
            var pk = d.packs[k];
            return '<div class="plan-opt"><h3>+' + pk.posts + " постов</h3>" +
              '<div class="price">' + fmt(pk.price) + " ₽</div>" +
              '<div class="small" style="color:var(--muted);font-size:12.5px">' + (pk.price / pk.posts).toFixed(2) + " ₽ за пост</div>" +
              '<div style="margin-top:12px"><button class="btn btn-ghost" data-pack="' + k + '" style="width:100%">Купить</button></div></div>';
          }).join("") + "</div></div>" +

        '<div class="card"><div class="card-head"><h2>История операций</h2></div>' +
          '<div id="b-payments"><div class="loading">…</div></div></div>';
      loadPayments();
    }).catch(function (e) {
      box.innerHTML = '<div class="empty">' + esc(e.message) + "</div>";
    });
  }

  function loadPayments() {
    var box = $("#b-payments");
    if (!box) return;
    api("GET", "/api/payments").then(function (d) {
      box.innerHTML = d.payments.length
        ? '<table class="table"><thead><tr><th>Дата</th><th>Операция</th><th>Сумма</th><th>Статус</th></tr></thead><tbody>' +
          d.payments.map(function (p) {
            var what = p.kind === "plan" ? "Тариф " + planName(p.item) : "Пакет +" + p.item + " постов";
            return "<tr><td>" + dt(p.created_at) + "</td><td>" + esc(what) + "</td><td>" + fmt(p.amount) + " ₽</td>" +
              '<td><span class="badge green">' + esc(p.status || "paid") + "</span></td></tr>";
          }).join("") + "</tbody></table>"
        : '<div class="empty">Операций пока нет.</div>';
    }).catch(function (e) {
      box.innerHTML = '<div class="empty">' + esc(e.message) + "</div>";
    });
  }

  /* ---------- Профиль ---------- */
  views.profile = function () {
    var u = state.user, s = state.stats || {};
    return '' +
      '<div class="page-head"><div class="grow"><h1>Профиль</h1>' +
      '<div class="sub">Аккаунт и сводка по контенту</div></div></div>' +
      '<div class="grid-2">' +
        '<div class="card"><div class="card-head"><h2>Аккаунт</h2></div>' +
          '<dl class="kv">' +
            "<dt>Email</dt><dd>" + esc(u.email) + "</dd>" +
            "<dt>Имя</dt><dd>" + esc(u.name) + "</dd>" +
            "<dt>Тариф</dt><dd>" + esc(planName(u.plan)) + "</dd>" +
            "<dt>До конца периода</dt><dd>" + (u.days_left != null ? u.days_left + " дн." : "—") + "</dd>" +
            "<dt>Регистрация</dt><dd>" + dshort(u.created_at) + "</dd>" +
            "<dt>Тон голоса</dt><dd>" + esc(u.tone) + "</dd>" +
          "</dl>" +
          '<div style="margin-top:16px"><a class="btn btn-ghost btn-sm" href="#/settings">Изменить настройки</a></div>' +
        "</div>" +
        '<div class="card"><div class="card-head"><h2>Контент</h2></div>' +
          '<dl class="kv">' +
            "<dt>Проектов</dt><dd>" + fmt(s.projects) + "</dd>" +
            "<dt>Постов всего</dt><dd>" + fmt(s.posts_total_all) + "</dd>" +
            "<dt>На проверке</dt><dd>" + fmt(s.posts_approved) + "</dd>" +
            "<dt>Запланировано</dt><dd>" + fmt(s.posts_scheduled) + "</dd>" +
            "<dt>Опубликовано</dt><dd>" + fmt(s.posts_published) + "</dd>" +
            "<dt>Соцсетей</dt><dd>" + fmt(s.socials) + "</dd>" +
            "<dt>Просмотров</dt><dd>" + fmt(s.views) + "</dd>" +
            "<dt>Постов на балансе</dt><dd>" + fmt(u.posts_balance) + "</dd>" +
          "</dl>" +
        "</div>" +
      "</div>";
  }

  /* ---------- Поддержка ---------- */
  views.support = function () {
    return '' +
      '<div class="page-head"><div class="grow"><h1>Поддержка</h1>' +
      '<div class="sub">Ответим в течение рабочего дня</div></div></div>' +
      '<div class="support-grid">' +
        '<div class="card"><div class="card-head"><h2>Написать нам</h2></div>' +
          '<div class="list-plain">' +
            '<div class="item"><div class="grow"><b>Email</b><span>support@sociora.ru</span></div>' +
              '<a class="btn btn-ghost btn-sm" href="mailto:support@sociora.ru">Написать</a></div>' +
            '<div class="item"><div class="grow"><b>Telegram</b><span>@sociora_support</span></div>' +
              '<a class="btn btn-ghost btn-sm" href="https://t.me/sociora_support" target="_blank" rel="noopener">Открыть</a></div>' +
            '<div class="item"><div class="grow"><b>База знаний</b><span>Инструкции и частые вопросы</span></div>' +
              '<a class="btn btn-ghost btn-sm" href="#/kb">Открыть</a></div>' +
          "</div>" +
        "</div>" +
        '<div class="card"><div class="card-head"><h2>Документы</h2></div>' +
          '<div class="list-plain">' +
            '<div class="item"><div class="grow"><b>Условия использования</b></div><a class="btn btn-ghost btn-sm" href="/terms">Открыть</a></div>' +
            '<div class="item"><div class="grow"><b>Политика конфиденциальности</b></div><a class="btn btn-ghost btn-sm" href="/privacy">Открыть</a></div>' +
            '<div class="item"><div class="grow"><b>Публичная оферта</b></div><a class="btn btn-ghost btn-sm" href="/offer">Открыть</a></div>' +
          "</div>" +
        "</div>" +
      "</div>";
  }

  /* ============================================================
     РЕНДЕР И РОУТЕР
     ============================================================ */
  function render() {
    var hash = location.hash.replace(/^#\/?/, "") || "dashboard";
    var name = hash.split("/")[0];
    if (!views[name]) name = "dashboard";
    state.route = name;
    $("#topbar-title").textContent = TITLES[name] || "Кабинет";
    document.querySelectorAll("#side-nav a").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-nav") === name);
    });
    $("#sidebar").classList.remove("open");
    view.innerHTML = views[name] ? views[name]() : "";
    // представления, которым нужны данные после вставки разметки
    if (name === "analytics") renderAnalytics();
    if (name === "socials") renderSocials();
    if (name === "billing") renderBilling();
    if (name === "themes") loadThemes();
    bindEvents();
    window.scrollTo(0, 0);
  }

  function refresh(keepRoute) {
    return api("GET", "/api/me").then(function (d) {
      state.user = d.user;
      state.stats = d.stats;
      $("#balance-pill").textContent = "Баланс: " + fmt(d.user.posts_balance) + " постов";
      $("#avatar").textContent = (d.user.name || "С").trim().charAt(0).toUpperCase();
      $("#avatar").title = d.user.email;
      return api("GET", "/api/projects").then(function (p) {
        state.projects = p.projects;
        return api("GET", "/api/posts").then(function (posts) {
          state.posts = posts.posts;
          // нормализуем статистику для дашборда/профиля
          state.stats.posts_total_all = state.posts.length;
          state.stats.posts_approved = state.posts.filter(function (x) { return x.status === "approved"; }).length;
          if (!keepRoute) render();
          else render();
        });
      });
    }).catch(function (e) {
      view.innerHTML = '<div class="card"><div class="empty">Кабинет недоступен: ' + esc(e.message) + "</div></div>";
    });
  }

  /* ============================================================
     СОБЫТИЯ
     ============================================================ */
  function bindEvents() {
    // фильтры ленты
    view.querySelectorAll("[data-filter]").forEach(function (b) {
      b.onclick = function () { state.filter = b.getAttribute("data-filter"); render(); };
    });
    // сети в аналитике
    view.querySelectorAll("[data-net]").forEach(function (b) {
      b.onclick = function () { state.analyticsNetwork = b.getAttribute("data-net"); render(); };
    });
    // действия над постами
    view.querySelectorAll("[data-act]").forEach(function (b) {
      b.onclick = function () { postAction(b.getAttribute("data-act"), parseInt(b.getAttribute("data-id"), 10)); };
    });
    // быстрый пост
    var gen = $("#q-generate");
    if (gen) gen.onclick = function () { quickGenerate(gen); };
    view.querySelectorAll("[data-qmode]").forEach(function (b) {
      b.onclick = function () { state.quickMode = b.getAttribute("data-qmode"); render(); };
    });
    view.querySelectorAll("[data-pnet]").forEach(function (b) {
      b.onclick = function () {
        if ($("#q-edit-title") && state.quickPost) state.quickPost.title = $("#q-edit-title").value;
        if ($("#q-edit-body") && state.quickPost) state.quickPost.body = $("#q-edit-body").value;
        state.quickPreviewNet = b.getAttribute("data-pnet");
        render();
      };
    });
    var et = $("#q-edit-title"), eb = $("#q-edit-body");
    if (et) et.oninput = function () {
      if (state.quickPost) state.quickPost.title = et.value;
      var mt = $("#q-mock-title"); if (mt) mt.textContent = et.value;
    };
    if (eb) eb.oninput = function () {
      if (state.quickPost) state.quickPost.body = eb.value;
      var mb = $("#q-mock-body"); if (mb) mb.textContent = eb.value;
    };
    var pubBr = $("#q-publish-browser");
    if (pubBr) pubBr.onclick = function () { quickPublishBrowser(pubBr); };
    var copyOpen = $("#q-copy-open");
    if (copyOpen) copyOpen.onclick = function () { quickCopyOpen(); };
    view.querySelectorAll("[data-browser-login]").forEach(function (b) {
      b.onclick = function () {
        var net = b.getAttribute("data-browser-login");
        var url = b.getAttribute("data-url");
        b.disabled = true;
        api("POST", "/api/browser/login", { network: net }).then(function (d) {
          toast(d.message || "Браузерная сессия сохранена (без токена)");
          if (url && typeof window.open === "function") window.open(url, "_blank", "noopener");
          b.disabled = false;
        }).catch(function (e) { toast(e.message, true); b.disabled = false; });
      };
    });
    // темы
    var tp = $("#t-project");
    if (tp) tp.onchange = loadThemes;
    var ta = $("#t-analyze");
    if (ta) ta.onclick = function () {
      ta.disabled = true; ta.textContent = "Анализируем…";
      api("POST", "/api/projects/" + tp.value + "/analyze").then(function () {
        toast("Ниша проанализирована — темы обновлены");
        return loadThemes();
      }).catch(function (e) { toast(e.message, true); })
        .then(function () { ta.disabled = false; ta.textContent = "Переанализировать нишу"; });
    };
    view.querySelectorAll("[data-write]").forEach(function (b) {
      b.onclick = function () {
        b.disabled = true;
        api("POST", "/api/posts/generate", { project_id: parseInt(b.getAttribute("data-project"), 10), theme_id: parseInt(b.getAttribute("data-write"), 10) })
          .then(function (d) {
            toast("Пост «" + d.post.title.slice(0, 40) + "…» готов");
            location.hash = "#/posts";
            return refresh(true);
          })
          .catch(function (e) { toast(e.message, true); b.disabled = false; });
      };
    });
    var nc = $("#n-create");
    if (nc) nc.onclick = function () {
      var name = $("#n-name").value.trim(), niche = $("#n-niche").value.trim();
      if (!name || !niche) { toast("Укажите название и нишу", true); return; }
      nc.disabled = true;
      api("POST", "/api/projects", { name: name, niche: niche }).then(function (d) {
        toast("Проект создан, ниша проанализирована");
        return api("POST", "/api/projects/" + d.project.id + "/analyze").then(function () {
          return refresh(true);
        });
      }).catch(function (e) { toast(e.message, true); nc.disabled = false; });
    };
    // план на неделю
    var wk = $("#s-week");
    if (wk) wk.onclick = function () {
      if (!state.projects.length) { toast("Сначала создайте проект", true); return; }
      wk.disabled = true; wk.textContent = "Составляем…";
      api("POST", "/api/plan/week", { project_id: state.projects[0].id }).then(function (d) {
        toast("Готово: " + d.created.length + " постов в расписании");
        return refresh(true);
      }).catch(function (e) { toast(e.message, true); wk.disabled = false; wk.textContent = "Составить план на неделю"; });
    };
    // соцсети
    var sc = $("#so-connect");
    if (sc) sc.onclick = function () {
      sc.disabled = true;
      api("POST", "/api/socials", {
        network: $("#so-net").value, project_id: parseInt($("#so-project").value, 10),
        channel: $("#so-channel").value.trim(), token: $("#so-token").value.trim() || "demo-token"
      }).then(function () {
        toast("Соцсеть подключена");
        return refresh(true);
      }).catch(function (e) { toast(e.message, true); sc.disabled = false; });
    };
    view.querySelectorAll("[data-unlink]").forEach(function (b) {
      b.onclick = function () {
        api("DELETE", "/api/socials/" + b.getAttribute("data-unlink")).then(function () {
          toast("Соцсеть отключена");
          return refresh(true);
        }).catch(function (e) { toast(e.message, true); });
      };
    });
    // настройки
    var ss = $("#s-save");
    if (ss) ss.onclick = function () {
      ss.disabled = true;
      api("POST", "/api/settings", { name: $("#s-name").value.trim(), tone: $("#s-tone").value })
        .then(function (d) {
          state.user = d.user;
          toast("Настройки сохранены");
          ss.disabled = false;
        })
        .catch(function (e) { toast(e.message, true); ss.disabled = false; });
    };
    // биллинг
    view.querySelectorAll("[data-plan]").forEach(function (b) {
      b.onclick = function () {
        b.disabled = true;
        api("POST", "/api/tariffs/choose", { plan: b.getAttribute("data-plan"), period: "month" })
          .then(function (d) {
            state.user = d.user;
            $("#balance-pill").textContent = "Баланс: " + fmt(d.user.posts_balance) + " постов";
            toast("Тариф активирован (демо-оплата)");
            renderBilling();
          })
          .catch(function (e) { toast(e.message, true); b.disabled = false; });
      };
    });
    view.querySelectorAll("[data-pack]").forEach(function (b) {
      b.onclick = function () {
        b.disabled = true;
        api("POST", "/api/packs/buy", { pack: b.getAttribute("data-pack") })
          .then(function (d) {
            state.user = d.user;
            $("#balance-pill").textContent = "Баланс: " + fmt(d.user.posts_balance) + " постов";
            toast("Пакет постов начислен");
            renderBilling();
          })
          .catch(function (e) { toast(e.message, true); b.disabled = false; });
      };
    });
    // конкуренты
    var cr = $("#c-run");
    if (cr) cr.onclick = function () {
      cr.disabled = true; cr.textContent = "Анализируем…";
      var pid = $("#c-project").value;
      api("GET", "/api/projects/" + pid).then(function (d) {
        var a = d.project.analysis || {};
        $("#c-result").innerHTML = '<div style="margin-top:16px" class="list-plain">' +
          '<div class="item"><div class="grow"><b>Ниша определена</b><span>' + esc(a.niche_label || d.project.niche) + "</span></div></div>" +
          '<div class="item"><div class="grow"><b>Аудитория</b><span>' + esc(a.audience || "—") + "</span></div></div>" +
          '<div class="item"><div class="grow"><b>Боли аудитории</b><span>' + esc((a.pains || []).join(", ") || "—") + "</span></div></div>" +
          '<div class="item"><div class="grow"><b>Рекомендация</b><span>' + esc(a.recommendation || "—") + "</span></div></div>" +
          '<div class="item"><div class="grow"><b>Окно возможностей</b><span>Конкуренты публикуют редко и без пользы: 2 экспертных и 1 полезный пост в неделю выведут вас вперёд.</span></div></div>' +
        "</div>";
        toast("Анализ ниши готов");
      }).catch(function (e) { toast(e.message, true); })
        .then(function () { cr.disabled = false; cr.textContent = "Запустить анализ ниши"; });
    };
  }

  function postAction(act, id) {
    var payload = { action: act };
    if (act === "schedule") {
      var when = prompt("Когда опубликовать? Формат: 2026-10-07T10:00", new Date(Date.now() + 864e5).toISOString().slice(0, 16));
      if (!when) return;
      payload.scheduled_at = when;
      payload.networks = state.projects.length ? ["telegram"] : [];
    }
    if (act === "regenerate") {
      var comment = prompt("Что изменить в посте? (можно оставить пустым)", "");
      if (comment === null) return;
      payload.comment = comment;
    }
    var url = act === "regenerate" ? "/api/posts/" + id + "/regenerate"
      : act === "publish" ? "/api/posts/" + id + "/publish-browser"
      : "/api/posts/" + id + "/status";
    var method = act === "delete" ? "DELETE" : "POST";
    if (act === "delete") url = "/api/posts/" + id;
    if (act === "publish") payload = { networks: ["telegram", "vk"] };
    api(method, url, payload).then(function (d) {
      if (state.quickPost && d.post && state.quickPost.id === d.post.id) state.quickPost = d.post;
      toast(act === "delete" ? "Пост удалён"
        : act === "publish" ? "Размещено через браузер (без токенов): " + (d.post ? d.post.title.slice(0, 36) : "")
        : "Готово: " + (d.post ? d.post.title.slice(0, 40) : ""));
      return refresh(true);
    }).catch(function (e) { toast(e.message, true); });
  }

  function quickGenerate(btn) {
    var box = $("#q-result");
    var srcEl = $("#q-source");
    btn.disabled = true; btn.textContent = "Этап 1: ИИ пишет текст…";
    box.innerHTML = '<div class="loading">Создаём черновик поста…</div>';
    api("POST", "/api/posts/generate", {
      project_id: parseInt($("#q-project").value, 10),
      rubric: $("#q-rubric").value || null,
      mode: state.quickMode || "scratch",
      source_text: srcEl ? srcEl.value.trim() : ""
    }).then(function (d) {
      state.quickPost = d.post;
      state.user = d.user;
      $("#balance-pill").textContent = "Баланс: " + fmt(d.user.posts_balance) + " постов";
      toast("Этап 1 готов! Проверьте текст и нажмите «Разместить через браузер»");
      return refresh(true);
    }).catch(function (e) {
      box.innerHTML = '<div class="empty">' + esc(e.message) + "</div>";
      btn.disabled = false; btn.textContent = "Сгенерировать пост";
    });
  }

  function quickPublishBrowser(btn) {
    if (!state.quickPost) return;
    var nets = [];
    view.querySelectorAll(".q-net-cb").forEach(function (cb) {
      if (cb.checked) nets.push(cb.value);
    });
    if (!nets.length) { toast("Выберите хотя бы одну соцсеть для размещения", true); return; }
    var titleVal = $("#q-edit-title") ? $("#q-edit-title").value.trim() : state.quickPost.title;
    var bodyVal = $("#q-edit-body") ? $("#q-edit-body").value : state.quickPost.body;
    btn.disabled = true;
    btn.textContent = "Размещаем через браузер…";
    var dbox = $("#q-delivery");
    if (dbox) dbox.innerHTML = '<div class="loading">Запускаем браузерную сессию и публикуем пост…</div>';
    api("POST", "/api/posts/" + state.quickPost.id + "/publish-browser", {
      title: titleVal,
      body: bodyVal,
      networks: nets
    }).then(function (d) {
      state.quickPost = d.post;
      btn.disabled = false;
      btn.textContent = "✓ Размещено через браузер (повторить)";
      toast(d.message || "Пост размещён через браузер без токена!");
      if (dbox) {
        dbox.innerHTML = '<div class="delivery-box">' +
          '<b style="font-size:14px;color:#047857;display:block;margin-bottom:8px">✓ Этап 2 выполнен: пост размещён без токенов</b>' +
          (d.deliveries || []).map(function (deliv) {
            return '<div style="padding:10px 12px;background:#fff;border-radius:10px;border:1px solid var(--line);margin-top:8px">' +
              '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
                '<b>' + esc(deliv.label) + " · " + esc(deliv.channel) + '</b>' +
                '<a class="btn btn-ghost btn-sm" href="' + esc(deliv.web_url) + '" target="_blank" rel="noopener">Открыть в браузере ↗</a>' +
              "</div>" +
              '<ul class="delivery-steps">' + (deliv.steps || []).map(function (st) {
                return "<li>✓ " + esc(st) + "</li>";
              }).join("") + "</ul>" +
            "</div>";
          }).join("") +
        "</div>";
      }
    }).catch(function (e) {
      btn.disabled = false;
      btn.textContent = "🚀 Разместить через браузер (без токена)";
      toast(e.message, true);
    });
  }

  function quickCopyOpen() {
    if (!state.quickPost) return;
    var titleVal = $("#q-edit-title") ? $("#q-edit-title").value.trim() : state.quickPost.title;
    var bodyVal = $("#q-edit-body") ? $("#q-edit-body").value : state.quickPost.body;
    var full = (titleVal ? titleVal + "\n\n" : "") + bodyVal;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(full).catch(function () {});
    }
    var urls = {
      telegram: "https://web.telegram.org/a/",
      vk: "https://vk.com/",
      max: "https://web.max.ru/"
    };
    var net = state.quickPreviewNet || "telegram";
    if (typeof window.open === "function") {
      window.open(urls[net] || urls.telegram, "_blank", "noopener");
    }
    toast("Текст скопирован в буфер! В открытой вкладке нажмите Ctrl+V");
  }

  /* ---------------- запуск ---------------- */
  $("#burger").onclick = function () { $("#sidebar").classList.toggle("open"); };
  $("#btn-refresh").onclick = function () {
    toast("Обновляем данные…");
    refresh(true).then(function () { toast("Данные обновлены"); });
  };
  window.addEventListener("hashchange", render);

  refresh().then(function () { render(); });
})();
