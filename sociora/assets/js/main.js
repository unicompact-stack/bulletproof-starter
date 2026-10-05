/* ============================================================
   Sociora — интерактивность лендинга (без внешних зависимостей)
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Шапка: тень при скролле ---------- */
  var header = document.querySelector(".site-header");
  function onScroll() {
    if (header) header.classList.toggle("scrolled", window.scrollY > 10);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Мобильное меню ---------- */
  var burger = document.querySelector(".burger");
  var mobileNav = document.querySelector(".mobile-nav");
  if (burger && mobileNav) {
    burger.addEventListener("click", function () {
      var open = mobileNav.classList.toggle("open");
      burger.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    mobileNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        mobileNav.classList.remove("open");
        burger.classList.remove("open");
      });
    });
  }

  /* ---------- Переключатель тарифов: месяц / год ---------- */
  var billing = document.querySelector("[data-billing]");
  if (billing) {
    var buttons = billing.querySelectorAll("button[data-period]");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        buttons.forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        var period = btn.getAttribute("data-period");
        document.querySelectorAll("[data-price]").forEach(function (el) {
          var monthly = parseInt(el.getAttribute("data-monthly"), 10);
          var yearly = parseInt(el.getAttribute("data-yearly"), 10);
          var value = period === "year" ? yearly : monthly;
          animateNumber(el, value);
        });
        document.querySelectorAll("[data-price-sub]").forEach(function (el) {
          el.textContent = period === "year" ? "в месяц при оплате за год · −17%" : "в месяц · помесячно";
        });
      });
    });
  }

  function animateNumber(el, target) {
    var start = parseInt(el.textContent.replace(/\s/g, ""), 10);
    if (isNaN(start)) start = 0;
    if (start === target) { el.textContent = fmt(target); return; }
    var t0 = null;
    var dur = 350;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(start + (target - start) * eased));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function fmt(n) { return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " "); }

  /* ---------- Табы аналитики ---------- */
  var tabs = document.querySelectorAll("[data-tab]");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var group = tab.closest("[data-tabs]");
      group.querySelectorAll("[data-tab]").forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      var key = tab.getAttribute("data-tab");
      var panel = document.querySelector('[data-panel="' + key + '"]');
      document.querySelectorAll("[data-panel]").forEach(function (p) { p.hidden = true; });
      if (panel) {
        panel.hidden = false;
        renderPanel(panel);
      }
    });
  });

  /* ---------- Отрисовка графиков и полос ---------- */
  function renderPanel(panel) {
    var chart = panel.querySelector(".chart");
    if (chart) {
      chart.classList.remove("visible");
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { chart.classList.add("visible"); });
      });
    }
    panel.querySelectorAll(".voice-row .fill").forEach(function (fill) {
      var w = fill.getAttribute("data-w") + "%";
      fill.style.width = "0";
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { fill.style.width = w; });
      });
    });
  }

  /* ---------- Появление при скролле ---------- */
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        if (entry.target.classList.contains("chart")) {
          entry.target.classList.add("visible");
        }
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll(".reveal, .chart").forEach(function (el) { observer.observe(el); });

  /* ---------- Демо-генератор постов ---------- */
  var TEMPLATES = {
    beauty: {
      title: "3 ошибки ухода за волосами, из-за которых они тускнеют к обеду",
      body:
        "Знакомо: утром укладка как из салона, а уже после обеда — «каша»?\n\n" +
        "Разберём три ошибки, которые делают почти все 👇\n\n" +
        "1️⃣ Мыш шампунь на длинные кончики. Его задача — кожа головы. Кончики достаточно пены, которая стекает.\n\n" +
        "2️⃣ Полотенце + фен на максимальном. Мокрые волосыные чешуйки раскрыты — трение ломает их. Только легкое промакивание и средний нагрев.\n\n" +
        "3️⃣ Никакого термозащиты перед укладкой. Это как загар без солнцезащитного — эффект есть, но счёт потом предъявит длина.\n\n" +
        "Попробуйте убрать одну ошибку на этой неделе — и напишите, что изменилось 💬\n\n" +
        "А если хотите разбор именно вашей ситуации — запишитесь на бесплатную консультацию, подберём уход под ваш тип волос."
    },
    coffee: {
      title: "Почему один и тот же кофе дома вкуснее не получается",
      body:
        "Загадка, которую нам в кофейне задают каждую неделю: «Рецепт тот же, зёрна те же — а вкус не тот».\n\n" +
        "Обычно дело в трёх мелочах 👇\n\n" +
        "☕ Вода. Кофе на 98% вода. Слишком твёрдая — вкус «плоский», слишком мягкая — кислый. Золотая середина — 75–150 ppm.\n\n" +
        "⚖️ Пропорции. Слегка переборщили с массой — и напиток стал горьким. Весы на кухне решают больше, чем любой способ.\n\n" +
        "⏱️ Время. Перемололи заранее? Через 15 минут аромат уже ушел. Мелем перед каждым проливом.\n\n" +
        "Проверьте эти три пункта — и напишите, получилось ли ❤️\n\n" +
        "А если лень возиться — заходите, сварим как надо. Наше сезонное меню уже на баре."
    },
    fitness: {
      title: "5 минут разминки, которые спасут спину на тренировке",
      body:
        "«У меня нет времени разминаться» — знакомая фраза? Именно она приводит к первым травмам.\n\n" +
        "Вот комплекс на 5 минут, который делаем перед каждой тренировкой 👇\n\n" +
        "1️⃣ Круговые вращения суставами — 1 минута. Шея, плечи, таз, колени.\n\n" +
        "2️⃣ Кошка-корова — 10 повторов. Разогреваем позвоночник в двух плоскостях.\n\n" +
        "3️⃣ Мост с удержанием — 3 подхода по 20 секунд. Включаем ягодицы и заднюю цепь.\n\n" +
        "4️⃣ Лёгкий скакалка или stepping — 2 минуты. Пульс до 110–120, не больше.\n\n" +
        "5️⃣ Глубокий присед с удержанием — 30 секунд. Проверяем мобильность.\n\n" +
        "Пять минут — и тренировка идёт вдвое продуктивнее. Сохраняйте, чтобы не потерять 📌\n\n" +
        "Хотите программу под вашу цель? Запишитесь на бесплатную пробную тренировку."
    },
    generic: {
      title: "Разбор: как мы решаем главную задачу клиентов в сфере «{NICHE}»",
      body:
        "Сегодня разберём типичную ситуацию в нише «{NICHE}» — с ней к нам приходят почти каждый день.\n\n" +
        "В чём проблема 👇\n\n" +
        "Клиенты приходят с одним и тем же запросом, но объясняют его по-разному. И пока разбираешься, что именно нужно, время уходит.\n\n" +
        "Как мы это решаем:\n\n" +
        "1️⃣ Сначала диагностика — 10 минут, чтобы понять задачу, а не угадать.\n\n" +
        "2️⃣ Показываем вариант решения с ценой и сроками заранее. Без сюрпризов.\n\n" +
        "3️⃣ Держим связь на каждом этапе — вы всегда знаете, что происходит.\n\n" +
        "Результат: меньше хаоса, больше предсказуемости.\n\n" +
        "Если узнали свою ситуацию — напишите нам в личные сообщения, разберём ваш случай 💬"
    }
  };

  var NICHE_MAP = [
    { keys: ["салон", "красот", "ногт", "волос", "барбер", "бров", "космет", "массаж"], tpl: "beauty" },
    { keys: ["кофе", "кофейн", "кафе", "пекар", "ресторан", "бар ", "столов"], tpl: "coffee" },
    { keys: ["фитнес", "спорт", "тренир", "зал", "йога", "танц"], tpl: "fitness" }
  ];

  var demoInput = document.querySelector("[data-demo-input]");
  var demoBtn = document.querySelector("[data-demo-btn]");
  var demoOut = document.querySelector("[data-demo-output]");
  var demoHint = document.querySelector("[data-demo-hint]");
  var demoRegen = document.querySelector("[data-demo-regen]");
  var demoTitle = document.querySelector("[data-demo-title]");
  var demoBody = document.querySelector("[data-demo-body]");
  var demoChannel = document.querySelector("[data-demo-channel]");

  function pickTemplate(niche) {
    var n = (niche || "").toLowerCase();
    for (var i = 0; i < NICHE_MAP.length; i++) {
      var item = NICHE_MAP[i];
      for (var j = 0; j < item.keys.length; j++) {
        if (n.indexOf(item.keys[j]) !== -1) return item.tpl;
      }
    }
    return "generic";
  }

  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function generate(niche) {
    if (!niche || !niche.trim()) {
      if (demoHint) {
        demoHint.textContent = "👆 Введите нишу выше или нажмите на пример, чтобы увидеть демо-пост";
        demoHint.style.color = "#f87171";
      }
      return;
    }
    var tplKey = pickTemplate(niche);
    var tpl = TEMPLATES[tplKey];
    var title = tpl.title.replace(/\{NICHE\}/g, capitalize(niche.trim()));
    var body = tpl.body.replace(/\{NICHE\}/g, capitalize(niche.trim()));
    if (demoTitle) demoTitle.textContent = title;
    if (demoBody) demoBody.textContent = body;
    if (demoChannel) demoChannel.textContent = capitalize(niche.trim()) + " · демо";
    if (demoHint) {
      demoHint.textContent = "✓ Это демо-пример того, что ИИ Sociora напишет для вашей ниши. В сервисе — 10–15 таких тем и полные посты с картинками.";
      demoHint.style.color = "";
    }
    if (demoOut) {
      demoOut.classList.add("show");
      demoOut.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  if (demoBtn && demoInput) {
    demoBtn.addEventListener("click", function () { generate(demoInput.value); });
    demoInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); generate(demoInput.value); }
    });
  }
  if (demoRegen && demoInput) {
    demoRegen.addEventListener("click", function () { generate(demoInput.value); });
  }
  document.querySelectorAll("[data-niche]").forEach(function (chip) {
    chip.addEventListener("click", function () {
      var niche = chip.getAttribute("data-niche");
      if (demoInput) demoInput.value = niche;
      generate(niche);
    });
  });

  /* ---------- Cookie-баннер ---------- */
  var banner = document.querySelector("[data-cookie-banner]");
  if (banner) {
    var KEY = "sociora_cookie_consent";
    var accepted = false;
    try { accepted = localStorage.getItem(KEY) === "1"; } catch (e) {}
    if (!accepted) {
      setTimeout(function () { banner.classList.add("show"); }, 900);
    }
    banner.querySelectorAll("[data-cookie-accept]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        try { localStorage.setItem(KEY, "1"); } catch (e) {}
        banner.classList.remove("show");
      });
    });
  }

  /* ---------- Год в подвале ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
