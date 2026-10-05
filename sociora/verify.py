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

import re
import sys
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from urllib.request import urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parent

PAGES = [
    "index.html", "404.html",
    "servis-avtopostinga.html", "avtopostng-telegram.html", "avtopostng-vkontakte.html",
    "krosspostng-v-max.html", "krosspostng.html", "neiroset-dlya-postov.html",
    "kontent-plan.html", "oformlenie-postov.html", "zamena-smm.html",
    "analogi-smmplanner.html", "about.html", "contacts.html",
    "offer.html", "privacy.html", "terms.html", "cookies.html", "consent.html",
]
ASSETS = ["assets/css/styles.css", "assets/js/main.js"]
SEO_FILES = ["robots.txt", "sitemap.xml", "llms.txt"]

PASS, FAIL = [], []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append((name, detail))
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" -- " + detail) if detail and not ok else ""))


def fetch(base, path):
    url = urljoin(base, path)
    with urlopen(url, timeout=15) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")


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
    for p, text in contents.items():
        if not text:
            continue
        has_title = "<title>" in text
        has_h1 = "<h1" in text
        has_desc = 'name="description"' in text
        has_cookie = "cookie-banner" in text
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

    broken = []
    anchor_missing = []
    for p, text in contents.items():
        for href in re.findall(r'(?:href|src)="([^"]+)"', text):
            if href.startswith(("http://", "https://", "mailto:", "tel:", "data:")):
                continue
            target, _, frag = href.partition("#")
            if not target:
                target = p
            file_part = urlsplit(target).path
            if file_part and not (ROOT / file_part).exists():
                broken.append("%s -> %s" % (p, href))
                continue
            if frag and frag not in page_ids(file_part or p):
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
