import contextlib
import io
import json
import os
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs

import vk_sender as vk


class Response:
    def __init__(self, value): self.value = value
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self, limit): return self.value[:limit]


class SenderTests(unittest.TestCase):
    def send(self, opener, **kwargs):
        values = dict(text='Тест', recipient='123', token='secret-token', random_id=42, opener=opener)
        values.update(kwargs)
        return vk.send_message(**values)

    def test_dry_run_never_opens_network_or_needs_credentials(self):
        out = io.StringIO()
        with patch.dict(os.environ, {}, clear=True), patch('urllib.request.urlopen', side_effect=AssertionError('network')), contextlib.redirect_stdout(out):
            self.assertEqual(vk.main([]), 0)
        self.assertIn('не отправлено', out.getvalue())

    def test_send_needs_explicit_confirmation(self):
        with contextlib.redirect_stdout(io.StringIO()), patch('vk_sender.send_message', side_effect=AssertionError('sent')):
            self.assertEqual(vk.main(['--send-test']), 2)

    def test_validation(self):
        for field, invalid in [('recipient',''),('recipient','-1'),('recipient','0'),('recipient','１２'),('token',''),('text',' '),('text','x'*4001),('random_id',0),('random_id',2**31)]:
            with self.subTest(field=field, value=invalid):
                with self.assertRaises(vk.SenderError): self.send(lambda *_a, **_k: self.fail('network'), **{field:invalid})

    def test_success_request_and_retry_preserves_id(self):
        requests=[]
        def fake(req, timeout):
            self.assertEqual(req.full_url, vk.VK_URL);self.assertEqual(timeout,15)
            requests.append(parse_qs(req.data.decode()))
            return Response(b'{"response":12345}')
        for _ in range(2):
            result=self.send(fake)
            self.assertTrue(result.ok);self.assertEqual(result.message_id,12345)
        self.assertEqual([r['random_id'] for r in requests],[['42'],['42']])
        self.assertEqual(requests[0]['user_id'],['123']);self.assertEqual(requests[0]['access_token'],['secret-token'])

    def test_api_error_is_sanitized(self):
        result=self.send(lambda *a,**k: Response(json.dumps({'error':{'error_code':901,'error_msg':'secret-token private text'}}).encode()))
        self.assertEqual(result.code,'vk_error_901');self.assertNotIn('secret',repr(result))

    def test_network_error_is_sanitized(self):
        def fake(*a,**k): raise TimeoutError('secret-token private text')
        result=self.send(fake)
        self.assertFalse(result.ok);self.assertEqual(result.code,'network_or_invalid_response');self.assertNotIn('secret',repr(result))

    def test_malformed_and_invalid_success(self):
        for raw in [b'not json',b'{}',b'{"response":true}',b'[]',b'x'*70000]:
            with self.subTest(raw=raw[:20]): self.assertFalse(self.send(lambda *a,**k: Response(raw)).ok)

    def test_command_does_not_print_secrets_or_text(self):
        out,err=io.StringIO(),io.StringIO()
        with patch.dict(os.environ,{'VK_USER_ID':'123','VK_TOKEN_MESSAGES':'secret-token'},clear=True), patch('vk_sender.send_message', return_value=vk.SendResult(False,'vk_error_901',42)), contextlib.redirect_stdout(out),contextlib.redirect_stderr(err):
            self.assertEqual(vk.main(['--send-test','--confirm','--random-id','42']),1)
        self.assertIn('vk_error_901',out.getvalue())
        self.assertNotIn('secret-token',out.getvalue()+err.getvalue());self.assertNotIn('Тестовое сообщение',out.getvalue()+err.getvalue())

    def test_random_id_limits(self):
        for _ in range(100): self.assertTrue(1 <= vk.new_random_id() <= 2**31-1)

if __name__ == '__main__': unittest.main()
