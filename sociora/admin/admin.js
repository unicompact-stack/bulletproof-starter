/* ============================================================
   Sociora — админ-панель (SPA, без внешних зависимостей)
   ============================================================ */
(function () {
  "use strict";

  var TOKEN_KEY = "sociora_token";
  var $ = function (sel) { return document.querySelector(sel); };
  var content = $("#admin-content");
  var route = "stats";

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function dt(s) {
    if (!s) return "—";
    var d = new Date(String(s).replace(" ", "T"));
    if (isNaN(d)) return s;
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "2-digit" });
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
    }, 3500);
  }

  function api(method, url, body) {
    var headers = {};
    if (body) headers["Content-Type"] = "application/json";
    var token = getToken();
    if (token) headers["Authorization"] = "Bearer " + token;
    return fetch(url, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
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

  /* ---------- представления ---------- */
  var views = {};

  views.stats = function () {
    return api("GET", "/api/admin/stats").then(function (d) {
      var s = d.stats;
      var total = Math.max(1, s.users);
      var planColors = { trial: "#7c6cff", start: "#22d3ee", pro: "#34d399", business: "#fbbf24" };
      var bar = Object.keys(s.by_plan).map(function (p) {
        return '<span style="width:' + Math.round(s.by_plan[p] / total * 100) + '%;background:' +
          (planColors[p] || "#888") + '" title="' + esc(p) + ': ' + s.by_plan[p] + '"></span>';
      }).join("");
      var legend = Object.keys(s.by_plan).map(function (p) {
        return '<span><i style="background:' + (planColors[p] || "#888") + '"></i>' + esc(p) + " — " + s.by_plan[p] + "</span>";
      }).join("");
      var recent = s.recent_users.map(function (u) {
        return "<tr><td>" + esc(u.email) + "</td><td>" + esc(u.name) + "</td><td>" + esc(u.plan) + "</td><td>" + dt(u.created_at) + "</td></tr>";
      }).join("");
      return '<div class="page-head-app"><h1>Статистика</h1><p>Общая картина по копии сервиса.</p></div>' +
        '<div class="admin-kpis">' +
        kpi("Пользователей", s.users) + kpi("Заблокировано", s.blocked, s.blocked ? "warn" : "") +
        kpi("Проектов", s.projects) + kpi("Постов", s.posts) +
        kpi("Опубликовано", s.published, "good") + kpi("Подключений соцсетей", s.socials) +
        kpi("Просмотров", fmt(s.views)) + kpi("Демо-выручка", fmt(s.revenue) + " ₽") +
        "</div>" +
        '<div class="panel"><h2>Распределение по тарифам</h2><div class="plan-bar">' + bar + "</div>" +
        '<div class="plan-legend">' + legend + "</div></div>" +
        '<div class="panel"><h2>Новые пользователи</h2><div class="table-wrap-app"><table class="app-table">' +
        "<thead><tr><th>Email</th><th>Имя</th><th>Тариф</th><th>Регистрация</th></tr></thead><tbody>" +
        recent + "</tbody></table></div></div>";
    });
  };

  views.users = function () {
    return api("GET", "/api/admin/users").then(function (d) {
      var rows = d.users.map(function (u) {
        var planOpts = ["trial", "start", "pro", "business"].map(function (p) {
          return '<option value="' + p + '"' + (p === u.plan ? " selected" : "") + ">" + p + "</option>";
        }).join("");
        return "<tr>" +
          "<td>" + u.id + "</td>" +
          "<td>" + esc(u.email) + (u.is_admin ? ' <span class="tag-admin">ADMIN</span>' : "") + "</td>" +
          "<td>" + esc(u.name) + "</td>" +
          "<td>" + esc(u.plan) + "</td>" +
          "<td>" + fmt(u.posts_balance) + "</td>" +
          "<td>" + u.projects + "</td><td>" + u.posts + "</td>" +
          "<td>" + (u.blocked ? '<span class="tag-blocked">заблокирован</span>' : '<span class="tag-ok">активен</span>') + "</td>" +
          "<td>" + dt(u.created_at) + "</td>" +
          '<td><div class="row-actions">' +
          '<button class="btn btn-ghost" data-act="block" data-id="' + u.id + '" data-val="' + (u.blocked ? 0 : 1) + '">' +
          (u.blocked ? "Разблокить" : "Заблокировать") + "</button>" +
          '<select data-plan-select="' + u.id + '">' + planOpts + "</select>" +
          '<button class="btn btn-ghost" data-act="plan" data-id="' + u.id + '">Тариф</button>' +
          '<button class="btn btn-ghost" data-act="balance" data-id="' + u.id + '" data-val="50">+50</button>' +
          '<button class="btn btn-ghost" data-act="balance" data-id="' + u.id + '" data-val="-50">−50</button>' +
          '<button class="btn btn-ghost" data-act="admin" data-id="' + u.id + '">Админ</button>' +
          "</div></td></tr>";
      }).join("");
      return '<div class="page-head-app"><h1>Пользователи (' + d.users.length + ")</h1>" +
        "<p>Управление аккаунтами, тарифами и балансом постов.</p></div>" +
        '<div class="panel"><div class="table-wrap-app"><table class="app-table">' +
        "<thead><tr><th>ID</th><th>Email</th><th>Имя</th><th>Тариф</th><th>Баланс</th><th>Проекты</th>" +
        "<th>Посты</th><th>Статус</th><th>Создан</th><th>Действия</th></tr></thead><tbody>" +
        rows + "</tbody></table></div></div>";
    });
  };

  views.posts = function () {
    return api("GET", "/api/admin/posts").then(function (d) {
      var rows = d.posts.map(function (p) {
        var statusCls = { draft: "draft", approved: "approved", scheduled: "scheduled", published: "published" }[p.status] || "draft";
        return "<tr><td>" + p.id + "</td><td>" + esc(p.title.slice(0, 55)) + "</td>" +
          "<td>" + esc(p.user_email) + "</td><td>" + esc(p.project_name) + "</td>" +
          '<td><span class="status ' + statusCls + '">' + esc(p.status) + "</span></td>" +
          "<td>" + fmt(p.views) + "</td><td>" + dt(p.created_at) + "</td></tr>";
      }).join("");
      return '<div class="page-head-app"><h1>Посты (' + d.posts.length + ")</h1>" +
        "<p>Последние публикации всех пользователей.</p></div>" +
        '<div class="panel"><div class="table-wrap-app"><table class="app-table">' +
        "<thead><tr><th>ID</th><th>Заголовок</th><th>Владелец</th><th>Проект</th><th>Статус</th>" +
        "<th>Просмотры</th><th>Создан</th></tr></thead><tbody>" +
        (rows || '<tr><td colspan="7">Постов пока нет.</td></tr>') + "</tbody></table></div></div>";
    });
  };

  views.payments = function () {
    return api("GET", "/api/admin/payments").then(function (d) {
      var rows = d.payments.map(function (p) {
        var item = p.kind === "plan" ? "Тариф " + p.item : "Пакет постов +" + p.item;
        return "<tr><td>" + p.id + "</td><td>" + esc(p.user_email) + "</td><td>" + esc(item) + "</td>" +
          "<td>" + fmt(p.amount) + " ₽</td><td>" + (p.period || "—") + "</td><td>" + dt(p.created_at) + "</td></tr>";
      }).join("");
      return '<div class="page-head-app"><h1>Платежи (' + d.payments.length + ")</h1>" +
        "<p>История демо-оплат всех пользователей.</p></div>" +
        '<div class="panel"><div class="table-wrap-app"><table class="app-table">' +
        "<thead><tr><th>ID</th><th>Пользователь</th><th>Что</th><th>Сумма</th><th>Период</th><th>Дата</th></tr></thead><tbody>" +
        (rows || '<tr><td colspan="6">Платежей пока нет.</td></tr>') + "</tbody></table></div></div>";
    });
  };

  function kpi(label, value, cls) {
    return '<div class="kpi-card ' + (cls || "") + '"><b>' + value + "</b><span>" + label + "</span></div>";
  }

  /* ---------- рендер ---------- */
  var titles = { stats: "Статистика", users: "Пользователи", posts: "Посты", payments: "Платежи" };

  function render() {
    $("#admin-title").textContent = titles[route] || "Админка";
    document.querySelectorAll("#admin-nav a").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-nav") === route);
    });
    content.innerHTML = '<div class="loading">Загрузка…</div>';
    views[route]().then(function (html) {
      content.innerHTML = html;
      bindActions();
    }).catch(function (e) {
      content.innerHTML = '<div class="empty">Ошибка загрузки: ' + esc(e.message) + "</div>";
    });
  }

  function bindActions() {
    content.querySelectorAll("[data-act]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-id");
        var act = btn.getAttribute("data-act");
        var val = btn.getAttribute("data-val");
        var payload = { action: act };
        if (act === "block") payload.blocked = val === "1";
        if (act === "plan") {
          var sel = content.querySelector('[data-plan-select="' + id + '"]');
          payload.plan = sel.value;
        }
        if (act === "balance") payload.posts = parseInt(val, 10);
        api("POST", "/api/admin/users/" + id, payload).then(function (d) {
          toast(d.message);
          render();
        }).catch(function (e) { toast(e.message, true); });
      };
    });
  }

  /* ---------- инициализация ---------- */
  $("#admin-burger").onclick = function () { document.querySelector(".sidebar").classList.toggle("open"); };
  $("#admin-logout").onclick = function () {
    api("POST", "/api/logout", {}).then(function () {
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
      location.href = "/";
    }).catch(function () { location.href = "/"; });
  };

  window.addEventListener("hashchange", function () {
    var r = location.hash.replace(/^#\/?/, "") || "stats";
    if (views[r]) { route = r; render(); }
  });

  api("GET", "/api/me").then(function (d) {
    if (!d.user.is_admin) {
      $("#admin").hidden = true;
      $("#admin-denied").hidden = false;
      $("#denied-msg").textContent = "Вы вошли как " + d.user.email + ", но у этого аккаунта нет прав администратора.";
      return;
    }
    $("#admin").hidden = false;
    $("#admin-user").textContent = d.user.email;
    var r = location.hash.replace(/^#\/?/, "") || "stats";
    route = views[r] ? r : "stats";
    render();
  }).catch(function () {
    $("#admin").hidden = true;
    $("#admin-denied").hidden = false;
    $("#denied-msg").textContent = "Войдите под аккаунтом администратора, чтобы открыть панель.";
  });
})();
