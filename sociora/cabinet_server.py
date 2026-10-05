#!/usr/bin/env python3
"""Отдельный сервер личного кабинета Sociora (по умолчанию порт 8081).

Зачем отдельный процесс: маркетинговый лендинг и кабинет живут независимо —
кабинет можно перезапускать/ломать, не трогая сайт, и наоборот.

Что здесь есть:
  /                    — хаб входа (демо-режим одним кликом, вход, регистрация)
  /login, /register    — страницы входа и регистрации
  /app/                — SPA личного кабинета
  /admin/              — админ-панель (только для is_admin)
  /api/*               — весь REST API (общий с основным сервером)

Бизнес-логика и база — общие с server.py (импорт), данные не дублируются.
Лендинг здесь не отдаётся: он остаётся на server.py (порт 8080).
"""

import sys
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))

import server as core  # noqa: E402  (общая логика: БД, API, мок-ИИ)

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8081

# страницы, которые отдаёт кабинет
CABINET_PAGES = {
    "/": "hub.html",
    "/login": "login.html",
    "/register": "register.html",
    "/forgot-password": "forgot-password.html",
}
ASSET_PREFIXES = ("/assets/", "/app/", "/admin/")


class CabinetHandler(core.Handler):
    """Наследник обработчика сайта, но раздаёт только кабинет и API."""

    def _serve_static(self):
        path = urlparse(self.path).path

        # API и статика кабинета
        if path in CABINET_PAGES:
            self.path = CABINET_PAGES[path]
        elif path in ("/app", "/admin"):
            # канонический URL со слешем: иначе относительные пути ломаются
            self.send_response(301)
            self.send_header("Location", path + "/")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        elif path in ("/app/", "/app/index.html"):
            self.path = "/app/index.html"
        elif path in ("/admin/", "/admin/index.html"):
            self.path = "/admin/index.html"
        elif path.startswith(ASSET_PREFIXES):
            pass  # отдаём как есть (css/js кабинета и админки)
        elif not Path(path).suffix:
            candidate = core.ROOT / (path.lstrip("/") + ".html")
            if candidate.exists() and candidate.name in CABINET_PAGES.values():
                self.path = path + ".html"
            else:
                self._not_found()
                return
        else:
            self._not_found()
            return
        try:
            super(core.Handler, self).do_GET()
        except BrokenPipeError:
            pass

    def _not_found(self):
        body = (core.ROOT / "404.html").read_bytes()
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    core.init_db()
    from http.server import ThreadingHTTPServer

    print("Sociora — ОТДЕЛЬНЫЙ СЕРВЕР ЛИЧНОГО КАБИНЕТА")
    print("База данных: %s" % core.DB_PATH)
    print("Хаб входа:   http://127.0.0.1:%d/" % PORT)
    print("Кабинет:     http://127.0.0.1:%d/app/" % PORT)
    print("Админка:     http://127.0.0.1:%d/admin/" % PORT)
    print("Демо-вход:   demo@sociora.ru / demo1234")
    print("Лендинг — на другом сервере: python3 server.py 8080")
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), CabinetHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nОстановлен.")


if __name__ == "__main__":
    main()
