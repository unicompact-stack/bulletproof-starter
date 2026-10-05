/* ============================================================
   Sociora — личный кабинет (SPA, без внешних зависимостей)
   ============================================================ */
(function () {
  "use strict";

  var state = { user: null, stats: null, route: "overview", billingPeriod: "month", analyticsNetwork: "all", postsFilter: "" };

  var $ = function (sel) { return document.querySelector(sel); };
  var content = $("#content");

  /* ---------- утилиты ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function dt(s) {
    if (!s) return "—";
    var d = new Date(s.replace(" ", "T"));
    if (isNaN(d)) return s;
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) + ", " +
      d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
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
    }, 3800);
  }

  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin"
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!data.ok) {
          var err = new Error(data.error || "Ошибка запроса");
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  function handleError(e) {
    if (e.status === 401) { location.href = "/login"; return; }
    toast(e.message, true);
  }

  /* ---------- каркас ---------- */
  function showApp(user, stats) {
    $("#app").hidden = false;
    $("#auth-needed").hidden = true;
    $("#top-user").textContent = user.email;
    $("#top-user").title = user.email;
    $("#top-plan").textContent = user.plan_name;
    $("#top-balance").textContent = "⚡ " + fmt(user.posts_balance) + " постов";
  }

  function renderTopbar() {
    var titles = {
      overview: "Обзор", projects: "Проекты", project: "Проект", posts: "Посты",
      plan: "Контент-план", socials: "Соцсети", analytics: "Аналитика",
      billing: "Тарифы и оплата", settings: "Настройки"
    };
    $("#topbar-title").textContent = titles[state.route] || "Кабинет";
    document.querySelectorAll("[data-nav]").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-nav") === state.route);
    });
  }

  /* ---------- представления ---------- */
  var views = {};

  views.overview = function () {
    var u = state.user, s = state.stats;
    return "" +
      '<div class="page-head-app"><h1>Привет, ' + esc(u.name) + ' 👋</h1>' +
      "<p>Здесь вы создаёте проекты, генерируете посты и следите за соцсетями.</p></div>" +
      '<div class="kpi-grid">' +
      kpi("Проекты", s.projects) + kpi("Черновики", s.posts_draft) +
      kpi("В расписании", s.posts_scheduled) + kpi("Опубликовано", s.posts_published) +
      "</div>" +
      '<div class="grid-2-app">' +
      '<div class="panel"><h2>Быстрый старт</h2>' +
      '<ol style="display:grid;gap:12px;color:var(--muted);font-size:14.5px;padding-left:18px">' +
      "<li>Создайте <b style=\"color:var(--text)\">проект</b> — укажите нишу и сайт</li>" +
      "<li>Нажмите <b style=\"color:var(--text)\">«Анализ ниши»</b> — ИИ предложит темы</li>" +
      "<li>Сгенерируйте первый пост и одобрите его</li>" +
      "<li>Подключите соцсеть и задайте расписание</li>" +
      "</ol>" +
      '<div class="form-actions" style="margin-top:18px">' +
      '<a class="btn btn-primary btn-sm" href="#/projects">Создать проект</a>' +
      '<a class="btn btn-ghost btn-sm" href="#/posts">Сгенерировать пост</a>' +
      "</div></div>" +
      '<div class="panel"><h2>Подписка</h2>' +
      '<div style="font-size:15px;margin-bottom:6px">Тариф: <b>' + esc(u.plan_name) + "</b></div>" +
      '<div style="color:var(--faint);font-size:13.5px;margin-bottom:14px">' + esc(u.plan_desc) + "</div>" +
      '<div style="color:var(--muted);font-size:14px">Баланс: <b style="color:var(--accent-2)">' + fmt(u.posts_balance) + " постов</b>" +
      (u.days_left != null ? " · осталось дней: " + u.days_left : "") + "</div>" +
      '<div class="form-actions" style="margin-top:16px"><a class="btn btn-ghost btn-sm" href="#/billing">Управлять тарифом</a></div>' +
      "</div></div>";
  };

  views.projects = function () {
    return api("GET", "/api/projects").then(function (data) {
      var list = data.projects.map(function (p) {
        return '<div class="item"><div class="item-head"><div><b>' + esc(p.name) + "</b>" +
          '<div class="item-meta">Ниша: ' + esc(p.niche) + (p.website ? " · " + esc(p.website) : "") +
          " · постов: " + p.posts_count + " · соцсетей: " + p.socials_count + "</div></div>" +
          '<span class="status ' + (p.status === "analyzed" ? "approved" : "draft") + '">' +
          (p.status === "analyzed" ? "проанализирован" : "новый") + "</span></div>" +
          '<div class="item-actions">' +
          '<a class="btn btn-ghost btn-sm" href="#/projects/' + p.id + '">Открыть</a>' +
          '<button class="btn btn-ghost btn-sm" data-analyze="' + p.id + '">Анализ ниши</button>' +
          '<button class="btn btn-ghost btn-sm" data-del-project="' + p.id + '">Удалить</button>' +
          "</div></div>";
      }).join("");
      return '<div class="page-head-app"><h1>Проекты</h1><p>Проект = бизнес, для которого ИИ ведёт соцсети.</p></div>' +
        '<div class="panel"><h2>Новый проект</h2>' +
        '<form id="form-project"><div class="form-row">' +
        '<div class="field"><label>Название</label><input name="name" placeholder="Например: Салон Лилия" required></div>' +
        '<div class="field"><label>Ниша / сфера</label><input name="niche" placeholder="Например: салон красоты" required></div>' +
        "</div>" +
        '<div class="form-row">' +
        '<div class="field"><label>Сайт (необязательно)</label><input name="website" placeholder="https://example.ru"></div>' +
        '<div class="field"><label>Тон голоса</label><select name="tone">' +
        tonesOptions(state.user.tone) + "</select></div>" +
        "</div>" +
        '<div class="form-actions"><button class="btn btn-primary btn-sm" type="submit">Создать проект</button></div>' +
        "</form></div>" +
        '<div class="panel"><h2>Мои проекты (' + data.projects.length + ")</h2>" +
        (list || '<div class="empty">Пока нет проектов — создайте первый выше.</div>') + "</div>";
    });
  };

  views.project = function (id) {
    return api("GET", "/api/projects/" + id).then(function (data) {
      var p = data.project;
      var analysisHtml = "";
      if (data.project.analysis) {
        var a = data.project.analysis;
        analysisHtml = '<div class="panel"><h2>🧠 Анализ ниши</h2>' +
          '<p style="color:var(--muted);font-size:14.5px;margin-bottom:14px">' + esc(a.summary) + "</p>" +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          a.pains.map(function (x) { return '<span class="status draft">' + esc(x) + "</span>"; }).join("") +
          "</div></div>";
      }
      var themes = data.themes.map(function (t) {
        return '<div class="item" style="padding:14px 18px"><div class="item-head"><div><b>' + esc(t.title) + "</b>" +
          '<div class="item-meta">' + esc(t.rubric) + (t.used ? " · использована" : "") + "</div></div>" +
          '<button class="btn btn-ghost btn-sm" data-generate-theme="' + t.id + '" data-project="' + p.id + '">Написать пост</button>' +
          "</div></div>";
      }).join("");
      var posts = data.posts.slice(0, 10).map(postCard).join("");
      return '<div class="page-head-app"><h1>' + esc(p.name) + '</h1><p>Ниша: ' + esc(p.niche) +
        " · тон: " + esc(p.tone || "—") + "</p></div>" +
        '<div class="form-actions" style="margin-bottom:22px">' +
        '<button class="btn btn-primary btn-sm" data-analyze="' + p.id + '">Анализ ниши</button>' +
        '<button class="btn btn-ghost btn-sm" data-generate="' + p.id + '">Сгенерировать пост</button>' +
        '<a class="btn btn-ghost btn-sm" href="#/projects">← Все проекты</a>' +
        "</div>" +
        analysisHtml +
        '<div class="panel"><h2>Темы (' + data.themes.length + ")</h2>" +
        '<div class="item-list">' + (themes || '<div class="empty">Нажмите «Анализ ниши», чтобы получить темы.</div>') + "</div></div>" +
        '<div class="panel"><h2>Последние посты</h2><div class="item-list">' +
        (posts || '<div class="empty">Постов пока нет.</div>') + "</div></div>";
    });
  };

  views.posts = function () {
    return api("GET", "/api/posts" + (state.postsFilter ? "?status=" + state.postsFilter : "")).then(function (data) {
      var filters = [["", "Все"], ["draft", "Черновики"], ["approved", "Одобренные"], ["scheduled", "В расписании"], ["published", "Опубликованные"]];
      var tabs = filters.map(function (f) {
        return '<button class="tab' + (state.postsFilter === f[0] ? " active" : "") + '" data-filter="' + f[0] + '">' + f[1] + "</button>";
      }).join("");
      var list = data.posts.map(postCard).join("");
      return '<div class="page-head-app"><h1>Посты</h1><p>Генерация, редактирование, одобрение и публикация.</p></div>' +
        '<div class="panel"><div class="tabs" style="margin-bottom:18px">' + tabs + "</div>" +
        '<div class="item-list">' + (list || '<div class="empty">Постов пока нет. Сгенерируйте первый в проекте.</div>') + "</div></div>";
    });
  };

  views.plan = function () {
    return Promise.all([api("GET", "/api/projects"), api("GET", "/api/posts?status=scheduled")]).then(function (res) {
      var projects = res[0].projects;
      var opts = projects.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + "</option>"; }).join("");
      var list = res[1].posts.map(postCard).join("");
      var today = new Date().toISOString().slice(0, 10);
      return '<div class="page-head-app"><h1>Контент-план</h1><p>Составьте план на неделю — ИИ напишет 7 постов и расставит по расписанию.</p></div>' +
        '<div class="panel"><h2>План на неделю</h2>' +
        (projects.length
          ? '<form id="form-week"><div class="form-row">' +
            '<div class="field"><label>Проект</label><select name="project_id">' + opts + "</select></div>" +
            '<div class="field"><label>Дата начала</label><input type="date" name="start_date" value="' + today + '"></div>' +
            "</div>" +
            '<div class="form-actions"><button class="btn btn-primary btn-sm" type="submit">Составить план (7 постов)</button></div></form>'
          : '<div class="empty">Сначала создайте проект.</div>') +
        "</div>" +
        '<div class="panel"><h2>Запланировано (' + res[1].posts.length + ")</h2>" +
        '<div class="item-list">' + (list || '<div class="empty">Расписание пустое.</div>') + "</div></div>";
    });
  };

  views.socials = function () {
    return api("GET", "/api/socials").then(function (data) {
      var list = data.socials.map(function (s) {
        var net = { telegram: "Telegram", vk: "ВКонтакте", max: "MAX" }[s.network] || s.network;
        return '<div class="item"><div class="item-head"><div><b>' + net + " · " + esc(s.channel) + "</b>" +
          '<div class="item-meta">Проект: ' + esc(s.project_name) + " · ID: " + esc(s.channel_id) + " · " + dt(s.created_at) + "</div></div>" +
          '<span class="status approved">подключено</span></div>' +
          '<div class="item-actions"><button class="btn btn-ghost btn-sm" data-del-social="' + s.id + '">Отключить</button></div></div>';
      }).join("");
      var opts = data.projects.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + "</option>"; }).join("");
      return '<div class="page-head-app"><h1>Соцсети</h1><p>Подключите каналы, чтобы публиковать посты автоматически.</p></div>' +
        '<div class="panel"><h2>Новое подключение</h2>' +
        (data.projects.length
          ? '<form id="form-social"><div class="form-row">' +
            '<div class="field"><label>Сеть</label><select name="network">' +
            '<option value="telegram">Telegram</option><option value="vk">ВКонтакте</option><option value="max">MAX</option></select></div>' +
            '<div class="field"><label>Проект</label><select name="project_id">' + opts + "</select></div></div>" +
            '<div class="form-row">' +
            '<div class="field"><label>Токен доступа</label><input name="token" placeholder="Токен бота или ключ сообщества" required>' +
            '<div class="hint">В этой копии подключение демонстрационное: токен сохраняется локально и проверяется моком.</div></div>' +
            '<div class="field"><label>Канал / сообщество</label><input name="channel" placeholder="@my_channel или https://vk.com/my_group" required></div>' +
            "</div>" +
            '<div class="form-actions"><button class="btn btn-primary btn-sm" type="submit">Подключить</button></div></form>'
          : '<div class="empty">Сначала создайте проект.</div>') +
        "</div>" +
        '<div class="panel"><h2>Подключения (' + data.socials.length + ")</h2>" +
        '<div class="item-list">' + (list || '<div class="empty">Пока ничего не подключено.</div>') + "</div></div>";
    });
  };

  views.analytics = function () {
    return api("GET", "/api/analytics?network=" + state.analyticsNetwork).then(function (data) {
      var tabs = [["all", "Все сети"], ["telegram", "Telegram"], ["vk", "ВКонтакте"], ["max", "MAX"]].map(function (t) {
        return '<button class="tab' + (state.analyticsNetwork === t[0] ? " active" : "") + '" data-net="' + t[0] + '">' + t[1] + "</button>";
      }).join("");
      var o = data.overall;
      var maxV = Math.max.apply(null, data.series.map(function (s) { return s.views; }).concat([1]));
      var bars = data.series.map(function (s) {
        return '<span class="bar" style="height:' + Math.max(3, Math.round(s.views / maxV * 100)) + '%" title="' + s.views + '"></span>';
      }).join("");
      var days = data.series.map(function (s) { return "<span>" + s.day + "</span>"; }).join("");
      var voice = data.voice.map(function (v) {
        return '<div class="voice-row"><span class="label">' + esc(v.name) + '</span>' +
          '<span class="track"><span class="fill" style="width:' + v.pct + '%"></span></span>' +
          '<span class="val">' + fmt(v.views) + "</span></div>";
      }).join("");
      var top = data.top_posts.map(function (p) {
        return "<tr><td>" + esc(p.title.slice(0, 60)) + "</td><td>" + fmt(p.views) + "</td><td>" + fmt(p.likes) + "</td><td>" + fmt(p.reposts) + "</td></tr>";
      }).join("");
      return '<div class="page-head-app"><h1>Аналитика</h1><p>Статистика по опубликованным постам во всех сетях.</p></div>' +
        '<div class="panel"><div class="tabs" style="margin-bottom:20px">' + tabs + "</div>" +
        '<div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">' +
        kpi("Просмотры", fmt(o.views)) + kpi("Подписчики", fmt(o.subscribers)) + kpi("Вовлечённость", o.er + "%") +
        "</div>" +
        '<div class="chart-box"><h4>Просмотры по дням</h4><div class="chart-app">' + bars + '</div><div class="chart-app-x">' + days + "</div></div>" +
        '<div class="ai-note"><b>✨ AI-анализ</b><br>' + esc(data.insight) + "</div>" +
        (voice ? '<div class="voice" style="margin-top:22px;border-top:1px solid var(--border);padding-top:20px"><h4>🎙️ Голос канала</h4><div class="sub">Средние просмотры по форматам</div>' + voice + "</div>" : "") +
        (top ? '<div class="table-wrap-app" style="margin-top:22px"><table class="app-table"><thead><tr><th>Топ постов</th><th>Просмотры</th><th>Лайки</th><th>Репосты</th></tr></thead><tbody>' + top + "</tbody></table></div>" : "") +
        "</div>";
    });
  };

  views.billing = function () {
    return api("GET", "/api/tariffs").then(function (data) {
      var period = state.billingPeriod;
      var cards = Object.keys(data.plans).map(function (key) {
        var p = data.plans[key];
        var isCurrent = key === state.user.plan;
        var price = period === "year" ? p.year : p.price;
        var amount = price ? fmt(price) + " ₽" : "0 ₽";
        var per = key === "trial" ? "7 дней бесплатно" : (period === "year" ? "в год" : "в месяц");
        var feats = [
          p.posts + " постов" + (key === "trial" ? "" : " в месяц"),
          p.socials + (p.socials === 1 ? " соцсеть" : " соцсети"),
          p.projects + (p.projects === 1 ? " проект" : " проекта"),
          "до " + p.themes + " тем"
        ];
        return '<div class="plan-card' + (isCurrent ? " current" : "") + '"><h3>' + p.name + "</h3>" +
          '<div class="price">' + amount + " <span>" + per + "</span></div>" +
          '<div class="desc">' + esc(p.desc) + "</div><ul>" +
          feats.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" +
          (isCurrent
            ? '<button class="btn btn-ghost btn-block" disabled>Текущий тариф</button>'
            : key === "trial"
              ? '<button class="btn btn-ghost btn-block" disabled>Активен при регистрации</button>'
              : '<button class="btn ' + (p.name === "Pro" ? "btn-primary" : "btn-ghost") + ' btn-block" data-choose-plan="' + key + '">Выбрать ' + p.name + "</button>") +
          "</div>";
      }).join("");
      var packs = Object.keys(data.packs).map(function (k) {
        var pk = data.packs[k];
        return '<div class="pack" style="text-align:center"><b>+' + pk.posts + ' постов</b>' +
          '<span class="p-price">' + fmt(pk.price) + " ₽</span>" +
          '<span class="p-per">' + (pk.price / pk.posts).toFixed(2) + ' ₽ за пост</span>' +
          '<div style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-buy-pack="' + k + '">Купить</button></div></div>';
      }).join("");
      return api("GET", "/api/payments").then(function (pay) {
        var rows = pay.payments.map(function (p) {
          var item = p.kind === "plan" ? "Тариф " + p.item : "Пакет +" + (data.packs[p.item] ? data.packs[p.item].posts : "?") + " постов";
          return "<tr><td>" + dt(p.created_at) + "</td><td>" + esc(item) + "</td><td>" + fmt(p.amount) + " ₽</td><td>" +
            (p.period === "year" ? "год" : p.period === "month" ? "месяц" : "—") + "</td><td>оплачено (демо)</td></tr>";
        }).join("");
        return '<div class="page-head-app"><h1>Тарифы и оплата</h1><p>Смена тарифа и пакеты постов. Оплата демонстрационная — списаний нет.</p></div>' +
          '<div class="segmented" data-billing-period>' +
          '<button data-period="month" class="' + (period === "month" ? "active" : "") + '">Помесячно</button>' +
          '<button data-period="year" class="' + (period === "year" ? "active" : "") + '">За год −17%</button></div>' +
          '<div class="plans-grid">' + cards + "</div>" +
          '<div class="panel" style="margin-top:22px"><h2>Пакеты постов</h2>' +
          '<p style="color:var(--faint);font-size:13.5px;margin-bottom:16px">Не сгорают, тратятся после исчерпания лимита тарифа.</p>' +
          '<div class="packs-grid">' + packs + "</div></div>" +
          '<div class="panel"><h2>История платежей</h2>' +
          (rows ? '<div class="table-wrap-app"><table class="app-table"><thead><tr><th>Дата</th><th>Что</th><th>Сумма</th><th>Период</th><th>Статус</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
                : '<div class="empty">Платежей пока нет.</div>') + "</div>";
      });
    });
  };

  views.settings = function () {
    var u = state.user;
    return '<div class="page-head-app"><h1>Настройки</h1><p>Профиль, тон голоса и пароль.</p></div>' +
      '<div class="grid-2-app">' +
      '<div class="panel"><h2>Профиль</h2><form id="form-settings">' +
      '<div class="field"><label>Имя</label><input name="name" value="' + esc(u.name) + '"></div>' +
      '<div class="field"><label>Тон голоса по умолчанию</label><select name="tone">' + tonesOptions(u.tone) + "</select></div>" +
      '<div class="field"><label>Email</label><input value="' + esc(u.email) + '" disabled></div>' +
      '<div class="form-actions"><button class="btn btn-primary btn-sm" type="submit">Сохранить</button></div></form></div>' +
      '<div class="panel"><h2>Смена пароля</h2><form id="form-password">' +
      '<div class="field"><label>Текущий пароль</label><input type="password" name="old_password" required></div>' +
      '<div class="field"><label>Новый пароль</label><input type="password" name="new_password" minlength="6" required></div>' +
      '<div class="form-actions"><button class="btn btn-ghost btn-sm" type="submit">Изменить пароль</button></div></form>' +
      '<p style="color:var(--faint);font-size:12.5px;margin-top:14px">После смены пароля все сессии будут закрыты — нужно войти заново.</p>' +
      "</div></div>";
  };

  function tonesOptions(current) {
    return ["дружелюбный", "экспертный", "дерзкий", "спокойный", "мотивирующий"].map(function (t) {
      return '<option value="' + t + '"' + (t === current ? " selected" : "") + ">" + t + "</option>";
    }).join("");
  }

  function kpi(label, value) {
    return '<div class="kpi-card"><b>' + value + "</b><span>" + label + "</span></div>";
  }

  function statusLabel(s) {
    return { draft: "черновик", approved: "одобрен", scheduled: "в расписании", published: "опубликован" }[s] || s;
  }

  function postCard(p) {
    var nets = [];
    try { nets = JSON.parse(p.networks || "[]"); } catch (e) {}
    var netNames = nets.map(function (n) { return { telegram: "TG", vk: "VK", max: "MAX" }[n] || n; }).join(" · ");
    return '<div class="item"><div class="item-head"><div><b>' + esc(p.title) + "</b>" +
      '<div class="item-meta">' + esc(p.project_name || "") + " · " + esc(p.rubric || "ИИ") + " · " + dt(p.created_at) +
      (p.status === "scheduled" && p.scheduled_at ? " · запланирован на " + dt(p.scheduled_at) : "") +
      (p.status === "published" && p.published_at ? " · опубликован " + dt(p.published_at) : "") +
      (netNames ? " · " + netNames : "") + "</div></div>" +
      '<span class="status ' + p.status + '">' + statusLabel(p.status) + "</span></div>" +
      '<div class="post-preview"><div class="tg-head"><span class="tg-avatar">S</span>' +
      '<div class="tg-meta"><b>' + esc(p.project_name || "Канал") + '</b><span>превью как в соцсети</span></div></div>' +
      '<div class="tg-body"><b>' + esc(p.title) + "</b>\n\n" + esc(p.body) + "</div>" +
      '<div class="tg-image">🖼️ ' + esc(p.image_prompt || "Картинка от ИИ") + "</div>" +
      (p.status === "published"
        ? '<div class="tg-actions"><span>👁 ' + fmt(p.views) + "</span><span>❤️ " + fmt(p.likes) + "</span><span>💬 " + fmt(p.comments) + "</span><span>🔁 " + fmt(p.reposts) + "</span></div>"
        : "") + "</div>" +
      '<div class="item-actions">' +
      (p.status === "draft" ? '<button class="btn btn-primary btn-sm" data-approve="' + p.id + '">Одобрить</button>' : "") +
      (p.status === "approved" ? '<button class="btn btn-primary btn-sm" data-publish="' + p.id + '">Опубликовать</button>' +
        '<button class="btn btn-ghost btn-sm" data-schedule="' + p.id + '">Запланировать</button>' : "") +
      (p.status === "scheduled" ? '<button class="btn btn-primary btn-sm" data-publish="' + p.id + '">Опубликовать сейчас</button>' +
        '<button class="btn btn-ghost btn-sm" data-schedule="' + p.id + '">Изменить время</button>' : "") +
      '<button class="btn btn-ghost btn-sm" data-edit="' + p.id + '">Редактировать</button>' +
      '<button class="btn btn-ghost btn-sm" data-regen="' + p.id + '">Перегенерировать</button>' +
      '<button class="btn btn-ghost btn-sm" data-del-post="' + p.id + '">Удалить</button>' +
      "</div>" +
      '<div class="item" id="edit-' + p.id + '" hidden style="margin-top:12px;background:rgba(0,0,0,.2)">' +
      '<div class="field"><label>Заголовок</label><input id="edit-title-' + p.id + '" value="' + esc(p.title) + '"></div>' +
      '<div class="field"><label>Текст</label><textarea id="edit-body-' + p.id + '">' + esc(p.body) + "</textarea></div>" +
      '<div class="form-actions"><button class="btn btn-primary btn-sm" data-save="' + p.id + '">Сохранить</button>' +
      '<button class="btn btn-ghost btn-sm" data-cancel="' + p.id + '">Отмена</button></div></div>' +
      '<div class="item" id="regen-' + p.id + '" hidden style="margin-top:12px;background:rgba(0,0,0,.2)">' +
      '<div class="field"><label>Что изменить? (комментарий для ИИ)</label>' +
      '<input id="regen-comment-' + p.id + '" placeholder="Например: слишком формально, добавь юмора"></div>' +
      '<div class="form-actions"><button class="btn btn-primary btn-sm" data-regen-go="' + p.id + '">Перегенерировать</button>' +
      '<button class="btn btn-ghost btn-sm" data-cancel-regen="' + p.id + '">Отмена</button></div></div>' +
      '<div class="item" id="sched-' + p.id + '" hidden style="margin-top:12px;background:rgba(0,0,0,.2)">' +
      '<div class="form-row"><div class="field"><label>Дата и время</label>' +
      '<input type="datetime-local" id="sched-when-' + p.id + '" value="' + (p.scheduled_at ? p.scheduled_at.slice(0, 16) : "") + '"></div>' +
      '<div class="field"><label>Сети</label><select id="sched-nets-' + p.id + '" multiple size="3">' +
      '<option value="telegram">Telegram</option><option value="vk">ВКонтакте</option><option value="max">MAX</option></select></div></div>' +
      '<div class="form-actions"><button class="btn btn-primary btn-sm" data-sched-go="' + p.id + '">Запланировать</button>' +
      '<button class="btn btn-ghost btn-sm" data-cancel-sched="' + p.id + '">Отмена</button></div></div>' +
      "</div>";
  }

  /* ---------- рендер ---------- */
  function render() {
    renderTopbar();
    var hash = location.hash.replace(/^#\/?/, "") || "overview";
    var parts = hash.split("/");
    var view = parts[0];
    var arg = parts[1];
    if (!views[view]) view = "overview";
    state.route = view === "project" ? "project" : view;
    renderTopbar();
    content.innerHTML = '<div class="loading">Загрузка…</div>';
    var p;
    try {
      p = views[view](arg);
    } catch (e) {
      p = Promise.reject(e);
    }
    Promise.resolve(p).then(function (html) {
      content.innerHTML = html;
      bindEvents();
      window.scrollTo(0, 0);
    }).catch(handleError);
  }

  /* ---------- события ---------- */
  function bindEvents() {
    // формы
    var fp = $("#form-project");
    if (fp) fp.onsubmit = function (e) {
      e.preventDefault();
      var fd = new FormData(fp);
      api("POST", "/api/projects", {
        name: fd.get("name"), niche: fd.get("niche"),
        website: fd.get("website"), tone: fd.get("tone")
      }).then(function (d) {
        toast("Проект «" + d.project.name + "» создан");
        location.hash = "#/projects/" + d.project.id;
        refreshMe();
      }).catch(handleError);
    };

    var fw = $("#form-week");
    if (fw) fw.onsubmit = function (e) {
      e.preventDefault();
      var fd = new FormData(fw);
      api("POST", "/api/plan/week", { project_id: fd.get("project_id"), start_date: fd.get("start_date") })
        .then(function (d) {
          toast(d.message);
          refreshMe();
          render();
        }).catch(handleError);
    };

    var fs = $("#form-social");
    if (fs) fs.onsubmit = function (e) {
      e.preventDefault();
      var fd = new FormData(fs);
      api("POST", "/api/socials", {
        network: fd.get("network"), project_id: fd.get("project_id"),
        token: fd.get("token"), channel: fd.get("channel")
      }).then(function (d) {
        toast(d.message);
        refreshMe();
        render();
      }).catch(handleError);
    };

    var fset = $("#form-settings");
    if (fset) fset.onsubmit = function (e) {
      e.preventDefault();
      var fd = new FormData(fset);
      api("POST", "/api/settings", { name: fd.get("name"), tone: fd.get("tone") })
        .then(function (d) {
          state.user = d.user;
          showApp(d.user, state.stats);
          toast(d.message);
        }).catch(handleError);
    };

    var fpw = $("#form-password");
    if (fpw) fpw.onsubmit = function (e) {
      e.preventDefault();
      var fd = new FormData(fpw);
      api("POST", "/api/settings/password", { old_password: fd.get("old_password"), new_password: fd.get("new_password") })
        .then(function (d) {
          toast(d.message);
          setTimeout(function () { location.href = "/login"; }, 1200);
        }).catch(handleError);
    };

    // кнопки
    document.body.querySelectorAll("[data-analyze]").forEach(function (b) {
      b.onclick = function () {
        api("POST", "/api/projects/" + b.getAttribute("data-analyze") + "/analyze", {})
          .then(function (d) {
            toast("Ниша проанализирована: " + d.themes.length + " тем предложено");
            refreshMe();
            render();
          }).catch(handleError);
      };
    });
    document.body.querySelectorAll("[data-del-project]").forEach(function (b) {
      b.onclick = function () {
        if (!confirm("Удалить проект со всеми постами?")) return;
        api("DELETE", "/api/projects/" + b.getAttribute("data-del-project"))
          .then(function () { toast("Проект удалён"); refreshMe(); render(); }).catch(handleError);
      };
    });
    document.body.querySelectorAll("[data-generate]").forEach(function (b) {
      b.onclick = function () { generate(b.getAttribute("data-generate")); };
    });
    document.body.querySelectorAll("[data-generate-theme]").forEach(function (b) {
      b.onclick = function () {
        generate(b.getAttribute("data-project"), b.getAttribute("data-generate-theme"));
      };
    });
    document.body.querySelectorAll("[data-approve]").forEach(function (b) {
      b.onclick = function () { postAction(b.getAttribute("data-approve"), { action: "approve" }, "Пост одобрен"); };
    });
    document.body.querySelectorAll("[data-publish]").forEach(function (b) {
      b.onclick = function () { postAction(b.getAttribute("data-publish"), { action: "publish" }, "Пост опубликован (демо)"); };
    });
    document.body.querySelectorAll("[data-del-post]").forEach(function (b) {
      b.onclick = function () {
        if (!confirm("Удалить пост?")) return;
        api("DELETE", "/api/posts/" + b.getAttribute("data-del-post"))
          .then(function () { toast("Пост удалён"); refreshMe(); render(); }).catch(handleError);
      };
    });
    document.body.querySelectorAll("[data-edit]").forEach(function (b) {
      b.onclick = function () { $("#edit-" + b.getAttribute("data-edit")).hidden = false; };
    });
    document.body.querySelectorAll("[data-cancel]").forEach(function (b) {
      b.onclick = function () { $("#edit-" + b.getAttribute("data-cancel")).hidden = true; };
    });
    document.body.querySelectorAll("[data-save]").forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-save");
        api("POST", "/api/posts/" + id, {
          title: $("#edit-title-" + id).value, body: $("#edit-body-" + id).value
        }).then(function () { toast("Пост сохранён"); refreshMe(); render(); }).catch(handleError);
      };
    });
    document.body.querySelectorAll("[data-regen]").forEach(function (b) {
      b.onclick = function () { $("#regen-" + b.getAttribute("data-regen")).hidden = false; };
    });
    document.body.querySelectorAll("[data-cancel-regen]").forEach(function (b) {
      b.onclick = function () { $("#regen-" + b.getAttribute("data-cancel-regen")).hidden = true; };
    });
    document.body.querySelectorAll("[data-regen-go]").forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-regen-go");
        api("POST", "/api/posts/" + id + "/regenerate", { comment: $("#regen-comment-" + id).value })
          .then(function (d) { toast("Пост перегенерирован"); refreshMe(); render(); }).catch(handleError);
      };
    });
    document.body.querySelectorAll("[data-schedule]").forEach(function (b) {
      b.onclick = function () {
        var box = $("#sched-" + b.getAttribute("data-schedule"));
        box.hidden = false;
        if (!$("#sched-when-" + b.getAttribute("data-schedule")).value) {
          var d = new Date(Date.now() + 3600 * 1000);
          $("#sched-when-" + b.getAttribute("data-schedule")).value = d.toISOString().slice(0, 16);
        }
      };
    });
    document.body.querySelectorAll("[data-cancel-sched]").forEach(function (b) {
      b.onclick = function () { $("#sched-" + b.getAttribute("data-cancel-sched")).hidden = true; };
    });
    document.body.querySelectorAll("[data-sched-go]").forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-sched-go");
        var sel = $("#sched-nets-" + id);
        var nets = Array.prototype.filter.call(sel.options, function (o) { return o.selected; }).map(function (o) { return o.value; });
        postAction(id, { action: "schedule", scheduled_at: $("#sched-when-" + id).value, networks: nets }, "Пост запланирован");
      };
    });
    document.body.querySelectorAll("[data-del-social]").forEach(function (b) {
      b.onclick = function () {
        api("DELETE", "/api/socials/" + b.getAttribute("data-del-social"))
          .then(function () { toast("Подключение удалено"); refreshMe(); render(); }).catch(handleError);
      };
    });
    document.body.querySelectorAll("[data-filter]").forEach(function (b) {
      b.onclick = function () { state.postsFilter = b.getAttribute("data-filter"); render(); };
    });
    document.body.querySelectorAll("[data-net]").forEach(function (b) {
      b.onclick = function () { state.analyticsNetwork = b.getAttribute("data-net"); render(); };
    });
    document.body.querySelectorAll("[data-choose-plan]").forEach(function (b) {
      b.onclick = function () {
        var plan = b.getAttribute("data-choose-plan");
        if (!confirm("Активировать тариф? Это демо-оплата — реальных списаний нет.")) return;
        api("POST", "/api/tariffs/choose", { plan: plan, period: state.billingPeriod })
          .then(function (d) {
            state.user = d.user;
            showApp(d.user, state.stats);
            toast(d.message);
            render();
          }).catch(handleError);
      };
    });
    document.body.querySelectorAll("[data-buy-pack]").forEach(function (b) {
      b.onclick = function () {
        api("POST", "/api/packs/buy", { pack: b.getAttribute("data-buy-pack") })
          .then(function (d) {
            state.user = d.user;
            showApp(d.user, state.stats);
            toast(d.message);
            render();
          }).catch(handleError);
      };
    });
    document.body.querySelectorAll("[data-period]").forEach(function (b) {
      b.onclick = function () { state.billingPeriod = b.getAttribute("data-period"); render(); };
    });
  }

  function generate(projectId, themeId) {
    api("POST", "/api/posts/generate", { project_id: projectId, theme_id: themeId })
      .then(function (d) {
        state.user = d.user;
        showApp(d.user, state.stats);
        toast("Пост сгенерирован: «" + d.post.title.slice(0, 50) + "…»");
        render();
      }).catch(handleError);
  }

  function postAction(id, body, msg) {
    api("POST", "/api/posts/" + id + "/status", body)
      .then(function () { toast(msg); refreshMe(); render(); }).catch(handleError);
  }

  function refreshMe() {
    return api("GET", "/api/me").then(function (d) {
      state.user = d.user;
      state.stats = d.stats;
      showApp(d.user, d.stats);
    }).catch(handleError);
  }

  /* ---------- инициализация ---------- */
  var burger = $("#app-burger");
  if (burger) burger.onclick = function () { document.querySelector(".sidebar").classList.toggle("open"); };

  var logout = $("#btn-logout");
  if (logout) logout.onclick = function () {
    api("POST", "/api/logout", {}).then(function () { location.href = "/"; }).catch(function () { location.href = "/"; });
  };

  window.addEventListener("hashchange", render);

  api("GET", "/api/me").then(function (d) {
    state.user = d.user;
    state.stats = d.stats;
    showApp(d.user, d.stats);
    render();
  }).catch(function () {
    $("#app").hidden = true;
    $("#auth-needed").hidden = false;
  });
})();
