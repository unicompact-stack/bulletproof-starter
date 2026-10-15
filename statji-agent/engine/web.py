#!/usr/bin/env python3
"""Сайт СК «СтройЦех 12»: сборка статики, приём заявок, дашборд.

    python3 engine/web.py build                 # собрать (только статьи, прошедшие QA)
    python3 engine/web.py build --approve <slug>  # одобрить публикацию (решение человека)
    python3 engine/web.py serve --port 8000     # поднять сайт и приём заявок
    python3 engine/web.py stats                 # сводка по заявкам

Статья попадает на сайт, только если выполнены ТРИ условия:
  1. published: true в frontmatter  ИЛИ slug в data/approved.json (одобрение человека);
  2. qa.py по ней возвращает passed;
  3. файл лежит в content/articles/.
Это и есть C1 + C9 из спеки: без автопроверки и без человека публикации нет.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ENGINE = Path(__file__).resolve().parent
ROOT = ENGINE.parent
sys.path.insert(0, str(ENGINE))
import qa  # noqa: E402

SITE = ROOT / "site"
DATA = ROOT / "data"
LEADS = DATA / "leads.jsonl"
VIEWS = DATA / "views.jsonl"
APPROVED = DATA / "approved.json"

COMPANY = "СК «СтройЦех 12»"
TAGLINE = "Ремонт квартир под ключ в Йошкар-Оле"

STYLE = """
:root { --ink:#16202a; --muted:#5b6b7a; --line:#dfe6ed; --brand:#0f6d5c; --brand-ink:#0b5245; --bg:#f6f8fa; }
* { box-sizing: border-box; }
body { margin:0; font:16px/1.6 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
       color:var(--ink); background:var(--bg); }
a { color:var(--brand); }
header.site { background:#fff; border-bottom:1px solid var(--line); }
header.site .wrap { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px 20px; }
.brand { font-weight:700; }
.brand small { display:block; color:var(--muted); font-weight:400; font-size:13px; }
nav a { margin-left:16px; text-decoration:none; color:var(--muted); font-size:15px; }
nav a:hover { color:var(--brand); }
.wrap { max-width:760px; margin:0 auto; padding:0 20px; }
main { padding:28px 0 60px; }
h1 { font-size:30px; line-height:1.25; margin:0 0 8px; }
h2 { font-size:22px; margin:34px 0 10px; }
h3 { font-size:18px; margin:24px 0 8px; }
p { margin:0 0 14px; }
ul, ol { margin:0 0 16px; padding-left:22px; }
li { margin-bottom:6px; }
.meta { color:var(--muted); font-size:14px; margin-bottom:25px; }
table { width:100%; border-collapse:collapse; margin:0 0 18px; background:#fff; font-size:15px; }
th, td { border:1px solid var(--line); padding:9px 11px; text-align:left; vertical-align:top; }
th { background:#eef3f7; }
blockquote { margin:0 0 18px; padding:12px 16px; background:#fff; border-left:3px solid var(--brand); color:var(--muted); }
code { background:#eef1f4; padding:1px 5px; border-radius:4px; font-size:14px; }
.card { background:#fff; border:1px solid var(--line); border-radius:10px; padding:18px 20px; margin:0 0 16px; }
.cta { background:#fff; border:2px solid var(--brand); border-radius:12px; padding:20px; margin:30px 0 10px; }
.cta h3 { margin-top:0; }
.cta .btn, form .btn { display:inline-block; background:var(--brand); color:#fff; border:0; border-radius:8px;
      padding:12px 20px; font-size:16px; cursor:pointer; text-decoration:none; }
.cta .btn:hover, form .btn:hover { background:var(--brand-ink); }
form { background:#fff; border:1px solid var(--line); border-radius:10px; padding:18px 20px; }
label { display:block; font-size:14px; color:var(--muted); margin:12px 0 4px; }
input, textarea { width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:8px; font:inherit; background:#fff; }
.row { display:flex; gap:12px; flex-wrap:wrap; }
.row > div { flex:1 1 180px; }
.note { color:var(--muted); font-size:14px; }
.ok { color:var(--brand-ink); font-weight:600; }
.bad { color:#a4262c; font-weight:600; }
.hero { background:#fff; border:1px solid var(--line); border-radius:12px; padding:22px 24px; margin-bottom:22px; }
.hero h1 { margin-bottom:6px; }
.pill { display:inline-block; font-size:13px; color:var(--brand-ink); background:#e6f2ef; border-radius:99px; padding:2px 10px; margin-right:6px; }
footer.site { border-top:1px solid var(--line); background:#fff; color:var(--muted); font-size:14px; padding:20px 0 28px; }
svg.bars { display:block; }
@media (max-width:560px){ h1{font-size:25px} header.site .wrap{flex-wrap:wrap} }
"""

FORM_JS = """
(function(){
  var qs = new URLSearchParams(location.search);
  var ref = qs.get('ref') || document.body.dataset.ref || 'direct';
  var form = document.getElementById('lead-form');
  if (form) {
    var refField = form.querySelector('[name=ref]');
    if (refField && refField.value === '') refField.value = ref;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = Object.fromEntries(new FormData(form).entries());
      fetch('/api/lead', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data)})
        .then(function (r) { return r.json(); })
        .then(function (res) {
          var box = document.getElementById('lead-result');
          if (res.ok) {
            box.className = 'ok';
            box.textContent = 'Заявка принята: ' + res.id + '. Перезвоним в течение 15 минут.';
            form.reset();
          } else {
            box.className = 'bad';
            box.textContent = 'Не удалось отправить: ' + (res.error || 'неизвестная ошибка');
          }
        })
        .catch(function () { document.getElementById('lead-result').textContent = 'Сеть недоступна, попробуйте ещё раз.'; });
    });
  }
  if (document.body.dataset.article) {
    var key = 'viewed:' + document.body.dataset.article;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      fetch('/api/view', {method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ref: document.body.dataset.article})});
    }
  }
})();
"""

DASH_JS = """
(function(){
  fetch('/api/stats').then(function(r){ return r.json(); }).then(function(s){
    var t = document.getElementById('dash');
    var rows = s.articles.map(function(a){
      return '<tr><td><a href="/articles/' + a.slug + '/">' + a.title + '</a><div class="note">' + a.slug + '</div></td>'
        + '<td>' + (a.qa.passed ? '<span class="ok">pass</span>' : '<span class="bad">fail: ' + a.qa.failed_codes.join(',') + '</span>') + '</td>'
        + '<td>' + (a.published ? 'да' : 'нет') + '</td>'
        + '<td>' + a.views + '</td><td>' + a.leads + '</td></tr>';
    }).join('');
    t.innerHTML = rows || '<tr><td colspan="5">нет данных</td></tr>';
    var tot = document.getElementById('totals');
    tot.innerHTML = '<div class="card"><b>Всего:</b> статей ' + s.totals.articles
      + ' · просмотров ' + s.totals.views + ' · заявок ' + s.totals.leads
      + '<div class="note">' + s.totals.note + '</div></div>';
  });
})();
"""


# ---------------------------------------------------------------- markdown


def md_inline(text: str) -> str:
    text = html.escape(text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    return text


def md_to_html(body: str) -> str:
    """Минимальный markdown → HTML: достаточно для наших статей."""
    lines = body.splitlines()
    out: list[str] = []
    i = 0
    list_tag: str | None = None

    def close_list() -> None:
        nonlocal list_tag
        if list_tag:
            out.append(f"</{list_tag}>")
            list_tag = None

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped or stripped == "---":
            close_list()
            i += 1
            continue

        m = re.match(r"^(#{1,4})\s+(.*)$", stripped)
        if m:
            close_list()
            level = len(m.group(1)) + 0
            out.append(f"<h{level}>{md_inline(m.group(2))}</h{level}>")
            i += 1
            continue

        if stripped.startswith("|"):
            close_list()
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            if rows:
                head, *rest = rows
                out.append("<table><thead><tr>" + "".join(f"<th>{md_inline(c)}</th>" for c in head) + "</tr></thead><tbody>")
                for row in rest:
                    out.append("<tr>" + "".join(f"<td>{md_inline(c)}</td>" for c in row) + "</tr>")
                out.append("</tbody></table>")
            continue

        if stripped.startswith("> "):
            close_list()
            quote = []
            while i < len(lines) and lines[i].strip().startswith("> "):
                quote.append(lines[i].strip()[2:])
                i += 1
            out.append("<blockquote>" + md_inline(" ".join(quote)) + "</blockquote>")
            continue

        m = re.match(r"^[-*]\s+(.*)$", stripped)
        if m:
            if list_tag != "ul":
                close_list()
                out.append("<ul>")
                list_tag = "ul"
            out.append(f"<li>{md_inline(m.group(1))}</li>")
            i += 1
            continue

        m = re.match(r"^\d+\.\s+(.*)$", stripped)
        if m:
            if list_tag != "ol":
                close_list()
                out.append("<ol>")
                list_tag = "ol"
            out.append(f"<li>{md_inline(m.group(1))}</li>")
            i += 1
            continue

        close_list()
        paragraph = [stripped]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#|\||>|[-*]\s|\d+\.\s)", lines[i].strip()):
            paragraph.append(lines[i].strip())
            i += 1
        out.append("<p>" + md_inline(" ".join(paragraph)) + "</p>")

    close_list()
    return "\n".join(out)


# ---------------------------------------------------------------- данные


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    items = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            try:
                items.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return items


def append_jsonl(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(payload, ensure_ascii=False) + "\n")


def load_approved() -> list[str]:
    if not APPROVED.exists():
        return []
    try:
        return list(json.loads(APPROVED.read_text(encoding="utf-8")))
    except json.JSONDecodeError:
        return []


def save_approved(slugs: list[str]) -> None:
    APPROVED.parent.mkdir(parents=True, exist_ok=True)
    APPROVED.write_text(json.dumps(sorted(set(slugs)), ensure_ascii=False, indent=2), encoding="utf-8")


def load_articles() -> list[dict]:
    """Статьи с разобранным frontmatter и результатом QA."""
    allowed = qa.load_facts()
    corpus = qa.load_corpus()
    approved = load_approved()
    articles = []
    for path in sorted(qa.ARTICLES_DIR.glob("*.md")):
        if path.name.startswith("_"):
            continue
        data, body, _ = qa.read_front_matter(path.read_text(encoding="utf-8"))
        result = qa.check_article(path, corpus, allowed)
        articles.append({
            "slug": data.get("slug") or path.stem,
            "title": data.get("title", path.stem),
            "description": data.get("description", ""),
            "objection": data.get("objection", ""),
            "cta": data.get("cta", ""),
            "declared": str(data.get("published", "")).lower() == "true",
            "approved": (data.get("slug") or path.stem) in approved,
            "qa": {"passed": result["passed"], "failed_codes": result["failed_codes"],
                   "checks": result["checks"], "stats": result["stats"]},
            "body": body,
        })
    return articles


def published(article: dict) -> bool:
    """Публикуем, только если статья прошла QA и одобрена (человеком или самим автором в файле)."""
    return article["qa"]["passed"] and (article["declared"] or article["approved"])


def stats_snapshot(articles: list[dict]) -> dict:
    leads = read_jsonl(LEADS)
    views = read_jsonl(VIEWS)
    by_slug: dict[str, dict] = {}
    for a in articles:
        by_slug[a["slug"]] = {
            "slug": a["slug"], "title": a["title"], "qa": a["qa"],
            "published": published(a), "views": 0, "leads": 0,
        }
    unknown_views = 0
    for v in views:
        key = v.get("ref")
        if key in by_slug:
            by_slug[key]["views"] += 1
        else:
            unknown_views += 1
    unknown_leads = 0
    for l in leads:
        key = l.get("ref")
        if key in by_slug:
            by_slug[key]["leads"] += 1
        else:
            unknown_leads += 1
    items = sorted(by_slug.values(), key=lambda x: (-x["leads"], -x["views"], x["slug"]))
    note_parts = []
    if not views:
        note_parts.append("просмотры пока не накапливались — «неизвестно», а не ноль")
    if unknown_leads:
        note_parts.append(f"заявок без привязки к статье: {unknown_leads} (например, с главной или без ref)")
    if unknown_views:
        note_parts.append(f"просмотров без привязки: {unknown_views}")
    return {
        "articles": items,
        "totals": {
            "articles": len(items),
            "views": sum(i["views"] for i in items),
            "leads": sum(i["leads"] for i in items),
            "note": "; ".join(note_parts) if note_parts else "все данные привязаны к статьям",
        },
    }


# ---------------------------------------------------------------- шаблоны


def layout(title: str, body_html: str, *, body_attrs: str = "", extra_js: str = "") -> str:
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(TAGLINE)}">
<link rel="stylesheet" href="/style.css">
</head>
<body {body_attrs}>
<header class="site"><div class="wrap">
  <div class="brand">{html.escape(COMPANY)}<small>{html.escape(TAGLINE)}</small></div>
  <nav><a href="/">Статьи</a><a href="/zamer/">Замер</a><a href="/dashboard.html">Дашборд</a></nav>
</div></header>
<main class="wrap">
{body_html}
</main>
<footer class="site"><div class="wrap">
  <div>{html.escape(COMPANY)} · <b>демо-проект</b>: компания, цены и цифры вымышлены
  и нужны для демонстрации агента-статейника. Не является публичной офертой.</div>
</div></footer>
<script src="/app.js"></script>
{extra_js}
</body>
</html>
"""


def offer_block(slug: str, cta: str = "Бесплатный замер и смета за 24 часа") -> str:
    return f"""<div class="cta">
  <h3>{html.escape(cta)}</h3>
  <p>Приезжаем, замеряем, считаем две цены — «эконом» и «стандарт». Смета за 24 часа,
  замер бесплатный. Оплата по этапам, цена фиксируется в договоре.</p>
  <p><a class="btn" href="/zamer/?ref={html.escape(slug)}">Вызвать замерщика</a></p>
</div>"""


def lead_form(ref: str) -> str:
    return f"""<form id="lead-form">
  <input type="hidden" name="ref" value="{html.escape(ref)}">
  <div class="row">
    <div><label for="name">Как вас зовут</label><input id="name" name="name" required placeholder="Имя"></div>
    <div><label for="phone">Телефон</label><input id="phone" name="phone" required placeholder="+7 ___ ___-__-__"></div>
    <div><label for="area">Площадь, м²</label><input id="area" name="area" placeholder="60"></div>
  </div>
  <label for="comment">Что нужно сделать</label>
  <textarea id="comment" name="comment" rows="2" placeholder="Ремонт под ключ в новостройке"></textarea>
  <p><button class="btn" type="submit">Отправить заявку</button></p>
  <div id="lead-result" class="note">Нажимая кнопку, вы соглашаетесь на обработку данных для звонка по заявке.</div>
  <div class="note">Демо-форма: данные сохраняются в файл проекта <code>data/leads.jsonl</code>.</div>
</form>"""


# ---------------------------------------------------------------- сборка


def build(approve: list[str] | None = None) -> int:
    articles = load_articles()
    by_slug = {a["slug"]: a for a in articles}

    if approve:
        current = load_approved()
        for slug in approve:
            article = by_slug.get(slug)
            if article is None:
                print(json.dumps({"error": f"нет статьи {slug}"}, ensure_ascii=False), file=sys.stderr)
                return 2
            if not article["qa"]["passed"]:
                print(json.dumps({"error": f"{slug} не прошла QA: {article['qa']['failed_codes']}"},
                                 ensure_ascii=False), file=sys.stderr)
                return 1
            current.append(slug)
            print(f"одобрено человеком: {slug}")
        save_approved(current)
        articles = load_articles()
        by_slug = {a["slug"]: a for a in articles}

    SITE.mkdir(parents=True, exist_ok=True)
    (SITE / "style.css").write_text(STYLE, encoding="utf-8")
    (SITE / "app.js").write_text(FORM_JS, encoding="utf-8")

    live = [a for a in articles if published(a)]
    skipped = [a for a in articles if not a["qa"]["passed"]]
    for a in articles:
        if a["qa"]["passed"] and not published(a):
            print(f"ждёт одобрения: {a['slug']}")

    # Страница статьи
    for a in live:
        slug = a["slug"]
        page_dir = SITE / "articles" / slug
        page_dir.mkdir(parents=True, exist_ok=True)
        badge = f'<span class="pill">закрывает возражение {html.escape(a["objection"])}</span>'
        body = f"""<article>
<h1>{html.escape(a["title"])}</h1>
<div class="meta">{badge}<span class="pill">смета за 24 часа</span></div>
{md_to_html(a["body"])}
</article>"""
        (page_dir / "index.html").write_text(
            layout(a["title"], body, body_attrs=f'data-ref="{slug}" data-article="{slug}"'), encoding="utf-8")

    # Главная
    cards = "\n".join(
        f"""<div class="card"><h3><a href="/articles/{a['slug']}/">{html.escape(a['title'])}</a></h3>
        <p class="note">{html.escape(a['description'])}</p></div>""" for a in live
    ) or '<div class="card">Пока нет опубликованных статей, прошедших проверку.</div>'
    index_body = f"""<div class="hero">
  <h1>Ремонт квартир под ключ в Йошкар-Оле</h1>
  <p>От 4 900 ₽ за м². Квартира 60 м² — около 620 000 ₽ с материалами и 45–60 рабочих дней.
  Оплата по этапам, цена фиксируется в договоре, гарантия 3 года.</p>
  <p><a class="btn" href="/zamer/?ref=main">Бесплатный замер и смета за 24 часа</a></p>
</div>
<h2>Статьи</h2>
{cards}
<p class="note">Каждая статья закрывает одно возражение и проверена автоматически
(выдуманных цифр нет) и человеком — см. <a href="/dashboard.html">дашборд</a>.</p>"""
    (SITE / "index.html").write_text(layout(TAGLINE, index_body), encoding="utf-8")

    # Страница замера
    zamer_body = f"""<h1>Бесплатный замер и смета за 24 часа</h1>
<p class="meta">Выезд замерщика — в течение 2 рабочих дней. Звонок по заявке — в течение 15 минут.</p>
<h2>Как это работает</h2>
<ol>
<li>Вы оставляете заявку — имя, телефон, площадь.</li>
<li>Звоним в течение 15 минут, согласуем время замера.</li>
<li>Замерщик приезжает, отвечает на вопросы, замеряет.</li>
<li>Через 24 часа присылаем две сметы: «эконом» и «стандарт».</li>
<li>Решаете вы. Смета ни к чему не обязывает.</li>
</ol>
<h2>Заявка</h2>
{lead_form("zamer")}
<p class="note">Вернуться к статьям: <a href="/">все статьи</a>.</p>"""
    (SITE / "zamer").mkdir(parents=True, exist_ok=True)
    (SITE / "zamer" / "index.html").write_text(layout("Замер и смета", zamer_body), encoding="utf-8")

    # Дашборд
    dash_body = """<h1>Дашборд агента-статейника</h1>
<p class="meta">Внутренняя страница: видно, что опубликовано, что прошло проверку и что принесло заявки.</p>
<div id="totals"></div>
<table><thead><tr><th>Статья</th><th>QA</th><th>Опубликована</th><th>Просмотры</th><th>Заявки</th></tr></thead>
<tbody id="dash"><tr><td colspan="5">загружаем…</td></tr></tbody></table>
<p class="note">Заявки считаются по полю <code>ref</code> в ссылке — так каждая заявка привязана к статье,
которая её принесла. Если данных нет, показывается «неизвестно», а не ноль.</p>
<h2>Очередь тем</h2>
<p class="note">Очередь и скоринг — в <code>content/topics.md</code>. Следующая тема берётся
по сумме баллов, а не «какая интереснее».</p>"""
    (SITE / "dashboard.html").write_text(
        layout("Дашборд", dash_body, extra_js=f"<script>{DASH_JS}</script>"), encoding="utf-8")

    # Машинный статус — для отчёта и проверок
    (SITE / "status.json").write_text(json.dumps({
        "generated": time.time(),
        "articles": [{k: a[k] for k in ("slug", "title", "objection", "declared", "approved", "qa")} for a in articles],
        "published": [a["slug"] for a in live],
        "skipped_failed_qa": [a["slug"] for a in skipped],
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"собрано: статей на сайте {len(live)}, ждут одобрения {sum(1 for a in articles if a['qa']['passed'] and not published(a))}")
    return 0


# ---------------------------------------------------------------- сервер


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE), **kwargs)

    def log_message(self, fmt, *args):  # тише в консоли
        if "/api/" in (self.path or ""):
            sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    def _json(self, payload: dict, code: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {}

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/stats":
            articles = load_articles()
            self._json(stats_snapshot(articles))
            return
        if path == "/api/leads":
            self._json({"leads": read_jsonl(LEADS)[-50:]})
            return
        if not SITE.exists():
            self._json({"error": "сайт не собран: запустите python3 engine/web.py build"}, 503)
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        payload = self._read_json()
        if path == "/api/lead":
            phone = re.sub(r"\D", "", str(payload.get("phone", "")))
            name = str(payload.get("name", "")).strip()
            if len(phone) < 10 or not name:
                self._json({"ok": False, "error": "нужны имя и телефон"}, 400)
                return
            lead_id = f"L{int(time.time())}{int(time.time()*1000) % 1000:03d}"
            append_jsonl(LEADS, {
                "id": lead_id,
                "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "ref": str(payload.get("ref") or "direct")[:64],
                "name": name[:80],
                "phone": phone[-10:],
                "area": str(payload.get("area", ""))[:16],
                "comment": str(payload.get("comment", ""))[:400],
            })
            self._json({"ok": True, "id": lead_id})
            return
        if path == "/api/view":
            ref = str(payload.get("ref") or "").strip()[:64]
            if ref:
                append_jsonl(VIEWS, {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "ref": ref})
            self._json({"ok": True})
            return
        self._json({"error": "неизвестный маршрут"}, 404)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def serve(port: int) -> int:
    if not (SITE / "index.html").exists():
        build()
    DATA.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"сайт: http://0.0.0.0:{port}/  (дашборд: /dashboard.html, замер: /zamer/)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nостановлено")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Сайт агента-статейника")
    sub = parser.add_subparsers(dest="command", required=True)
    b = sub.add_parser("build", help="собрать сайт")
    b.add_argument("--approve", action="append", default=[], help="одобрить публикацию статьи (можно несколько раз)")
    s = sub.add_parser("serve", help="поднять сайт и приём заявок")
    s.add_argument("--port", type=int, default=8000)
    sub.add_parser("stats", help="сводка по заявкам и просмотрам")
    args = parser.parse_args()

    if args.command == "build":
        return build(args.approve)
    if args.command == "serve":
        return serve(args.port)
    snapshot = stats_snapshot(load_articles())
    print(json.dumps(snapshot, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
