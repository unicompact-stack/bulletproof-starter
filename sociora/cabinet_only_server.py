#!/usr/bin/env python3
"""Чистый сервер личного кабинета Sociora (по умолчанию порт 8082).

Отличия от сервера сайта (server.py):
  * отдаёт ТОЛЬКО кабинет — `/` сразу открывает личный кабинет;
  * регистрации, входа и выхода нет вообще: сервер сам знает владельца
    кабинета (owner@sociora.local), поэтому заходишь и сразу работаешь;
  * лендинг, админка и страницы авторизации здесь не отдаются.

Бизнес-логика, база и мок-ИИ — общие с server.py (импорт), данные не дублируются.
"""

import sys
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))

import server as core  # noqa: E402  (общая логика: БД, API, мок-ИИ)

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8082


class CabinetOnlyHandler(core.Handler):
    """Раздаёт кабинет и API. Любой путь — это кабинет (SPA)."""

    def _serve_static(self):
        path = urlparse(self.path).path

        if path == "/app":
            # канонический URL со слешем
            self.send_response(301)
            self.send_header("Location", "/app/")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        if path.startswith("/api/"):
            # API обрабатывается в do_GET/do_POST/do_DELETE — сюда не попадаем
            return

        if path in ("/", "/app/", "/lk/", "/index.html"):
            self.path = "/lk/index.html"
        elif path.startswith(("/lk/", "/assets/")):
            pass  # стили и скрипты кабинета
        else:
            # любой другой адрес — тоже кабинет (SPA-роутинг)
            self.path = "/lk/index.html"
        try:
            super(core.Handler, self).do_GET()
        except BrokenPipeError:
            pass


def main():
    core.init_db()
    from http.server import ThreadingHTTPServer

    print("Sociora — личный кабинет (отдельный сервер, без регистрации и входа)")
    print("База данных: %s" % core.DB_PATH)
    print("Кабинет:     http://127.0.0.1:%d/" % PORT)
    print("Владелец:    %s" % core.OWNER_EMAIL)
    print("Сайт — на другом сервере: python3 server.py 8080")
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), CabinetOnlyHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nОстановлен.")


if __name__ == "__main__":
    main()
