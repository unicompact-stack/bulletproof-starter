#!/usr/bin/env python3
"""Проверка ОТДЕЛЬНОГО сервера личного кабинета (cabinet_server.py).

Запуск:
    python3 cabinet_server.py 8081 &
    python3 verify_cabinet.py http://127.0.0.1:8081

Проверяем именно то, на что жаловался пользователь: вход в кабинет без
регистрации, живую сессию (токен в hash + Bearer) и то, что лендинг здесь
не отдаётся — сервисы разделены.
"""

import json
import re
import sys
import urllib.request
from http.client import HTTPException  # noqa: F401
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from urllib.parse import urljoin
from urllib.request import build_opener, urlopen, HTTPCookieProcessor

PASS, FAIL = [], []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append((name, detail))
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" -- " + detail) if detail and not ok else ""))


def fetch(base, path, headers=None):
    req = urllib.request.Request(urljoin(base, path), headers=headers or {})
    with urlopen(req, timeout=15) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8081"
    base = base.rstrip("/") + "/"

    print("=" * 56)
    print("Проверка отдельного сервера кабинета: %s" % base)
    print("=" * 56)

    # 1. Хаб входа
    try:
        status, hub = fetch(base, "/")
        check("хаб входа отдаётся (200)", status == 200)
        check("хаб: кнопка демо-входа без регистрации",
              "hub-demo" in hub and "demo@sociora.ru" in hub)
        check("хаб: показаны демо-креды", "demo1234" in hub and "admin1234" in hub)
        check("хаб: ссылка на регистрацию", 'href="/register"' in hub)
    except Exception as e:  # noqa: BLE001
        check("хаб входа отдаётся (200)", False, str(e))

    # 2. Страницы кабинета
    for path, marker in [
        ("/login", "btn-demo"),
        ("/register", "register"),
        ("/forgot-password", "form-reset"),
        ("/app/", "app.js"),
        ("/admin/", "admin.js"),
    ]:
        try:
            status, text = fetch(base, path.lstrip("/"))
            check("страница %s открывается" % path, status == 200 and marker in text,
                  "status=%s" % status)
        except HTTPError as e:
            check("страница %s открывается" % path, False, "HTTP %s" % e.code)
        except Exception as e:  # noqa: BLE001
            check("страница %s открывается" % path, False, str(e))

    # 3. Разделение сервисов: лендинг здесь не отдаётся
    for path in ("/index.html", "/about", "/tariffs", "/kontent-plan", "/oformlenie-postov"):
        try:
            status, _ = fetch(base, path.lstrip("/"))
            check("лендинг %s здесь недоступен (404)" % path, status == 404)
        except HTTPError as e:
            check("лендинг %s здесь недоступен (404)" % path, e.code == 404, "HTTP %s" % e.code)
        except Exception as e:  # noqa: BLE001
            check("лендинг %s здесь недоступен (404)" % path, False, str(e))

    # 4. Редиректы со слешем
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    no_redirect = build_opener(NoRedirect)
    for path in ("/app", "/admin"):
        try:
            with no_redirect.open(urljoin(base, path), timeout=15) as resp:
                loc, code = resp.headers.get("Location"), resp.status
        except HTTPError as e:
            loc, code = e.headers.get("Location"), e.code
        check("%s -> %s/ (301)" % (path, path), code == 301 and loc == path + "/",
              "code=%s location=%s" % (code, loc))

    # 5. Сквозной сценарий входа: демо без регистрации
    jar = CookieJar()
    opener = build_opener(HTTPCookieProcessor(jar))

    def call(method, path, payload=None, token=None):
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = urllib.request.Request(urljoin(base, path), data=data, method=method,
                                     headers={"Content-Type": "application/json"} if data else {})
        if token:
            req.add_header("Authorization", "Bearer " + token)
        try:
            with opener.open(req, timeout=15) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            try:
                return e.code, json.loads(body)
            except ValueError:
                return e.code, {"ok": False, "error": body}

    status, d = call("POST", "/api/login", {"email": "demo@sociora.ru", "password": "demo1234"})
    check("API: демо-вход без регистрации", status == 200 and d.get("ok"))
    demo_token = d.get("token", "")

    status, d = call("GET", "/api/me", token=demo_token)
    check("API: кабинет открывается по токену (как после /app/#token=…)",
          d.get("ok") and d["user"]["email"] == "demo@sociora.ru" and d["stats"]["projects"] >= 2)

    # регистрация прямо на сервере кабинета
    import random
    email = "cabinet_%d@example.ru" % random.randint(10000, 99999)
    status, d = call("POST", "/api/register",
                     {"name": "Тест Кабинета", "email": email, "password": "secret123"})
    check("API: регистрация на сервере кабинета", status == 200 and d.get("ok"))
    new_token = d.get("token", "")

    status, d = call("GET", "/api/me", token=new_token)
    check("API: новый пользователь сразу в кабинете",
          d.get("ok") and d["user"]["plan"] == "trial" and d["user"]["posts_balance"] == 15)

    status, d = call("GET", "/api/projects", token=new_token)
    check("API: список проектов пуст у нового пользователя", d.get("ok") and d["projects"] == [])

    # 6. Админка
    status, d = call("POST", "/api/login", {"email": "admin@sociora.ru", "password": "admin1234"})
    check("API: вход администратора", status == 200 and d.get("ok") and d["user"]["is_admin"])
    admin_token = d.get("token", "")

    status, d = call("GET", "/api/admin/stats", token=admin_token)
    check("API: админ-статистика", d.get("ok") and d["stats"]["users"] >= 2)

    def call_clean(method, path, token=None):
        """Запрос без cookie-jar: проверяем именно токен, а не оставшуюся сессию."""
        req = urllib.request.Request(urljoin(base, path), method=method)
        if token:
            req.add_header("Authorization", "Bearer " + token)
        try:
            with urlopen(req, timeout=15) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            try:
                return e.code, json.loads(body)
            except ValueError:
                return e.code, {"ok": False, "error": body}

    status, d = call_clean("GET", "/api/admin/users", token=demo_token)
    check("API: не-админ получает 403", status == 403 and not d.get("ok"))

    status, d = call_clean("GET", "/api/admin/stats")
    check("API: гость получает 401", status == 401 and not d.get("ok"))

    # 7. Блокировка
    status, d = call("GET", "/api/admin/users", token=admin_token)
    demo_id = next((u["id"] for u in d.get("users", []) if u["email"] == "demo@sociora.ru"), None)
    if demo_id:
        status, d = call("POST", "/api/admin/users/%d" % demo_id,
                         {"action": "block", "blocked": True}, token=admin_token)
        check("API: блокировка пользователя", d.get("ok"))
        status, d = call("POST", "/api/login", {"email": "demo@sociora.ru", "password": "demo1234"})
        check("API: заблокированный не входит (403)", status == 403)
        status, d = call("POST", "/api/admin/users/%d" % demo_id,
                         {"action": "block", "blocked": False}, token=admin_token)
        check("API: разблокировка пользователя", d.get("ok"))
        status, d = call("POST", "/api/login", {"email": "demo@sociora.ru", "password": "demo1234"})
        check("API: после разблокировки вход снова работает", status == 200)
    else:
        check("API: блокировка пользователя", False, "демо-пользователь не найден")

    # Итог
    total = len(PASS) + len(FAIL)
    print("\n" + "=" * 56)
    print("Itogo: %d proverok, proydeno %d, provaleno %d" % (total, len(PASS), len(FAIL)))
    if FAIL:
        print("\nProvalennye proverki:")
        for name, detail in FAIL:
            print("  FAIL %s%s" % (name, (" -- " + detail) if detail else ""))
        return 1
    print("Otdelnyy server kabineta rabotaet korrektno.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
