#!/usr/bin/env python3
"""Проверка доступности опубликованного GitHub Pages."""
import time
import urllib.request
import urllib.error

URL = 'https://unicompact-stack.github.io/fsm-pro/'

print('Waiting 60s for GitHub Pages to publish...')
time.sleep(60)

for attempt in range(6):
    try:
        status = urllib.request.urlopen(URL, timeout=30).status
        print(f'STATUS: {status} URL: {URL}')
        break
    except urllib.error.HTTPError as e:
        print(f'FETCH_STATUS: {e.code} (attempt {attempt + 1}/6)')
        time.sleep(10)
    except Exception as e:
        print(f'ERROR: {e} (attempt {attempt + 1}/6)')
        time.sleep(10)