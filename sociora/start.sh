#!/usr/bin/env bash
# Запуск обоих серверов копии Sociora:
#   8080 — маркетинговый лендинг (server.py)
#   8081 — ОТДЕЛЬНЫЙ сервер личного кабинета (cabinet_server.py)
cd "$(dirname "$0")"
python3 server.py 8080 &
echo "Лендинг:  http://127.0.0.1:8080/"
python3 cabinet_server.py 8081 &
echo "Кабинет:  http://127.0.0.1:8081/  (демо-вход: demo@sociora.ru / demo1234)"
wait
