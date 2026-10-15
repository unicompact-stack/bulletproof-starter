#!/usr/bin/env bash
# Запуск сайта агента-статейника одной командой.
#
#   ./run.sh            # собрать (если нужно) и поднять на порту 8000
#   ./run.sh 8080       # другой порт
#
# Скрипт идемпотентный: можно запускать после каждого перезапуска окружения.
# Сайт собран? — не пересобирает. Данные (data/) создаёт сам сервер.
set -euo pipefail

PORT="${1:-8000}"
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null; then
  echo "нужен python3 (3.10+)" >&2
  exit 1
fi

# 1. Проверка движка: если статьи не проходят QA — публиковать нечего, говорим об этом прямо.
echo "— проверка статей —"
if ! python3 engine/qa.py --corpus >/dev/null; then
  echo "ВНИМАНИЕ: не все статьи прошли QA. Сервер поднимется, но эти статьи на сайт не попадут." >&2
  python3 engine/qa.py --corpus | grep -E "^FAIL|Не пройдено" || true
fi

# 2. Сборка. Пересобираем, если сайта нет или статьи менялись позже сборки.
NEED_BUILD=0
if [ ! -f site/index.html ]; then
  NEED_BUILD=1
else
  newest_article=$(find content/articles -name '*.md' -newer site/index.html 2>/dev/null | head -1 || true)
  [ -n "$newest_article" ] && NEED_BUILD=1
fi
if [ "$NEED_BUILD" = "1" ]; then
  echo "— сборка сайта —"
  python3 engine/web.py build
else
  echo "— сайт уже собран, берём готовый (пересобрать: rm -rf site) —"
fi

# 3. Порт занят? — скажем честно, а не упадём с непонятной ошибкой.
if (command -v ss >/dev/null && ss -ltn | grep -q ":${PORT} ") || \
   (command -v lsof >/dev/null && lsof -i ":${PORT}" >/dev/null 2>&1); then
  echo "Порт ${PORT} уже занят. Другой порт: ./run.sh 8080" >&2
  exit 2
fi

echo "— запуск на 0.0.0.0:${PORT} —"
exec python3 engine/web.py serve --port "${PORT}"
