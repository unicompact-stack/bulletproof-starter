import http.client
import json
import threading
import unittest
from unittest.mock import patch

import server


class LocalVoiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.port = cls.httpd.server_port
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join()

    def request(self, method, path, data=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        body = json.dumps(data, ensure_ascii=False).encode() if data is not None else None
        if body is not None:
            headers = {'Content-Type': 'application/json', **(headers or {})}
        connection.request(method, path, body, headers or {})
        response = connection.getresponse()
        payload = response.read()
        connection.close()
        return response.status, response.getheader('Content-Type'), payload

    def test_home_and_voice_list(self):
        self.assertEqual(self.request('GET', '/')[0], 200)
        status, _, body = self.request('GET', '/api/voices')
        self.assertEqual(status, 200)
        self.assertIn('xenia', json.loads(body)['voices'])

    def test_speak_returns_audio_without_writing_file(self):
        with patch.object(server.engine, 'synthesize', return_value=b'RIFFdummyWAVE') as synth:
            status, kind, payload = self.request('POST', '/api/speak', {'text': 'Привет!', 'voice': 'aidar'})
        self.assertEqual((status, kind, payload), (200, 'audio/wav', b'RIFFdummyWAVE'))
        synth.assert_called_once_with('Привет!', 'aidar')

    def test_validation(self):
        for data in ({'text': ''}, {'text': 'а' * 451}, {'text': 'hi', 'voice': 'other'}):
            self.assertEqual(self.request('POST', '/api/speak', data)[0], 400)

    def test_rejects_other_browser_origins(self):
        status, _, _ = self.request('POST', '/api/speak', {'text': 'Привет'}, {'Origin': 'https://example.com'})
        self.assertEqual(status, 403)

    def test_invalid_host(self):
        self.assertEqual(self.request('GET', '/', headers={'Host': 'example.com'})[0], 403)

if __name__ == '__main__':
    unittest.main()
