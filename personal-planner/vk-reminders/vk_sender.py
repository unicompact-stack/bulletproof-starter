"""Optional VK message adapter. This module does not read the planner or schedule jobs."""
from __future__ import annotations

import argparse
import json
import os
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

VK_URL = 'https://api.vk.com/method/messages.send'
API_VERSION = '5.131'  # Verify against VK's current API documentation before deployment.
MAX_REPLY = 65536


class SenderError(Exception):
    """A safe error that never includes a token, response body, or message text."""


@dataclass(frozen=True)
class SendResult:
    ok: bool
    code: str
    random_id: int
    message_id: int | None = None


def _positive_integer(value: object, label: str, maximum: int = 2**63 - 1) -> int:
    if isinstance(value, bool) or not isinstance(value, (str, int)) or not str(value).isascii() or not str(value).isdigit():
        raise SenderError(f'{label}: нужно положительное целое число.')
    parsed = int(value)
    if not 0 < parsed <= maximum:
        raise SenderError(f'{label}: число вне допустимого диапазона.')
    return parsed


def new_random_id() -> int:
    return secrets.randbelow(2**31 - 1) + 1


def send_message(*, text: str, recipient: object, token: str, random_id: object,
                 opener=urllib.request.urlopen) -> SendResult:
    """Send one deliberately requested message; callers must reuse random_id on retries.

    This function does NOT retry. Only pass a token belonging to the approved group.
    It never logs message text, token, recipient, response body or exception details.
    """
    uid = _positive_integer(recipient, 'VK_USER_ID')
    rid = _positive_integer(random_id, 'random_id', 2**31 - 1)
    if not isinstance(text, str) or not text.strip() or len(text) > 4000:
        raise SenderError('Текст должен содержать от 1 до 4000 символов.')
    if not isinstance(token, str) or not token.strip() or token != token.strip():
        raise SenderError('VK_TOKEN_MESSAGES не задан или содержит лишние пробелы.')
    body = urllib.parse.urlencode({'user_id': uid, 'message': text, 'random_id': rid,
                                   'access_token': token, 'v': API_VERSION}).encode('utf-8')
    request = urllib.request.Request(VK_URL, data=body, method='POST',
                                     headers={'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        with opener(request, timeout=15) as response:
            raw = response.read(MAX_REPLY + 1)
        if len(raw) > MAX_REPLY:
            return SendResult(False, 'invalid_response', rid)
        payload = json.loads(raw.decode('utf-8'))
    except (OSError, TimeoutError, UnicodeError, ValueError, urllib.error.URLError):
        return SendResult(False, 'network_or_invalid_response', rid)
    if not isinstance(payload, dict):
        return SendResult(False, 'invalid_response', rid)
    if 'error' in payload:
        error = payload['error']
        code = error.get('error_code') if isinstance(error, dict) else None
        if isinstance(code, int) and not isinstance(code, bool) and 0 < code < 100000:
            return SendResult(False, f'vk_error_{code}', rid)
        return SendResult(False, 'vk_error', rid)
    result = payload.get('response')
    if isinstance(result, int) and not isinstance(result, bool) and result > 0:
        return SendResult(True, 'sent', rid, result)
    return SendResult(False, 'invalid_response', rid)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Проверка адаптера ВК; по умолчанию ничего не отправляется.')
    parser.add_argument('--send-test', action='store_true', help='отправить одно тестовое сообщение')
    parser.add_argument('--confirm', action='store_true', help='подтвердить отправку тестового сообщения себе')
    parser.add_argument('--random-id', help='повторить тот же тест с тем же ID после неопределённой ошибки')
    args = parser.parse_args(argv)
    if not args.send_test:
        if args.confirm or args.random_id:
            parser.error('Для --confirm и --random-id требуется --send-test.')
        print('Проверочный режим: сообщение не отправлено. Календарь не подключён.')
        return 0
    if not args.confirm:
        print('Отправка выключена: добавьте --confirm после проверки настроек.')
        return 2
    try:
        rid = _positive_integer(args.random_id, 'random_id', 2**31 - 1) if args.random_id else new_random_id()
        result = send_message(text='Тестовое сообщение планировщика. Напоминания пока не подключены.',
                              recipient=os.environ.get('VK_USER_ID', ''),
                              token=os.environ.get('VK_TOKEN_MESSAGES', ''), random_id=rid)
    except SenderError as error:
        print(f'Ошибка настройки: {error}', file=sys.stderr)
        return 2
    print(f'Результат: {result.code}; ID попытки: {result.random_id}.')
    return 0 if result.ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
