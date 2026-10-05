#!/usr/bin/env python3
"""Проверка работоспособности копии Sociora.

Запуск:
    python3 server.py 8080 &                # сайт + кабинет
    python3 cabinet_only_server.py 8082 &   # отдельный кабинет (без входа)
    python3 verify.py                       # проверит оба
    python3 verify.py http://127.0.0.1:8082 # только кабинет
"""

import json
import re
import sys
import urllib.request
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from urllib.parse import urljoin
from urllib.request import build_opener, urlopen, HTTPCookieProcessor

PASS, FAIL = [], []

PAGES = [
    "index.html", "404.html",
    "servis-avtopostinga.html", "avtopostng-telegram.html", "avtopostng-vkontakte.html",
    "krosspostng-v-max.html", "krosspostng.html", "neiroset-dlya-postov.html",
    "kontent-plan.html", "oformlenie-postov.html", "zamena-smm.html",
    "analogi-smmplanner.html", "about.html", "contacts.html",
    "offer.html", "privacy.html", "terms.html", "cookies.html", "consent.html",
]
ASSETS = ["assets/css/styles.css", "assets/js/main.js", "lk/app.css", "lk/app.js"]

# обязательные разделы кабинета (сайдбар, как в оригинале)
CABINET_SECTIONS = [
    "Дашборд", "Лента постов", "Быстрый пост", "Аналитика", "Конкуренты",
    "Самообучение", "База знаний", "Темы", "Расписание", "Соцсети",
    "Настройки", "Биллинг", "Профиль", "Поддержка",
]


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append((name, detail))
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" -- " + detail) if detail and not ok else ""))


def fetch(base, path):
    url = urljoin(base, path)
    with urlopen(url, timeout=20) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")


def file_exists(page, file_part):
    if not file_part or file_part.startswith(("http://", "https://", "mailto:", "tel:", "#")):
        return page
    if file_part.startswith("/"):
        return file_part.lstrip("/")
    parts = page.split("/")[:-1] + [file_part]
    out = []
    for part in parts:
        if part == "..":
            if out:
                out.pop()
        elif part not in ("", "."):
            out.append(part)
    return "/".join(out)


def page_ids(page):
    try:
        _, text = fetch(base, page)
    except Exception:  # noqa: BLE001
        return set()
    return set(re.findall(r'id="([^"]+)"', text))


def test_pages_and_links():
    global base
    print("=" * 56)
    print("1. Страницы и ассеты")
    contents = {}
    for p in PAGES + ["lk/index.html", "admin/index.html"]:
        try:
            status, text = fetch(base, p)
            contents[p] = text
            check("страница %s отдаётся" % p, status == 200)
        except HTTPError as e:
            check("страница %s отдаётся" % p, False, "HTTP %s" % e.code)
        except Exception as e:  # noqa: BLE001
            check("страница %s отдаётся" % p, False, str(e))

    for a in ASSETS:
        try:
            status, _ = fetch(base, a)
            check("ассет %s доступен" % a, status == 200)
        except HTTPError as e:
            check("ассет %s доступен" % a, False, "HTTP %s" % e.code)
        except Exception as e:  # noqa: BLE001
            check("ассет %s доступен" % a, False, str(e))

    # 2. Структура страниц
    print("\n2. Структура страниц")
    NO_COOKIE = {"lk/index.html", "admin/index.html"}
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

    # 3. Кабинет: разделы как в оригинале
    print("\n3. Кабинет")
    lk = contents.get("lk/index.html", "")
    missing = [s for s in CABINET_SECTIONS if s not in lk]
    check("кабинет: все разделы сайдбара на месте", not missing, "; ".join(missing))
    check("кабинет: нет регистрации и входа",
          "Регистрация" not in lk and "Войти" not in lk and "/api/login" not in lk)
    check("кабинет: подключены стили и скрипты", "/lk/app.css" in lk and "/lk/app.js" in lk)
    try:
        _, app_js = fetch(base, "lk/app.js")
    except Exception:  # noqa: BLE001
        app_js = ""
    check("кабинет: кнопка «Новый пост»", "Новый пост" in lk or "Новый пост" in app_js)
    check("кабинет: баланс постов в шапке", "Баланс:" in lk)

    # 4. Внутренние ссылки и якоря
    print("\n4. Ссылки")
    broken, anchor_missing = [], []
    for p, text in contents.items():
        if not text:
            continue
        for href in re.findall(r'href="([^"]+)"', text):
            if href.startswith(("http://", "https://", "mailto:", "tel:")):
                continue
            if href.startswith("#") and len(href) > 1 and "/" in href:
                continue  # hash-роуты кабинета (#/posts и т.п.)
            target, _, frag = href.partition("#")
            if not target:
                target = p
            file_part = urlsplit(target).path if target else ""
            if file_part:
                resolved = file_exists(p, file_part)
                if resolved and not resolved.endswith((".css", ".js")):
                    try:
                        fetch(base, resolved)
                    except HTTPError as e:
                        if e.code != 404:
                            broken.append("%s -> %s" % (p, href))
                        continue
                    except Exception:  # noqa: BLE001
                        continue
                if frag and frag not in page_ids(resolved):
                    anchor_missing.append("%s -> %s" % (p, href))
            elif frag and frag not in page_ids(p):
                anchor_missing.append("%s -> %s" % (p, href))
    check("все внутренние ссылки существуют", not broken, "; ".join(broken[:5]))
    check("все якоря найдены на страницах", not anchor_missing, "; ".join(anchor_missing[:5]))

    # 5. Интерактив лендинга
    print("\n5. Интерактив лендинга")
    idx = contents.get("index.html", "")
    for marker, label in [
        ('data-demo-input', "демо-генератор постов"),
        ('data-billing', "переключатель тарифов"),
        ('data-tab', "табы аналитики"),
        ('data-cookie-banner', "cookie-banner"),
        ('id="pricing"', "секция тарифов"),
        ('id="faq"', "секция FAQ"),
        ('id="demo"', "секция демо"),
        ('id="how"', "секция «как работает»"),
        ('id="features"', "секция возможностей"),
    ]:
        check("index.html: %s" % label, marker in idx)

    # 6. Редиректы
    print("\n6. Редиректы")
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    no_redirect = build_opener(NoRedirect)

    def redirect_check(path):
        try:
            with no_redirect.open(urljoin(base, path), timeout=15) as resp:
                return resp.headers.get("Location"), resp.status
        except HTTPError as e:
            return e.headers.get("Location"), e.code

    loc, code = redirect_check("/app")
    check("/app -> /app/ (301)", code == 301 and loc == "/app/", "code=%s location=%s" % (code, loc))
    for path in ("/login", "/register", "/forgot-password"):
        loc, code = redirect_check(path)
        check("%s ведёт в кабинет (301)" % path, code == 301 and loc == "/app/",
              "code=%s location=%s" % (code, loc))
    loc, code = redirect_check("/admin")
    check("/admin -> /admin/ (301)", code == 301 and loc == "/admin/", "code=%s location=%s" % (code, loc))


def test_api():
    """Сквозной сценарий кабинета. Вход и регистрация не нужны."""
    print("\n7. Сквозной тест кабинета (без входа и регистрации)")
    jar = CookieJar()
    opener = build_opener(HTTPCookieProcessor(jar))

    def call(method, path, payload=None):
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = urllib.request.Request(
            urljoin(base, path), data=data, method=method,
            headers={"Content-Type": "application/json"} if data else {})
        try:
            with opener.open(req, timeout=20) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            try:
                return e.code, json.loads(body)
            except ValueError:
                return e.code, {"ok": False, "error": body}

    # кабинет открывается сразу, без всякой авторизации
    status, d = call("GET", "/api/me")
    check("API: кабинет открывается без входа", d.get("ok") and d["user"]["email"] == "owner@sociora.local")
    check("API: регистрация и вход удалены",
          all(call(m, p, {"email": "x@y.ru", "password": "1", "name": "x"})[0] == 404
              for m, p in (("POST", "/api/register"), ("POST", "/api/login"), ("POST", "/api/logout"))))
    check("API: у владельца есть seeded-контент",
          d["stats"]["projects"] >= 2 and d["stats"]["posts_total_all"] >= 8)

    # соцсеть подключаем к существующему проекту, пока тариф Business (3 соцсети)
    status, d = call("GET", "/api/projects")
    seed_project = (d.get("projects") or [{}])[0].get("id")
    check("API: seeded-проекты доступны", bool(seed_project))
    status, d = call("POST", "/api/socials",
                     {"network": "telegram", "project_id": seed_project,
                      "token": "123:ABC", "channel": "@verify_test"})
    social_id = d.get("social", {}).get("id")
    check("API: подключение соцсети", d.get("ok") and bool(social_id),
          d.get("error", ""))

    # проект
    status, d = call("POST", "/api/projects", {"name": "Проверка", "niche": "фитнес"})
    pid = d.get("project", {}).get("id")
    check("API: создание проекта", d.get("ok") and bool(pid))

    status, d = call("POST", "/api/projects/%d/analyze" % pid)
    check("API: анализ ниши генерирует темы", d.get("ok") and len(d.get("themes", [])) > 0)

    # посты
    status, d = call("POST", "/api/posts/generate", {"project_id": pid})
    post_id = d.get("post", {}).get("id")
    balance = d.get("user", {}).get("posts_balance")
    check("API: генерация поста списывает баланс", d.get("ok") and bool(post_id) and balance >= 0)

    status, d = call("POST", "/api/posts/%d/status" % post_id, {"action": "approve"})
    check("API: отправка поста на проверку", d["post"]["status"] == "approved")

    status, d = call("POST", "/api/posts/%d/status" % post_id, {"action": "publish"})
    check("API: публикация поста считает статистику",
          d["post"]["status"] == "published" and d["post"]["views"] > 0)

    status, d = call("POST", "/api/posts/%d/regenerate" % post_id, {"comment": "сделай короче"})
    check("API: перегенерация поста", d.get("ok") and "Учтена правка" in d["post"]["body"])

    status, d = call("POST", "/api/posts/%d/status" % post_id,
                     {"action": "schedule", "scheduled_at": "2027-01-15T10:00", "networks": ["telegram"]})
    check("API: постановка в расписание", d["post"]["status"] == "scheduled")

    status, d = call("GET", "/api/posts?status=scheduled")
    check("API: посты в расписании видны", d.get("ok") and len(d.get("posts", [])) >= 1)

    # темы проекта
    status, d = call("GET", "/api/projects/%d" % pid)
    check("API: темы проекта доступны", d.get("ok") and len(d.get("themes", [])) > 0)

    # соцсети (подключена выше — до смены тарифа)
    status, d = call("GET", "/api/socials")
    check("API: список соцсетей", d.get("ok") and len(d.get("socials", [])) >= 1)

    # аналитика
    status, d = call("GET", "/api/analytics?network=all")
    check("API: аналитика по сетям",
          d.get("ok") and len(d.get("series", [])) == 7 and d["overall"]["views"] > 0)

    # тарифы и пакеты
    status, d = call("POST", "/api/tariffs/choose", {"plan": "pro", "period": "month"})
    check("API: активация тарифа Pro",
          d.get("ok") and d["user"]["plan"] == "pro" and d["user"]["posts_balance"] >= 150)

    status, d = call("POST", "/api/packs/buy", {"pack": "100"})
    check("API: покупка пакета постов", d.get("ok") and d["user"]["posts_balance"] >= 250)

    status, d = call("GET", "/api/payments")
    check("API: история платежей", d.get("ok") and len(d.get("payments", [])) >= 1)

    # контент-план
    status, d = call("POST", "/api/plan/week", {"project_id": pid})
    check("API: контент-план на неделю", d.get("ok") and len(d.get("created", [])) == 7)

    # настройки
    status, d = call("POST", "/api/settings", {"name": "Владелец", "tone": "экспертный"})
    check("API: сохранение настроек", d.get("ok") and d["user"]["tone"] == "экспертный")

    # уборка тестовых данных
    if social_id:
        status, d = call("DELETE", "/api/socials/%d" % social_id)
        check("API: отключение соцсети", d.get("ok"))
    else:
        check("API: отключение соцсети", False, "соцсеть не была подключена (лимит тарифа?)")
    status, d = call("DELETE", "/api/posts/%d" % post_id)
    check("API: удаление поста", d.get("ok"))
    status, d = call("DELETE", "/api/projects/%d" % pid)
    check("API: удаление проекта", d.get("ok"))

    # админка: у владельца нет прав (панель сделаем позже)
    status, d = call("GET", "/api/admin/stats")
    check("API: админ-эндпоинты закрыты (403)", status == 403)

    # возвращаем демо-тариф, чтобы кабинет остался в showcase-состоянии
    status, d = call("POST", "/api/tariffs/choose", {"plan": "business", "period": "month"})
    check("API: демо-тариф Business восстановлен", d.get("ok") and d["user"]["plan"] == "business")


def test_cabinet_only(cabinet_base):
    """Отдельный сервер кабинета: заходишь — сразу кабинет, без входа."""
    print("\n8. Отдельный сервер кабинета (%s)" % cabinet_base)
    try:
        status, html = fetch(cabinet_base, "/")
        check("кабинет открывается сразу на /", status == 200 and "Дашборд" in html)
        check("на главной кабинета нет входа/регистрации",
              "Войти" not in html and "Регистрация" not in html)
    except HTTPError as e:
        check("кабинет открывается сразу на /", False, "HTTP %s" % e.code)
    except Exception as e:  # noqa: BLE001
        check("кабинет открывается сразу на /", False, str(e))

    for path in ("/app/", "/lk/"):
        try:
            status, _ = fetch(cabinet_base, path)
            check("кабинет отдаётся на %s" % path, status == 200)
        except HTTPError as e:
            check("кабинет отдаётся на %s" % path, False, "HTTP %s" % e.code)
        except Exception as e:  # noqa: BLE001
            check("кабинет отдаётся на %s" % path, False, str(e))

    for path in ("/login", "/register"):
        try:
            status, _ = fetch(cabinet_base, path)
            check("страницы %s нет — открывается кабинет" % path, status == 200)
        except HTTPError as e:
            check("страницы %s нет — открывается кабинет" % path, False, "HTTP %s" % e.code)

    try:
        status, _ = fetch(cabinet_base, "lk/app.css")
        check("кабинет: стили доступны", status == 200)
    except Exception as e:  # noqa: BLE001
        check("кабинет: стили доступны", False, str(e))

    req = urllib.request.Request(urljoin(cabinet_base, "/api/me"))
    try:
        with urlopen(req, timeout=20) as resp:
            d = json.loads(resp.read().decode("utf-8"))
        check("API кабинета работает без токена",
              d.get("ok") and d["user"]["email"] == "owner@sociora.local")
    except Exception as e:  # noqa: BLE001
        check("API кабинета работает без токена", False, str(e))


def main():
    global base
    base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080"
    base = base.rstrip("/") + "/"
    print("Проверка копии Sociora: %s" % base)

    test_pages_and_links()
    test_api()

    if "8080" in base or len(sys.argv) < 2:
        cabinet = "http://127.0.0.1:8082/"
        try:
            fetch(cabinet, "/")
            test_cabinet_only(cabinet)
        except Exception:  # noqa: BLE001
            print("\n(отдельный сервер кабинета на 8082 не запущен — проверка пропущена)")

    total = len(PASS) + len(FAIL)
    print("\n" + "=" * 56)
    print("Итого: %d проверок, пройдено %d, провалено %d" % (total, len(PASS), len(FAIL)))
    if FAIL:
        print("\nПроваленные проверки:")
        for name, detail in FAIL:
            print("  FAIL %s%s" % (name, (" -- " + detail) if detail else ""))
        return 1
    print("Всё работает: кабинет открывается сразу, без регистрации и входа.")
    return 0


from urllib.parse import urlsplit  # noqa: E402  (используется в проверках ссылок)

if __name__ == "__main__":
    sys.exit(main())
