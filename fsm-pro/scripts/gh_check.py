#!/usr/bin/env python3
"""Проверка GITHUB_TOKEN и создание нового репозитория для FSM PRO."""
import base64
import json
import os
import sys
import urllib.request
import urllib.error

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
        return e.code, {'error': raw}

def main():
    token = load_token()
    # Проверка токена
    status, data = api('GET', 'https://api.github.com/user', token)
    if status != 200:
        print(f'FAIL user check: {status} {data}')
        sys.exit(1)
    login = data.get('login')
    print(f'OK user: {login}')

    repo_name = 'fsm-pro'
    # Проверить, существует ли уже репозиторий
    status, data = api('GET', f'https://api.github.com/repos/{login}/{repo_name}', token)
    if status == 200:
        print(f'REPO exists: https://github.com/{login}/{repo_name}')
        print('DEFAULT_BRANCH=' + data.get('default_branch', 'main'))
        return

    # Создать новый публичный репозиторий
    payload = {
        'name': repo_name,
        'description': 'FSM PRO — Контроль выездных работ (React PWA)',
        'private': False,
        'auto_init': False,
    }
    status, data = api('POST', 'https://api.github.com/user/repos', token, payload)
    if status == 201:
        print(f'CREATED https://github.com/{login}/{repo_name}')
        print('DEFAULT_BRANCH=' + data.get('default_branch', 'main'))
    else:
        print(f'FAIL create repo: {status} {data}')
        sys.exit(1)

if __name__ == '__main__':
    main()