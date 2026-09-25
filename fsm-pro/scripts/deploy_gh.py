#!/usr/bin/env python3
"""Загрузка dist/ в корень main (GitHub Pages) через Contents API.

Структура репозитория (после рефакторинга 2026-08-21):
  app/   — исходники проекта (vite root). Корень репо НИКОГДА не трогаем исходниками.
  dist/  — результат сборки (npm --prefix app run build)
  корень — собранный сайт (index.html, assets/, ...) — именно его отдаёт Pages.

Раньше файлы заливались в корень ВМЕСТЕ с исходниками в корне, и деплой
затирал исходный index.html — vite потом собирал старый задеплоенный сайт.
Теперь исходники в app/, так что заливка в корень безопасна.

Чистка: из корня удаляются только старые файлы САЙТА (assets/*, иконки и т.п.),
которых нет в новой сборке. Документы и app/ не трогаются.
"""
import base64
import json
import os
import sys
import urllib.request
import urllib.error

OWNER = 'unicompact-stack'
REPO = 'fsm-pro'
BRANCH = 'main'             # Pages настроен на main/(корень) — переключение API недоступно
DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist')

# Файлы сайта в корне (всё, что заливает деплой)
SITE_PATHS = {
    'index.html', 'sw.js', 'manifest.json', 'favicon.svg', 'icons.svg',
}


def load_token():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    with open(env_path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line.startswith('GITHUB_TOKEN='):
                return line.split('=', 1)[1].strip()
    raise RuntimeError('GITHUB_TOKEN not found in .env')


def api(method, url, token, data=None):
    req = urllib.request.Request(url, method=method)
    req.add_header('Authorization', f'token {token}')
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', 'fsm-pro-deploy')
    body = None
    if data is not None:
        body = json.dumps(data).encode('utf-8')
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, data=body) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8', errors='ignore')
        try:
            return e.code, json.loads(raw) if raw else {}
        except Exception:
            return e.code, {'error': raw}


def list_files(root):
    result = []
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, root).replace('\\', '/')
            result.append((rel, full))
    return result


def upload_file(token, rel_path, full_path):
    url = f'https://api.github.com/repos/{OWNER}/{REPO}/contents/{rel_path}'
    status, data = api('GET', f'{url}?ref={BRANCH}', token)
    sha = data.get('sha') if status == 200 else None
    with open(full_path, 'rb') as f:
        content_b64 = base64.b64encode(f.read()).decode('ascii')
    payload = {
        'message': f'Deploy {rel_path}',
        'content': content_b64,
        'branch': BRANCH,
    }
    if sha:
        payload['sha'] = sha
    status, data = api('PUT', url, token, payload)
    if status in (200, 201):
        return True
    print(f'  FAIL {rel_path}: {status} {data}')
    return False


def is_site_file(path):
    return path in SITE_PATHS or path.startswith('assets/') or path.startswith('icons/')


def clean_stale_site_files(token, keep):
    """Удалить старые файлы сайта (assets/, icons/, иконки), которых нет в новой сборке."""
    status, data = api('GET', f'https://api.github.com/repos/{OWNER}/{REPO}/git/trees/{BRANCH}?recursive=1', token)
    if status != 200:
        print(f'WARN tree: {status}')
        return
    for item in data.get('tree', []):
        if item['type'] != 'blob':
            continue
        path = item['path']
        if path in keep or not is_site_file(path):
            continue
        status2, data2 = api('GET', f'https://api.github.com/repos/{OWNER}/{REPO}/contents/{path}?ref={BRANCH}', token)
        sha = data2.get('sha') if status2 == 200 else None
        if sha:
            s, _ = api('DELETE', f'https://api.github.com/repos/{OWNER}/{REPO}/contents/{path}', token,
                       {'message': f'Remove stale {path}', 'sha': sha, 'branch': BRANCH})
            if s in (200, 202):
                print(f'  удалён старый {path}')


def main():
    token = load_token()

    status, data = api('GET', 'https://api.github.com/user', token)
    if status != 200:
        print(f'FAIL user check: {status} {data}')
        sys.exit(1)
    print(f'OK user: {data.get("login")}')

    files = list_files(DIST)
    if not files:
        print('FAIL: dist/ пуст — сначала выполните: npm --prefix app run build')
        sys.exit(1)
    print(f'Uploading {len(files)} files to {OWNER}/{REPO} [{BRANCH}] (root)...')
    ok = True
    for rel, full in files:
        print(f'  {rel}')
        ok &= upload_file(token, rel, full)
    if not ok:
        print('Upload finished with errors')
        sys.exit(1)

    clean_stale_site_files(token, {rel for rel, _ in files})
    print(f'DONE: https://{OWNER}.github.io/{REPO}/')


if __name__ == '__main__':
    main()
