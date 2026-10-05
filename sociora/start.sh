#!/usr/bin/env bash
# Запуск копии Sociora:
#   8080 — маркетинговый сайт (server.py)
#   8082 — личный кабинет (cabinet_only_server.py, без регистрации и входа)
cd "$(dirname "$0")"
python3 server.py 8080 &
echo "Сайт:     http://127.0.0.1:8080/"
python3 cabinet_only_server.py 8082 &
echo "Кабинет:  http://127.0.0.1:8082/  (открывается сразу, без входа)"
wait
