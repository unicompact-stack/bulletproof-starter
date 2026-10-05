#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Проверка работоспособности статической копии sociora.ru.

Проверяет:
  1. Доступность всех страниц (HTTP 200)
  2. Доступность ассетов (CSS, JS)
  3. Все внутренние ссылки и якоря ведут на существующие файлы/элементы
  4. Наличие <title>, <h1>, meta description на каждой странице
  5. Целостность SEO-файлов (robots.txt, sitemap.xml, llms.txt)

Запуск (при запущенном сервере):
    python3 verify.py [base_url]
    python3 verify.py http://127.0.0.1:8080
"""

import json
import re
import secrets
import sys
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import build_opener, HTTPCookieProcessor, urlopen

ROOT = Path(__file__).resolve().parent

PAGES = [
    "index.html", "404.html", "register.html", "login.html", "app/index.html",
    "servis-avtopostinga.html", "avtopostng-telegram.html", "avtopostng-vkontakte.html",
    "krosspostng-v-max.html", "krosspostng.html", "neiroset-dlya-postov.html",
    "kontent-plan.html", "oformlenie-postov.html", "zamena-smm.html",
    "analogi-smmplanner.html", "about.html", "contacts.html",
    "offer.html", "privacy.html", "terms.html", "cookies.html", "consent.html",
]
ASSETS = ["assets/css/styles.css", "assets/js/main.js", "app/app.css", "app/app.js"]
SEO_FILES = ["robots.txt", "sitemap.xml", "llms.txt"]

PASS, FAIL = [], []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append((name, detail))
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" -- " + detail) if detail and not ok else ""))


def fetch(base, path):
    url = urljoin(base, path)
    with urlopen(url, timeout=15) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")


def test_api(base):
    """Сквозной тест личного кабинета: регистрация → проект → посты → тариф."""
    jar = CookieJar()
    opener = build_opener(HTTPCookieProcessor(jar))

    def call(method, path, payload=None):
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = urllib.request.Request(
            urljoin(base, path), data=data, method=method,
            headers={"Content-Type": "application/json"} if data else {})
        try:
            with opener.open(req, timeout=15) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            try:
                return e.code, json.loads(body)
            except ValueError:
                return e.code, {"ok": False, "error": body}

    email = "verify_%s@example.ru" % secrets.token_hex(4)
    password = "secret123"

    status, d = call("POST", "/api/register", {"name": "Проверка", "email": email, "password": password})
    check("API: регистрация", status == 200 and d.get("ok") and d["user"]["plan"] == "trial")

    status, d = call("POST", "/api/login", {"email": email, "password": "wrong-pass"})
    check("API: неверный пароль отклоняется", status == 401 and not d.get("ok"))

    status, d = call("POST", "/api/login", {"email": email, "password": password})
    check("API: вход", status == 200 and d.get("ok"))

    status, d = call("GET", "/api/me")
    check("API: /me отдаёт пользователя и статистику", d.get("ok") and "stats" in d and "user" in d)

    status, d = call("POST", "/api/projects", {"name": "Салон Лилия", "niche": "салон красоты"})
    pid = d.get("project", {}).get("id")
    check("API: создание проекта", d.get("ok") and bool(pid))

    status, d = call("POST", "/api/projects/%d/analyze" % pid)
    check("API: анализ ниши генерирует темы", d.get("ok") and len(d.get("themes", [])) > 0)

    status, d = call("POST", "/api/posts/generate", {"project_id": pid})
    post_id = d.get("post", {}).get("id")
    balance_after_gen = d.get("user", {}).get("posts_balance")
    check("API: генерация поста списывает баланс",
          d.get("ok") and bool(post_id) and balance_after_gen == 14)

    status, d = call("POST", "/api/posts/%d/status" % post_id, {"action": "approve"})
    check("API: одобрение поста", d["post"]["status"] == "approved")

    status, d = call("POST", "/api/posts/%d/status" % post_id, {"action": "publish"})
    check("API: публикация поста считает статистику",
          d["post"]["status"] == "published" and d["post"]["views"] > 0)

    status, d = call("POST", "/api/posts/%d/regenerate" % post_id, {"comment": "сделай короче"})
    check("API: перегенерация поста", d.get("ok") and "Учтена правка" in d["post"]["body"])

    status, d = call("POST", "/api/socials", {"network": "telegram", "project_id": pid,
                                              "token": "123:ABC", "channel": "@test_channel"})
    check("API: подключение соцсети", d.get("ok") and d.get("social"))

    status, d = call("POST", "/api/socials", {"network": "vk", "project_id": pid,
                                              "token": "vk", "channel": "vk.com/test"})
    check("API: лимит соцсетей на trial работает", status == 402 and not d.get("ok"))

    status, d = call("GET", "/api/analytics?network=all")
    check("API: аналитика по сетям",
          d.get("ok") and len(d.get("series", [])) == 7 and d["overall"]["views"] > 0)

    status, d = call("POST", "/api/tariffs/choose", {"plan": "pro", "period": "month"})
    check("API: активация тарифа Pro",
          d.get("ok") and d["user"]["plan"] == "pro" and d["user"]["posts_balance"] == 150)

    status, d = call("POST", "/api/packs/buy", {"pack": "100"})
    check("API: покупка пакета постов", d.get("ok") and d["user"]["posts_balance"] == 250)

    status, d = call("POST", "/api/plan/week", {"project_id": pid})
    check("API: контент-план на неделю", d.get("ok") and len(d.get("created", [])) == 7)

    status, d = call("POST", "/api/settings", {"name": "Проверка Обновлённая", "tone": "экспертный"})
    check("API: сохранение настроек", d.get("ok") and d["user"]["tone"] == "экспертный")

    status, d = call("GET", "/api/posts?status=scheduled")
    check("API: посты в расписании", d.get("ok") and len(d.get("posts", [])) >= 7)

    status, d = call("POST", "/api/logout")
    check("API: выход", d.get("ok"))

    status, d = call("GET", "/api/me")
    check("API: после выхода доступ закрыт (401)", status == 401 and not d.get("ok"))


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080"
    base = base.rstrip("/") + "/"
    print("Proverka kopii: %s\n" % base)

    # 1. Страницы
    contents = {}
    for p in PAGES:
        try:
            status, text = fetch(base, p)
            check("stranica %s" % p, status == 200)
            contents[p] = text
        except (URLError, HTTPError, OSError) as e:
            check("stranica %s" % p, False, str(e))

    # 2. Ассеты
    for a in ASSETS:
        try:
            status, text = fetch(base, a)
            check("asset %s" % a, status == 200 and len(text) > 500)
        except (URLError, HTTPError, OSError) as e:
            check("asset %s" % a, False, str(e))

    # 3. SEO-файлы
    for f in SEO_FILES:
        path = ROOT / f
        check("fayl %s sushchestvuet" % f, path.exists())
    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    check("robots.txt ukazyvaet sitemap", "Sitemap:" in robots)
    sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    check("sitemap.xml validen (urlset)", "<urlset" in sitemap and sitemap.count("<url>") >= 13)

    # 4. Структура страниц
    NO_COOKIE = {"register.html", "login.html", "app/index.html"}
    for p, text in contents.items():
        if not text:
            continue
        has_title = "<title>" in text
        has_h1 = "<h1" in text
        has_desc = 'name="description"' in text
        has_cookie = "cookie-banner" in text or p in NO_COOKIE
        check("%s: title/h1/description/cookie" % p,
              has_title and has_h1 and has_desc and has_cookie,
              "title=%s h1=%s desc=%s cookie=%s" % (has_title, has_h1, has_desc, has_cookie))

    # 5. Внутренние ссылки и якоря
    ids_cache = {}

    def page_ids(name):
        if name not in ids_cache:
            text = contents.get(name, "")
            if not text and (ROOT / name).exists():
                text = (ROOT / name).read_text(encoding="utf-8")
            ids_cache[name] = set(re.findall(r'id="([^"]+)"', text))
        return ids_cache[name]

    def file_exists(page, rel):
        """Резолвит относительный href от директории страницы."""
        base_dir = (ROOT / page).parent
        if rel.startswith("/"):
            candidates = [rel.lstrip("/"), rel.lstrip("/") + ".html"]
            if not rel.lstrip("/"):
                candidates = ["index.html"]
        else:
            resolved = (base_dir / rel)
            candidates = [str(resolved.relative_to(ROOT)), str(resolved.relative_to(ROOT)) + ".html"]
        for cand in candidates:
            if (ROOT / cand).exists():
                return cand
        return None

    broken = []
    anchor_missing = []
    for p, text in contents.items():
        for href in re.findall(r'(?:href|src)="([^"]+)"', text):
            if href.startswith(("http://", "https://", "mailto:", "tel:", "data:")):
                continue
            if href.startswith("#"):
                continue  # hash-роуты кабинета (#/posts и т.п.)
            target, _, frag = href.partition("#")
            if not target:
                target = p
            file_part = urlsplit(target).path
            if file_part:
                resolved = file_exists(p, file_part)
                if not resolved:
                    broken.append("%s -> %s" % (p, href))
                    continue
                if frag and frag not in page_ids(resolved):
                    anchor_missing.append("%s -> %s" % (p, href))
            elif frag and frag not in page_ids(p):
                anchor_missing.append("%s -> %s" % (p, href))
    check("vse vnutrennie ssylki sushchestvuyut", not broken, "; ".join(broken[:5]))
    check("vse yakornaya naydeny na stranicah", not anchor_missing, "; ".join(anchor_missing[:5]))

    # 6. Интерактивность на главной
    idx = contents.get("index.html", "")
    for marker, label in [
        ('data-demo-input', "demo-generator postov"),
        ('data-billing', "pereklyuchatel tarifov"),
        ('data-tab', "taby analitiki"),
        ('data-cookie-banner', "cookie-banner"),
        ('id="pricing"', "sekciya tarifov"),
        ('id="faq"', "sekciya FAQ"),
        ('id="demo"', "sekciya demo"),
        ('id="how"', "sekciya kak rabotaet"),
        ('id="features"', "sekciya vozmozhnostey"),
    ]:
        check("index.html: %s" % label, marker in idx)

    # 7. Страницы входа/регистрации
    for page in ("register.html", "login.html"):
        text = contents.get(page, "")
        check("%s: форма и ссылки" % page,
              "<form" in text and 'action' not in text and "/api/" in text,
              "form=%s api=%s" % ("<form" in text, "/api/" in text))

    # 8. Сквозной тест API личного кабинета
    print()
    test_api(base)

    # Итог
    total = len(PASS) + len(FAIL)
    print("\n" + "=" * 56)
    print("Itogo: %d proverok, proydeno %d, provaleno %d" % (total, len(PASS), len(FAIL)))
    if FAIL:
        print("\nProvalennye proverki:")
        for name, detail in FAIL:
            print("  FAIL %s %s" % (name, detail))
        sys.exit(1)
    print("Vse proverki proydeny -- kopiya rabotaet korrektno.")


if __name__ == "__main__":
    main()
