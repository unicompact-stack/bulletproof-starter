#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sociora — генератор статической копии сайта sociora.ru.

Что делает:
  1. Читает markdown-контент страниц из ./content/
  2. Рендерит HTML по общей дизайн-системе (assets/css/styles.css + assets/js/main.js)
  3. Собирает главную страницу (лендинг) из секций
  4. Генерирует robots.txt, sitemap.xml, llms.txt и 404.html

Запуск:  python3 build.py
Результат: HTML-файлы в этой же папке (отдаются любым статическим сервером).
"""

import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT

REGISTER_URL = "/register"          # локальная регистрация (копия)
LOGIN_URL = "/login"
APP_URL = "/app"
SUPPORT_TG = "https://t.me/sociora_support"
SITE = "https://sociora.ru"
APP_SITE = "https://app.sociora.ru"

# ------------------------------------------------------------
# Карта страниц: (slug, md-файл, title, description, freq, priority)
# ------------------------------------------------------------
PAGES = [
    ("servis-avtopostinga", "servis-avtopostinga.md",
     "Сервис автопостинга на ИИ для TG, ВК и MAX | Sociora",
     "Сервис автопостинга на ИИ: Sociora сам пишет посты, генерирует картинки и публикует их по расписанию в Telegram, ВКонтакте и MAX.", "monthly", "0.8"),
    ("avtopostng-telegram", "avtopostng-telegram.md",
     "Автопостинг в Telegram — отложенный постинг | Sociora",
     "Автопостинг в Telegram через бота-администратора: отложенные публикации по расписанию, посты пишет ИИ. Настройка за 2 минуты.", "monthly", "0.8"),
    ("avtopostng-vkontakte", "avtopostng-vkontakte.md",
     "Автопостинг во ВКонтакте — отложенные посты | Sociora",
     "Автопостинг во ВКонтакте: публикация записей в сообщество по расписанию с учётом умной ленты, опросов и клипов.", "monthly", "0.8"),
    ("krosspostng-v-max", "krosspostng-v-max.md",
     "Кросспостинг в MAX из Telegram и ВКонтакте | Sociora",
     "Кросспостинг в MAX: публикация постов в канал нового российского мессенджера одновременно с Telegram и ВКонтакте.", "monthly", "0.8"),
    ("krosspostng", "krosspostng.md",
     "Кросспостинг и мультипостинг во все соцсети | Sociora",
     "Кросспостинг и мультипостинг: один пост публикуется сразу в Telegram, ВКонтакте и MAX с адаптацией под каждую сеть.", "monthly", "0.8"),
    ("neiroset-dlya-postov", "neiroset-dlya-postov.md",
     "Нейросеть для постов: ИИ пишет тексты | Sociora",
     "Нейросеть для постов: ИИ пишет тексты под нишу и стиль канала, адаптирует под Telegram, ВКонтакте и MAX и генерирует картинки.", "monthly", "0.8"),
    ("kontent-plan", "kontent-plan.md",
     "Контент-план для соцсетей: шаблон и примеры | Sociora",
     "Контент-план для соцсетей: как составить, готовый шаблон на неделю, примеры тем по нишам и банк идей. Sociora составляет план автоматически.", "monthly", "0.8"),
    ("oformlenie-postov", "oformlenie-postov.md",
     "Карусели и оформление постов для соцсетей | Sociora",
     "Оформление постов и карусели: приёмы оформления текста, размеры слайдов, чек-лист перед публикацией. Sociora оформляет контент автоматически.", "monthly", "0.8"),
    ("zamena-smm", "zamena-smm.md",
     "Чем заменить SMM-специалиста: ИИ вместо смм | Sociora",
     "Чем заменить SMM-специалиста: сравнение затрат на копирайтера, агентство и ИИ-сервис Sociora. Экономия до 28 300 ₽ в месяц.", "monthly", "0.8"),
    ("analogi-smmplanner", "analogi-smmplanner.md",
     "Аналоги SMMplanner, LiveDune и Postmypost | Sociora",
     "Честное сравнение Sociora с SMMplanner, LiveDune и Postmypost: в чём разница между планировщиком и ИИ-агентом, который пишет посты сам.", "monthly", "0.8"),
    ("about", "about.md",
     "О компании — Sociora",
     "Sociora — сервис, который ведёт социальные сети с помощью ИИ: пишет посты в стиле канала, публикует по расписанию и анализирует результат.", "monthly", "0.5"),
    ("contacts", "contacts.md",
     "Контакты — Sociora",
     "Свяжитесь с командой Sociora: email, телефон, Telegram. Реквизиты ИП и юридические документы.", "monthly", "0.5"),
    ("offer", "offer.md",
     "Договор оферты — Sociora",
     "Договор публичной оферты на оказание услуг сервиса Sociora: тарифы, порядок оплаты, возврат средств, ответственность сторон.", "monthly", "0.3"),
    ("privacy", "privacy.md",
     "Политика обработки персональных данных — Sociora",
     "Политика обработки персональных данных сервиса Sociora в соответствии с 152-ФЗ: категории данных, цели, сроки, меры защиты.", "monthly", "0.3"),
    ("terms", "terms.md",
     "Пользовательское соглашение — Sociora",
     "Пользовательское соглашение сервиса Sociora: регистрация, описание сервиса, тарифы, права и обязанности сторон.", "monthly", "0.3"),
    ("cookies", "cookies.md",
     "Политика использования файлов cookie — Sociora",
     "Какие файлы cookie использует Sociora, зачем они нужны, как ими управлять и отозвать согласие.", "monthly", "0.3"),
    ("consent", "consent.md",
     "Согласие на обработку персональных данных — Sociora",
     "Согласие субъекта персональных данных на обработку данных сервисом Sociora в соответствии с 152-ФЗ.", "monthly", "0.3"),
]

LEGAL = {"offer", "privacy", "terms", "cookies", "consent"}

LLMS_TXT = """# Sociora

> Sociora — сервис автоматического ведения социальных сетей на основе искусственного интеллекта. ИИ пишет посты в стиле вашего канала, публикует их по расписанию и анализирует результат в Telegram, ВКонтакте и MAX.

В отличие от классических планировщиков (SMMplanner, LiveDune, Postmypost), которые только публикуют готовый контент, Sociora создаёт контент сам: придумывает темы, пишет тексты под нишу, генерирует изображения и обучается голосу конкретного канала. Сервис рассчитан на малый бизнес, экспертов и предпринимателей, которые ведут соцсети самостоятельно и хотят снять с себя ежедневную рутину. Поддерживает новый российский мессенджер MAX, кросспостинг в три сети из одного поста, тарифы с бесплатным пробным периодом.

## Продукт

- [Сервис автопостинга на ИИ](https://sociora.ru/servis-avtopostinga): обзор возможностей сервиса — генерация, публикация и аналитика для трёх соцсетей.
- [Автопостинг в Telegram](https://sociora.ru/avtopostng-telegram): автопостинг в Telegram-канал через бота, отложенные публикации, специфика хронологической ленты.
- [Автопостинг во ВКонтакте](https://sociora.ru/avtopostng-vkontakte): публикация в сообщества ВК с учётом умной ленты, клипов и опросов.
- [Кросспостинг в MAX](https://sociora.ru/krosspostng-v-max): публикация в новый мессенджер MAX одновременно с Telegram и ВКонтакте.
- [Кросспостинг и мультипостинг](https://sociora.ru/krosspostng): один пост сразу во все подключённые соцсети без ручного копирования.
- [Нейросеть для постов](https://sociora.ru/neiroset-dlya-postov): ИИ пишет тексты постов под нишу и стиль канала.
- [Контент-план для соцсетей](https://sociora.ru/kontent-plan): как составить контент-план, готовый шаблон и банк идей; ИИ составляет план автоматически.
- [Карусели и оформление постов](https://sociora.ru/oformlenie-postov): оформление постов, карусели, форматы и структура под каждую сеть.
- [Чем заменить SMM-специалиста](https://sociora.ru/zamena-smm): как ИИ берёт на себя ведение соцсетей вместо штатного SMM-специалиста.
- [Аналоги SMMplanner, LiveDune, Postmypost](https://sociora.ru/analogi-smmplanner): сравнение Sociora с популярными сервисами и в чём ключевые отличия.

## О компании

- [О компании Sociora](https://sociora.ru/about): что такое Sociora, какую задачу решает, как работает, кому подходит; реквизиты ИП.

## Optional

- [Договор-оферта](https://sociora.ru/offer): условия оказания услуг сервиса.
- [Политика обработки персональных данных](https://sociora.ru/privacy): обработка персональных данных в соответствии с 152-ФЗ.
"""

ROBOTS_TXT = """User-agent: *
Allow: /

Sitemap: https://sociora.ru/sitemap.xml

# AI discovery file
# llms.txt: https://sociora.ru/llms.txt

Clean-param: yclid&ysclid&utm_source&utm_medium&utm_campaign&utm_content&utm_term&from&gclid /
"""

# ------------------------------------------------------------
# Markdown → HTML
# ------------------------------------------------------------

def esc(s):
    return html.escape(s, quote=False)


def local_url(url):
    """Преобразует ссылку sociora.ru / app.sociora.ru в локальный файл копии."""
    if url.startswith(SITE):
        path = url[len(SITE):]
    elif url.startswith(APP_SITE):
        path = url[len(APP_SITE):]
    else:
        return url
    path = path.strip("/")
    if not path:
        return "index.html"
    if path.startswith("#"):
        return "index.html" + path
    anchor = ""
    if "#" in path:
        path, anchor = path.split("#", 1)
        anchor = "#" + anchor
    slug = path[:-1] if path.endswith("/") else path
    if slug.endswith(".html"):
        slug = slug[:-5]
    return slug + ".html" + anchor


def md_inline(text):
    text = esc(text)

    def link_repl(m):
        label, url = m.group(1), m.group(2)
        if url.startswith(SITE):
            return '<a href="%s">%s</a>' % (local_url(url), label)
        return '<a href="%s" target="_blank" rel="noopener">%s</a>' % (url, label)

    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link_repl, text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    return text


def md_to_html(md):
    """Простой конвертер markdown (заголовки, списки, таблицы, ссылки, bold, hr)."""
    lines = md.split("\n")
    out = []
    i = 0
    para = []

    def flush_para():
        if para:
            out.append("<p>%s</p>" % md_inline(" ".join(para)))
            para.clear()

    while i < len(lines):
        line = lines[i].rstrip()
        stripped = line.strip()

        if not stripped:
            flush_para()
            i += 1
            continue

        if stripped == "* * *":
            flush_para()
            out.append("<hr>")
            i += 1
            continue

        m = re.match(r"^(#{2,3})\s+(.*)$", stripped)
        if m:
            flush_para()
            level = len(m.group(1))
            out.append("<h%d>%s</h%d>" % (level, md_inline(m.group(2)), level))
            i += 1
            continue

        # Таблица
        if stripped.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[\s:\-|]+\|$", lines[i + 1].strip()):
            flush_para()
            header = [c.strip() for c in stripped.strip("|").split("|")]
            i += 2
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            t = ['<div class="table-wrap"><table><thead><tr>']
            t += ["<th>%s</th>" % md_inline(c) for c in header]
            t.append("</tr></thead><tbody>")
            for r in rows:
                t.append("<tr>")
                t += ["<td>%s</td>" % md_inline(c) for c in r]
                t.append("</tr>")
            t.append("</tbody></table></div>")
            out.append("".join(t))
            continue

        # Нумерованный список
        if re.match(r"^\d+\.\s", stripped):
            flush_para()
            items = []
            while i < len(lines) and re.match(r"^\d+\.\s", lines[i].strip()):
                items.append("<li>%s</li>" % md_inline(re.sub(r"^\d+\.\s+", "", lines[i].strip())))
                i += 1
            out.append("<ol>%s</ol>" % "".join(items))
            continue

        # Маркированный список
        if stripped.startswith("- "):
            flush_para()
            items = []
            while i < len(lines) and lines[i].strip().startswith("- "):
                items.append("<li>%s</li>" % md_inline(lines[i].strip()[2:]))
                i += 1
            out.append("<ul>%s</ul>" % "".join(items))
            continue

        para.append(stripped)
        i += 1

    flush_para()
    return "\n".join(out)


def split_md(md):
    """Делит markdown на (h1, lead, остаток)."""
    lines = md.split("\n")
    h1 = ""
    lead_lines = []
    rest_start = 0
    for idx, line in enumerate(lines):
        if line.startswith("# ") and not line.startswith("## "):
            h1 = line[2:].strip()
            rest_start = idx + 1
            break
    body = lines[rest_start:]
    # lead — первый абзац после H1
    j = 0
    while j < len(body) and not body[j].strip():
        j += 1
    while j < len(body) and body[j].strip():
        lead_lines.append(body[j].strip())
        j += 1
    rest = body[j:]
    return h1, " ".join(lead_lines), "\n".join(rest).strip()

# ------------------------------------------------------------
# Общий каркас страницы
# ------------------------------------------------------------

FOOTER_COLS = [
    ("Продукт", [
        ("servis-avtopostinga.html", "Сервис автопостинга"),
        ("avtopostng-telegram.html", "Автопостинг в Telegram"),
        ("avtopostng-vkontakte.html", "Автопостинг во ВКонтакте"),
        ("krosspostng-v-max.html", "Кросспостинг в MAX"),
        ("krosspostng.html", "Кросспостинг"),
        ("neiroset-dlya-postov.html", "Нейросеть для постов"),
    ]),
    ("Решения", [
        ("kontent-plan.html", "Контент-план"),
        ("oformlenie-postov.html", "Оформление постов"),
        ("zamena-smm.html", "Замена SMM-специалиста"),
        ("analogi-smmplanner.html", "Аналоги SMMplanner"),
    ]),
    ("Компания", [
        ("about.html", "О компании"),
        ("contacts.html", "Контакты"),
    ]),
    ("Документы", [
        ("offer.html", "Договор оферты"),
        ("privacy.html", "Политика ПД"),
        ("terms.html", "Пользовательское соглашение"),
        ("cookies.html", "Политика cookie"),
        ("consent.html", "Согласие на обработку ПД"),
    ]),
]

MAIN_NAV = [
    ("index.html#how", "Как работает"),
    ("index.html#features", "Возможности"),
    ("index.html#pricing", "Тарифы"),
    ("index.html#faq", "FAQ"),
]

INNER_NAV = [
    ("index.html", "Главная"),
    ("servis-avtopostinga.html", "О сервисе"),
    ("index.html#pricing", "Тарифы"),
    ("index.html#faq", "FAQ"),
    ("contacts.html", "Контакты"),
]


def header(nav, home):
    links = "".join('<a href="%s">%s</a>' % (href, label) for href, label in nav)
    return """
<header class="site-header">
  <div class="container header-inner">
    <a class="logo" href="{home}"><span class="logo-mark">S</span>Sociora</a>
    <nav class="nav">{links}</nav>
    <div class="header-actions">
      <a class="btn btn-ghost btn-sm" href="{login}">Войти</a>
      <a class="btn btn-primary btn-sm" href="{reg}">Попробовать бесплатно</a>
    </div>
    <button class="burger" aria-label="Меню" aria-expanded="false"><span></span><span></span><span></span></button>
  </div>
  <nav class="mobile-nav">{links}
    <a class="btn btn-primary" href="{reg}">Попробовать бесплатно</a>
    <a class="btn btn-ghost" href="{login}">Войти</a>
  </nav>
</header>
""".format(links=links, home=home, reg=REGISTER_URL, login=LOGIN_URL)


def footer():
    cols = []
    for title, items in FOOTER_COLS:
        lis = "".join('<li><a href="%s">%s</a></li>' % (h, t) for h, t in items)
        cols.append('<div class="footer-col"><h4>%s</h4><ul>%s</ul></div>' % (title, lis))
    return """
<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <a class="logo" href="index.html"><span class="logo-mark">S</span>Sociora</a>
        <p>ИИ-агент для соцсетей: пишет посты, генерирует картинки и публикует в Telegram, ВКонтакте и MAX по расписанию.</p>
      </div>
      {cols}
    </div>
    <div class="footer-bottom">
      <span>© <span data-year>2026</span> Sociora · ИП Широков В. А. · ИНН 165713646340</span>
      <nav class="legal">
        <a href="offer.html">Оферта</a>
        <a href="privacy.html">Политика ПД</a>
        <a href="terms.html">Соглашение</a>
        <a href="cookies.html">Cookie</a>
      </nav>
    </div>
  </div>
</footer>
""".format(cols="".join(cols))


def cookie_banner():
    return """
<div class="cookie-banner" data-cookie-banner role="dialog" aria-label="Cookie">
  <p>Мы используем cookie и Яндекс Метрику, чтобы сайт работал корректно и чтобы понимать, как им пользуются. Продолжая пользоваться сайтом, вы соглашаетесь с <a href="cookies.html">политикой использования cookie</a>.</p>
  <button class="btn btn-primary btn-sm" data-cookie-accept>Принять</button>
</div>
"""


def page(title, description, nav, home, body, extra_head=""):
    return """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:locale" content="ru_RU">
<meta name="theme-color" content="#0a0a13">
<link rel="canonical" href="{site}/">
{extra}
<link rel="stylesheet" href="assets/css/styles.css">
</head>
<body>
<div class="bg-glows"></div>
{header}
{body}
{footer}
{cookie}
<script src="assets/js/main.js"></script>
</body>
</html>
""".format(
        title=esc(title),
        desc=esc(description),
        site=SITE,
        extra=extra_head,
        header=header(nav, home),
        body=body,
        footer=footer(),
        cookie=cookie_banner(),
    )

# ------------------------------------------------------------
# Данные лендинга
# ------------------------------------------------------------

PROBLEMS = [
    ("😩", "Постов нет неделями", "Вечером сесть за пост — не хватает сил. Утром — нет идей. Соцсети умирают."),
    ("💸", "Копирайтер берёт 30 000 ₽/мес", "И всё равно посты получаются скучные. А SMM-агентство — вообще от 80 000 ₽."),
    ("🤯", "Идеи кончаются за 2 недели", "Первые 10 постов написать легко. Дальше — ступор и тишина."),
    ("⏰", "Уходит 2-3 часа на 1 пост", "Придумать → написать → найти картинку → опубликовать. И так каждый день."),
    ("📉", "Подписчики уходят", "Нет постов — нет вовлечения. Нет вовлечения — алгоритмы прячут вас."),
    ("🔥", "Конкуренты постят каждый день", "А вы — раз в 2 недели «когда руки дойдут». Угадайте, к кому идут клиенты."),
]

STEPS = [
    ("🚀", "01", "Вы регистрируетесь", "Указываете сайт или нишу. ИИ за 30 секунд анализирует ваш бизнес и понимает, о чём писать.", "~1 минута"),
    ("💡", "02", "ИИ предлагает темы", "Получаете 10-15 направлений для контента: посты-истории, экспертные, продающие, развлекательные.", "~30 секунд"),
    ("🔗", "03", "Подключаете соцсети", "Telegram, ВКонтакте, MAX. Один пост — публикуется во все каналы с правильной разметкой.", "~2 минуты"),
    ("✨", "04", "Контент идёт автоматически", "ИИ генерирует посты, картинки и публикует по расписанию. Вы только одобряете — или меняете в один клик.", "каждый день"),
]

FEATURES = [
    ("📊", "Аналитика по всем сетям", "Просмотры, реакции и рост подписчиков в Telegram, ВКонтакте и MAX — в одном месте. Видите, какие посты заходят, а какие нет."),
    ("🧠", "ИИ-анализ результатов", "Сервис разбирает вашу статистику и даёт конкретные рекомендации: что публиковать дальше и как улучшить расписание."),
    ("🎉", "Праздничный календарь", "Не пропустите повод. Sociora напомнит о ближайшем празднике и создаст тематический пост в один клик."),
    ("👁️", "Превью как в соцсети", "Видите пост точно так же, как его увидит подписчик в Telegram, ВКонтакте или MAX — ещё до публикации."),
    ("🔗", "Один пост — три сети", "Telegram, ВКонтакте и MAX одновременно, с правильной разметкой под каждую площадку. Без копипаста."),
    ("🎨", "Картинки от ИИ", "К каждому посту — сгенерированная под тему картинка. Без стоков, фотографов и часов в редакторе."),
]

SELF_LEARNING = [
    "🎙️ ИИ пишет в голосе вашего канала, а не шаблонно",
    "📚 Учится на ваших постах — тон, темы, приёмы, что дают отклик",
    "📈 Чем дольше ведёте канал, тем точнее попадание",
    "⚙️ Работает само — профиль обновляется без ручной настройки",
]

ANALYTICS = {
    "all": {
        "label": "Общий",
        "kpis": [("1.2K", "Просмотры"), ("340", "Подписчики"), ("4.2%", "Вовлечённость")],
        "bars": [42, 58, 50, 74, 63, 88, 79],
        "days": ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
        "ai": "📈 Охваты выросли на 23% за месяц. Лучше всего заходят посты-истории в 19:00 — добавлю ещё два слота в это время.",
        "voice": [("Сторителлинг", 703), ("Информативный", 291), ("Рекламный", 599)],
    },
    "vk": {
        "label": "ВКонтакте",
        "kpis": [("860", "Просмотры"), ("180", "Подписчики"), ("5.1%", "Вовлечённость")],
        "bars": [30, 44, 62, 55, 70, 92, 66],
        "days": ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
        "ai": "📊 Умная лента ВК тянет записи с опросами: охват такой записи в 2.4 раза выше средней. Ставлю опрос на среду.",
        "voice": [("Подборки", 812), ("Кейсы", 540), ("Опросы", 690)],
    },
    "tg": {
        "label": "Telegram",
        "kpis": [("420", "Просмотры"), ("120", "Подписчики"), ("38", "Реакции")],
        "bars": [55, 48, 66, 72, 60, 84, 95],
        "days": ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
        "ai": "⏰ Пик просмотров — 20:30. Перенес вечернюю публикацию с 18:00 на 20:30, охват вырос на 17%.",
        "voice": [("Экспертные", 512), ("Разборы", 388), ("Анонсы", 265)],
    },
    "max": {
        "label": "MAX",
        "kpis": [("96", "Просмотры"), ("40", "Подписчиков"), ("480", "Просмотров/пост")],
        "bars": [18, 26, 22, 35, 30, 48, 41],
        "days": ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
        "ai": "🚀 Канал в MAX растёт быстрее всех: конкуренция низкая, ранние подписчики накапливаются. Рекомендую постить сюда чаще.",
        "voice": [("Полезные", 520), ("Новости", 310), ("Развлечения", 240)],
    },
}

PLANS = [
    {
        "name": "Start", "for": "Для самозанятых и экспертов",
        "monthly": 1290, "yearly": 12900, "per": "50 постов",
        "items": [
            ("50 постов в месяц", True), ("1 проект", True), ("1 соцсеть на выбор", True),
            ("до 10 тем", True), ("Картинки от ИИ", True), ("ИИ учится стилю вашего канала", True),
            ("Своя загрузка фото", True), ("Контент-план и расписание", True), ("Email-поддержка", True),
            ("Аналитика", False), ("Карусели и видео-сценарии", False), ("Анализ конкурентов", False),
        ],
        "cta": "Начать с Start", "popular": False,
    },
    {
        "name": "Pro", "for": "Для малого бизнеса",
        "monthly": 4200, "yearly": 41900, "per": "150 постов",
        "items": [
            ("150 постов в месяц", True), ("3 соцсети одновременно", True), ("до 30 тем", True),
            ("ИИ учится стилю вашего канала", True), ("Аналитика по всем сетям", True),
            ("Карусели и видео-сценарии", True), ("Анализ конкурентов — 2 раза в месяц", True),
            ("Своя загрузка фото", True), ("Приоритетная поддержка", True),
        ],
        "cta": "Хочу Pro", "popular": True,
    },
    {
        "name": "Business", "for": "Для брендов и нескольких проектов",
        "monthly": 11900, "yearly": 118900, "per": "300 постов",
        "items": [
            ("300 постов в месяц", True), ("до 3 проектов", True), ("3 соцсети на проект", True),
            ("до 100 тем", True), ("Картинки Premium-качества", True), ("ИИ учится стилю вашего канала", True),
            ("Аналитика по всем сетям", True), ("Карусели и видео-сценарии", True),
            ("Мониторинг 3 конкурентов", True), ("Менеджер в Telegram", True),
        ],
        "cta": "Выбрать Business", "popular": False,
    },
]

PACKS = [
    ("+10 постов", "290 ₽", "29.00 ₽ за пост"),
    ("+20 постов", "490 ₽", "24.50 ₽ за пост"),
    ("+30 постов", "590 ₽", "19.70 ₽ за пост"),
    ("+100 постов", "1 590 ₽", "15.90 ₽ за пост"),
    ("+500 постов", "6 990 ₽", "13.98 ₽ за пост"),
]

FAQ = [
    ("Действительно ли это бесплатно? В чём подвох?",
     "Нет подвоха. Trial — это полные 7 дней с 15 постами в подарок. Без привязки карты, без автоматического списания. Если понравится — выбираете тариф и продолжаете. Если нет — просто не оплачиваете."),
    ("А что если ИИ напишет ерунду?",
     "Каждый пост проходит ваше одобрение. Не нравится — нажимаете «Перегенерировать», ИИ переписывает с учётом вашего комментария (например: «слишком формально» или «добавь юмора»). 1 перегенерация бесплатно, дальше — 0.3 поста с баланса."),
    ("Безопасны ли мои данные?",
     "Все данные хранятся на серверах в России. Токены соцсетей шифруются. Мы не продаём данные третьим лицам и не используем ваш контент для обучения моделей. Соответствуем 152-ФЗ."),
    ("Можно ли отменить подписку в любой момент?",
     "Да, без штрафов и скрытых условий. Отмена в личном кабинете в 2 клика. Деньги за неиспользованные дни не возвращаются, но доступ остаётся до конца оплаченного периода."),
    ("Я не разбираюсь в технике. Сложно настроить?",
     "Нет. Регистрация → ИИ анализирует ваш сайт за 30 секунд → подключаете Telegram/VK/MAX (есть видео-инструкции) → готово. Весь процесс — 5-10 минут. Если что — напишите в поддержку, поможем."),
    ("А пишет ли ИИ на украинском, английском, других языках?",
     "Да. Наш ИИ свободно владеет русским, английским и многими другими языками. ИИ адаптируется под язык вашей ниши и аудитории."),
    ("Что если я хочу подключить нестандартную соцсеть?",
     "Сейчас поддерживаются Telegram, ВКонтакте и MAX. Instagram*, TikTok, X (Twitter) — в разработке. Напишите в поддержку, какая соцсеть нужна — учтём в приоритете."),
    ("А если у меня уже есть SMM-щик?",
     "Sociora отлично работает в паре. SMM-щик использует ИИ для черновиков, экономя 70% времени, а вы платите ему меньше. Многие наши клиенты так и делают — это выгодно всем."),
]

# ------------------------------------------------------------
# Сборка лендинга
# ------------------------------------------------------------

def analytics_block():
    tabs = []
    panels = []
    keys = list(ANALYTICS.keys())
    for idx, key in enumerate(keys):
        d = ANALYTICS[key]
        active = " active" if idx == 0 else ""
        tabs.append('<button class="tab%s" data-tab="%s">%s</button>' % (active, key, d["label"]))
        bars = "".join('<span class="bar" style="height:%d%%"></span>' % h for h in d["bars"])
        days = "".join("<span>%s</span>" % x for x in d["days"])
        kpis = "".join('<div class="kpi"><b>%s</b><span>%s</span></div>' % kv for kv in d["kpis"])
        voice = "".join(
            '<div class="voice-row"><span class="label">%s</span>'
            '<span class="track"><span class="fill" data-w="%d"></span></span>'
            '<span class="val">%d пр.</span></div>' % (name, w, w)
            for name, w in d["voice"]
        )
        panels.append("""
<div data-panel="{key}"{hidden}>
  <div class="kpis">{kpis}</div>
  <div class="chart-box">
    <h4>Просмотры по дням</h4>
    <div class="chart">{bars}</div>
    <div class="chart-x">{days}</div>
  </div>
  <div class="ai-note"><b>✨ AI-анализ</b><br>{ai}</div>
  <div class="voice">
    <h4>🎙️ Голос канала <span style="color:var(--accent)">обучен на 100 постах</span></h4>
    <div class="sub">✦ Тон и манера · ✦ Темы и заходы · ✦ Профиль обновляется автоматически на свежей статистике</div>
    {voice}
  </div>
</div>""".format(key=key, hidden="" if idx == 0 else " hidden", kpis=kpis, bars=bars, days=days, ai=d["ai"], voice=voice))
    return """
<div class="analytics reveal" data-tabs>
  <div class="tabs">{tabs}</div>
  {panels}
</div>""".format(tabs="".join(tabs), panels="".join(panels))


def build_landing():
    problems = "".join(
        '<div class="card reveal d%d"><span class="emoji">%s</span><h3>%s</h3><p>%s</p></div>'
        % (i % 4, e, t, d) for i, (e, t, d) in enumerate(PROBLEMS)
    )
    steps = "".join(
        '<div class="step reveal d%d"><span class="step-emoji">%s</span><span class="step-num">%s</span>'
        '<h3>%s</h3><p>%s</p><span class="time">%s</span></div>'
        % (i, e, n, t, d, tm) for i, (e, n, t, d, tm) in enumerate(STEPS)
    )
    features = "".join(
        '<div class="card reveal d%d"><span class="emoji">%s</span><h3>%s</h3><p>%s</p></div>'
        % (i % 3, e, t, d) for i, (e, t, d) in enumerate(FEATURES)
    )
    learning = "".join('<li>%s</li>' % x for x in SELF_LEARNING)

    plans = []
    for p in PLANS:
        items = "".join(
            '<li class="%s">%s</li>' % ("" if ok else "off", label) for label, ok in p["items"]
        )
        plans.append("""
<div class="price-card{pop}">
  {tag}
  <h3>{name}</h3>
  <div class="for">{for_}</div>
  <div class="price-line"><span class="amount" data-price data-monthly="{m}" data-yearly="{y}">{m_fmt}</span><span class="cur">₽</span></div>
  <div class="price-sub" data-price-sub>в месяц · {per}</div>
  <ul>{items}</ul>
  <a class="btn {btn_cls} btn-block" href="{reg}?plan={plan_key}">{cta}</a>
</div>""".format(
            pop=" popular" if p["popular"] else "",
            tag='<span class="price-tag">Самый популярный</span>' if p["popular"] else "",
            name=p["name"], for_=p["for"], m=p["monthly"], y=p["yearly"],
            m_fmt="{:,}".format(p["monthly"]).replace(",", " "),
            per=p["per"], items=items, reg=REGISTER_URL, plan_key=p["name"].lower(),
            btn_cls="btn-primary" if p["popular"] else "btn-ghost", cta=p["cta"],
        ))
    pricing_cards = "".join(plans)

    packs = "".join(
        '<div class="pack reveal"><b>%s</b><span class="p-price">%s</span><span class="p-per">%s</span></div>'
        % p for p in PACKS
    )

    faq = "".join(
        '<details class="reveal"><summary>%s</summary><div class="answer">%s</div></details>' % (q, a)
        for q, a in FAQ
    )

    body = """
<!-- HERO -->
<section class="hero">
  <div class="container">
    <span class="badge"><span class="dot"></span>На передовых ИИ-технологиях</span>
    <h1>Контент в соцсетях<br><span class="grad">за 3 минуты в день</span></h1>
    <p class="hero-sub">ИИ-агент сам пишет посты, генерит картинки и публикует в Telegram, ВКонтакте и MAX по расписанию. Без копирайтеров. Без дизайнеров. Без головной боли.</p>
    <div class="hero-cta">
      <a class="btn btn-primary" href="{reg}">Попробовать 7 дней бесплатно</a>
      <a class="btn btn-ghost" href="#demo">Сгенерировать пост</a>
    </div>
    <p class="hero-note">✓ Без привязки карты &nbsp;·&nbsp; ✓ Отмена в любой момент &nbsp;·&nbsp; ✓ 15 постов в подарок</p>
    <div class="hero-stats">
      <div class="stat reveal"><b>1 200+</b><span>предпринимателей уже автоматизируют свой SMM</span></div>
      <div class="stat reveal d1"><b>54 000+</b><span>постов сгенерировано</span></div>
      <div class="stat reveal d2"><b>4.9/5</b><span>рейтинг клиентов</span></div>
    </div>
  </div>
</section>

<!-- ПРОБЛЕМЫ -->
<section class="section" id="problems">
  <div class="container">
    <div class="section-head reveal">
      <span class="kicker">Знакомо?</span>
      <h2>Если у вас бизнес — эти проблемы знаете лично</h2>
      <p>Вы не один. Так живут 90% малых бизнесов. И теряют клиентов, которых забирают конкуренты.</p>
    </div>
    <div class="grid grid-3">{problems}</div>
    <div class="strip reveal" style="margin-top:28px">
      <span style="font-size:34px">💡</span>
      <div>
        <div class="big">Есть решение, которое работает 24/7 без вас</div>
        <p>Sociora придумывает темы, пишет посты, рисует картинки и публикует по расписанию — вы только одобряете.</p>
      </div>
    </div>
  </div>
</section>

<!-- КАК РАБОТАЕТ -->
<section class="section" id="how">
  <div class="container">
    <div class="section-head reveal">
      <span class="kicker">Как это работает</span>
      <h2>Запуск за 5 минут</h2>
      <p>Без сложных настроек, без интеграций, без обучения сотрудников.</p>
    </div>
    <div class="steps">{steps}</div>
    <div class="strip reveal" style="margin-top:28px">
      <span style="font-size:34px">⏱️</span>
      <div>
        <div class="big">Освободите 15-20 часов в неделю</div>
        <p>Столько времени уходит на ведение соцсетей вручную. Тратьте его на бизнес и семью.</p>
      </div>
    </div>
  </div>
</section>

<!-- ВОЗМОЖНОСТИ -->
<section class="section" id="features">
  <div class="container">
    <div class="section-head reveal">
      <span class="kicker">Возможности</span>
      <h2>Больше, чем просто автопостинг</h2>
      <p>Обычный планировщик просто публикует по расписанию. Sociora создаёт контент, анализирует результаты и подсказывает, как расти.</p>
    </div>
    <div class="grid grid-3">{features}</div>
  </div>
</section>

<!-- ГЛАВНОЕ ПРЕИМУЩЕСТВО -->
<section class="section" id="analytics">
  <div class="container">
    <div class="section-head reveal">
      <span class="kicker">Главное преимущество</span>
      <h2>Решения на данных, а не на ощущениях</h2>
      <p>Вся аналитика по сетям — в одном окне. Sociora сама разбирает статистику и подсказывает, что публиковать дальше.</p>
    </div>
    {analytics}
  </div>
</section>

<!-- САМООБУЧЕНИЕ -->
<section class="section" id="learning">
  <div class="container">
    <div class="grid grid-2" style="align-items:center;gap:44px">
      <div class="reveal">
        <span class="kicker">Самообучение</span>
        <h2 style="font-size:clamp(26px,4vw,38px);letter-spacing:-0.02em;margin-bottom:16px">Пишет в вашем стиле, а не шаблонно</h2>
        <p style="color:var(--muted);font-size:16.5px">Sociora изучает посты вашего канала — и те, что уже выходили, и новые — смотрит, что заходит аудитории, и пишет дальше в том же духе: вашим тоном, на ваши темы, теми приёмами, что дают отклик.</p>
        <ul style="display:grid;gap:12px;margin:22px 0 28px">{learning}</ul>
        <a class="btn btn-primary" href="{reg}">Попробовать бесплатно</a>
      </div>
      <div class="analytics reveal">
        <div class="voice" style="margin:0;border:0;padding:0">
          <h4>🎙️ Голос канала <span style="color:var(--accent)">обновляется автоматически</span></h4>
          <div class="sub">Профиль строится на свежей статистике ваших постов</div>
          <div class="voice-row"><span class="label">Тон и манера</span><span class="track"><span class="fill" data-w="92"></span></span><span class="val">92%</span></div>
          <div class="voice-row"><span class="label">Темы и заходы</span><span class="track"><span class="fill" data-w="78"></span></span><span class="val">78%</span></div>
          <div class="voice-row"><span class="label">Форматы</span><span class="track"><span class="fill" data-w="85"></span></span><span class="val">85%</span></div>
          <div class="voice-row"><span class="label">Лучшее время</span><span class="track"><span class="fill" data-w="96"></span></span><span class="val">96%</span></div>
          <div class="ai-note" style="margin-top:18px"><b>🧠 Самообучение</b><br>Чем дольше ведёте канал, тем точнее ИИ попадает в вашу аудиторию — без ручной настройки.</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ДЕМО -->
<section class="section" id="demo">
  <div class="container">
    <div class="section-head reveal">
      <span class="kicker">Попробуйте прямо сейчас</span>
      <h2>Сгенерируйте пост за 5 секунд</h2>
      <p>Введите вашу нишу — и посмотрите, что напишет ИИ</p>
    </div>
    <div class="demo reveal">
      <div class="demo-form">
        <input type="text" data-demo-input placeholder="Ваша ниша или сфера бизнеса" aria-label="Ваша ниша">
        <button class="btn btn-primary" data-demo-btn>Сгенерировать</button>
      </div>
      <div class="demo-examples">
        <span>Или выберите пример:</span>
        <button class="chip" data-niche="салон красоты">салон красоты</button>
        <button class="chip" data-niche="кофейня">кофейня</button>
        <button class="chip" data-niche="фитнес">фитнес</button>
      </div>
      <p class="demo-hint" data-demo-hint>👆 Введите нишу выше или нажмите на пример, чтобы увидеть демо-пост</p>
      <div class="demo-output" data-demo-output>
        <div class="tg-post">
          <div class="tg-head">
            <span class="tg-avatar">S</span>
            <div class="tg-meta"><b data-demo-channel>Ваш канал · демо</b><span>сегодня, 19:00 · превью как в Telegram</span></div>
          </div>
          <div class="tg-body"><b class="tg-title" data-demo-title></b><span data-demo-body></span></div>
          <div class="tg-image">🖼️ Картинка от ИИ генерируется под тему поста</div>
          <div class="tg-actions"><span>👁 1 247</span><span>❤️ 38</span><span>🔁 12</span><span>💬 7</span></div>
        </div>
        <div class="demo-actions">
          <a class="btn btn-primary" href="{reg}">Получить 15 постов бесплатно</a>
          <button class="btn btn-ghost" data-demo-regen>🔄 Перегенерировать</button>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ДО / ПОСЛЕ -->
<section class="section" id="compare">
  <div class="container">
    <div class="section-head reveal">
      <span class="kicker">До / После</span>
      <h2>Что изменится в вашем бизнесе</h2>
    </div>
    <div class="compare">
      <div class="compare-col bad reveal">
        <h3>😣 Без Sociora — как сейчас:</h3>
        <ul>
          <li>😩 Тратите 15+ часов в неделю на посты</li>
          <li>💸 30 000 ₽/мес копирайтеру</li>
          <li>🤯 Каждый день думаете «о чём писать»</li>
          <li>📉 Постов не хватает, охваты падают</li>
          <li>🎨 Платите дизайнеру за картинки</li>
          <li>⏳ Не успеваете адаптировать под TG/VK/MAX</li>
        </ul>
        <div class="compare-cost">Месячные затраты:<b>~30 000 ₽/мес</b>+ 60+ часов вашего времени</div>
      </div>
      <div class="compare-col good reveal d1">
        <h3>🚀 С Sociora — как станет:</h3>
        <ul>
          <li>☕ Тратите 3 минуты в день — только одобрить</li>
          <li>💰 От 1 290 ₽/мес — экономия 28 710 ₽</li>
          <li>🚀 ИИ сам предлагает темы под вашу нишу</li>
          <li>📈 Стабильно 5-7 постов в неделю</li>
          <li>✨ Картинки от ИИ — премиум-качество</li>
          <li>⚡ Один пост → автоматом во все соцсети</li>
        </ul>
        <div class="compare-cost">Месячные затраты:<b>от 1 290 ₽/мес</b>✓ Экономия 28 710 ₽ + 60 часов времени</div>
      </div>
    </div>
    <div style="text-align:center;margin-top:36px" class="reveal">
      <a class="btn btn-primary" href="{reg}">Хочу так же</a>
      <p class="hero-note" style="margin:14px 0 0">7 дней бесплатно. Без карты.</p>
    </div>
  </div>
</section>

<!-- ТАРИФЫ -->
<section class="section" id="pricing">
  <div class="container">
    <div class="section-head reveal">
      <span class="kicker">Тарифы</span>
      <h2>Дешевле, чем час копирайтера</h2>
      <p>7 дней бесплатно. Без привязки карты. Отмена в любой момент.</p>
    </div>
    <div class="billing-toggle reveal" data-billing>
      <button class="active" data-period="month">Помесячно</button>
      <button data-period="year">За год</button>
      <span class="save">−17%</span>
    </div>
    <div class="pricing">{pricing}</div>
    <div class="trial reveal">
      <div>
        <h3>🎁 Trial — 7 дней бесплатно</h3>
        <p>15 постов в подарок · 1 соцсеть · без карты</p>
      </div>
      <a class="btn btn-primary" href="{reg}">Начать бесплатно</a>
    </div>
    <div class="packs">
      <h3 class="reveal">Не хватает постов? Купите пакет</h3>
      <p class="reveal">Без подписки. Не сгорают. Используются после исчерпания месячного лимита.</p>
      <div class="packs-grid">{packs}</div>
    </div>
  </div>
</section>

<!-- FAQ -->
<section class="section" id="faq">
  <div class="container">
    <div class="section-head reveal">
      <span class="kicker">FAQ</span>
      <h2>Частые вопросы</h2>
    </div>
    <div class="faq">{faq}</div>
  </div>
</section>

<!-- ФИНАЛЬНЫЙ CTA -->
<section class="final-cta">
  <div class="container">
    <div class="reveal">
      <h2>Соцсети будут вести себя сами</h2>
      <p>Пока вы спите, обедаете и работаете — контент идёт в TG, VK и MAX по расписанию.</p>
      <a class="btn btn-primary" href="{reg}">Начать бесплатно</a>
      <div class="perks">
        <div class="perk"><span class="ico">🎁</span><div><b>7 дней бесплатно</b><br>15 постов в подарок</div></div>
        <div class="perk"><span class="ico">💳</span><div><b>Без карты</b><br>Не просим её при регистрации</div></div>
        <div class="perk"><span class="ico">⚡</span><div><b>Запуск за 5 минут</b><br>Без сложных настроек</div></div>
      </div>
      <p style="margin-top:34px;color:var(--faint);font-size:13px">* Instagram принадлежит Meta, признанной экстремистской и запрещённой в РФ.</p>
      <p style="margin-top:22px"><a href="{tg}" target="_blank" rel="noopener" style="color:var(--muted);font-size:14.5px">💬 Остались вопросы? Напишите нам — отвечаем в течение часа</a></p>
    </div>
  </div>
</section>
""".format(
        reg=REGISTER_URL, tg=SUPPORT_TG,
        problems=problems, steps=steps, features=features,
        analytics=analytics_block(), learning=learning,
        pricing=pricing_cards, packs=packs, faq=faq,
    )
    return body

# ------------------------------------------------------------
# Сборка внутренних страниц
# ------------------------------------------------------------

CTA_BLOCK = """
<div class="cta-inline">
  <h3>Попробуйте Sociora бесплатно</h3>
  <p>7 дней trial, 15 постов в подарок, без привязки карты. Запуск за 5 минут.</p>
  <a class="btn btn-primary" href="{reg}">Зарегистрироваться</a>
</div>
""".format(reg=REGISTER_URL)


def build_inner(md_text):
    h1, lead, rest = split_md(md_text)
    body_html = md_to_html(rest)
    return h1, lead, body_html

# ------------------------------------------------------------
# Генерация файлов
# ------------------------------------------------------------

def write(name, content):
    path = OUT / name
    path.write_text(content, encoding="utf-8")
    print("  ✓ %s (%d КБ)" % (name, path.stat().st_size // 1024))


def main():
    print("Sociora — сборка статической копии")
    print("Источник контента: %s" % (ROOT / "content"))

    # Главная
    landing = page(
        "Sociora — SMM-агент на ИИ. Контент в соцсетях за 3 минуты в день",
        "ИИ-агент сам пишет посты, генерит картинки и публикует в Telegram, ВКонтакте и MAX по расписанию. 7 дней бесплатно, без карты.",
        MAIN_NAV, "index.html", build_landing(),
        extra_head='<link rel="preload" href="assets/css/styles.css" as="style">',
    )
    write("index.html", landing)

    # Внутренние страницы
    sitemap_urls = [("/", "weekly", "1.0")]
    for slug, md_file, title, desc, freq, prio in PAGES:
        md_text = (ROOT / "content" / md_file).read_text(encoding="utf-8")
        h1, lead, body_html = build_inner(md_text)
        crumbs = ('<div class="crumbs"><a href="index.html">На главную</a> · %s</div>' % esc(h1))
        inner = """
<section class="page-head">
  <div class="container">
    {crumbs}
    <h1>{h1}</h1>
    <p class="lead">{lead}</p>
  </div>
</section>
<div class="container">
  <article class="prose">
    {body}
    {cta}
  </article>
</div>
""".format(crumbs=crumbs, h1=esc(h1), lead=md_inline(lead), body=body_html, cta=CTA_BLOCK)
        html_page = page(title, desc, INNER_NAV, "index.html", inner)
        write(slug + ".html", html_page)
        if slug not in LEGAL:
            sitemap_urls.append(("/%s" % slug, freq, prio))

    # 404
    not_found = page(
        "Страница не найдена — Sociora",
        "Запрошенная страница не найдена.",
        INNER_NAV, "index.html",
        """
<section class="page-head"><div class="container">
  <div class="crumbs"><a href="index.html">На главную</a></div>
  <h1>404 — страница не найдена</h1>
  <p class="lead">Похоже, этой страницы нет в копии сайта. Вернитесь на главную или выберите раздел в меню.</p>
</div></section>
<div class="container"><div class="prose">
  <p>Проверьте адрес или начните с <a href="index.html">главной страницы</a> — там описаны все возможности сервиса.</p>
  <p><a class="btn btn-primary" href="index.html">На главную</a></p>
</div></div>
""",
    )
    write("404.html", not_found)

    # SEO-файлы
    write("robots.txt", ROBOTS_TXT)
    write("llms.txt", LLMS_TXT)
    today = "2026-10-05"
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, freq, prio in sitemap_urls:
        sm.append("  <url><loc>%s%s</loc><lastmod>%s</lastmod><changefreq>%s</changefreq><priority>%s</priority></url>"
                  % (SITE, loc, today, freq, prio))
    sm.append("</urlset>")
    write("sitemap.xml", "\n".join(sm) + "\n")

    print("\nГотово. Файлы копии находятся в: %s" % ROOT)
    print("Локальный запуск:  python3 -m http.server 8080")


if __name__ == "__main__":
    main()
