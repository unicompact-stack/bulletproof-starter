"""Local Russian text-to-speech service. No generated audio files are stored."""
import array
import io
import json
import os
from pathlib import Path
import sys
import threading
import urllib.request
import wave
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

HOST = '127.0.0.1'
PORT = 8765
ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / 'models'
MODEL_PATH = MODEL_DIR / 'v5_ru.pt'
MODEL_URL = 'https://models.silero.ai/models/tts/ru/v5_ru.pt'
SPEAKERS = ('aidar', 'baya', 'kseniya', 'xenia', 'eugene')
MAX_TEXT = 450
MAX_BODY = 8192

class VoiceEngine:
    def __init__(self):
        self.model = None
        self.lock = threading.Lock()

    def load(self):
        if self.model is not None:
            return
        try:
            import torch
        except ImportError as exc:
            raise RuntimeError('Не установлен PyTorch. Запустите start.bat и дождитесь установки.') from exc
        MODEL_DIR.mkdir(exist_ok=True)
        if not MODEL_PATH.is_file():
            temp = MODEL_PATH.with_suffix('.download')
            try:
                print('Downloading Silero model, please wait...', flush=True)
                urllib.request.urlretrieve(MODEL_URL, temp)
                os.replace(temp, MODEL_PATH)
            except Exception as exc:
                temp.unlink(missing_ok=True)
                raise RuntimeError('Не удалось загрузить модель Silero. Проверьте интернет и попробуйте ещё раз.') from exc
        try:
            torch.set_num_threads(4)
            model = torch.package.PackageImporter(str(MODEL_PATH)).load_pickle('tts_models', 'model')
            model.to(torch.device('cpu'))
            self.model = model
        except Exception as exc:
            raise RuntimeError('Не удалось открыть модель. Удалите models/v5_ru.pt и попробуйте снова.') from exc

    def synthesize(self, text, speaker):
        # Silero model is shared between requests and is not assumed thread-safe.
        with self.lock:
            self.load()
            import torch
            with torch.no_grad():
                audio = self.model.apply_tts(text=text, speaker=speaker, sample_rate=24000)
            samples = (audio.detach().cpu().clamp(-1, 1) * 32767).to(torch.int16).tolist()
            pcm = array.array('h', samples)
            if sys.byteorder != 'little':
                pcm.byteswap()
            buffer = io.BytesIO()
            with wave.open(buffer, 'wb') as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(24000)
                output.writeframes(pcm.tobytes())
            return buffer.getvalue()

engine = VoiceEngine()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Avoid logging text or audio. The default only logs path/status.
        super().log_message(fmt, *args)

    def respond(self, status, body, content_type):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def error_json(self, status, message):
        self.respond(status, json.dumps({'error': message}, ensure_ascii=False).encode('utf-8'), 'application/json; charset=utf-8')

    def valid_host(self):
        return self.headers.get('Host', '').lower() in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}')

    def do_GET(self):
        if not self.valid_host():
            return self.error_json(403, 'Недопустимый адрес.')
        path = urlparse(self.path).path
        if path == '/':
            return self.respond(200, (ROOT / 'index.html').read_bytes(), 'text/html; charset=utf-8')
        if path == '/api/voices':
            return self.respond(200, json.dumps({'voices': SPEAKERS, 'engine': 'Silero v5_ru', 'max_text': MAX_TEXT}, ensure_ascii=False).encode(), 'application/json; charset=utf-8')
        return self.error_json(404, 'Не найдено.')

    def do_POST(self):
        if not self.valid_host():
            return self.error_json(403, 'Недопустимый адрес.')
        origin = self.headers.get('Origin')
        if origin and origin not in (f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'):
            return self.error_json(403, 'Запрос с чужого сайта запрещён.')
        if urlparse(self.path).path != '/api/speak':
            return self.error_json(404, 'Не найдено.')
        if self.headers.get_content_type() != 'application/json':
            return self.error_json(415, 'Ожидается application/json.')
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            return self.error_json(400, 'Некорректный размер запроса.')
        if not 0 < length <= MAX_BODY:
            return self.error_json(413, 'Запрос слишком большой или пустой.')
        try:
            data = json.loads(self.rfile.read(length).decode('utf-8'))
            if not isinstance(data, dict):
                raise ValueError()
        except (ValueError, UnicodeDecodeError):
            return self.error_json(400, 'Некорректный JSON.')
        text = data.get('text')
        voice = data.get('voice', 'xenia')
        if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:
            return self.error_json(400, f'Введите текст длиной от 1 до {MAX_TEXT} символов.')
        if not isinstance(voice, str) or voice not in SPEAKERS:
            return self.error_json(400, 'Неизвестный голос.')
        try:
            wav = engine.synthesize(text.strip(), voice)
        except Exception as exc:
            print(f'Synthesis error: {exc}', file=sys.stderr, flush=True)
            return self.error_json(500, str(exc) if isinstance(exc, RuntimeError) else 'Ошибка озвучки. Проверьте окно программы.')
        return self.respond(200, wav, 'audio/wav')


def main():
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError:
        print(f'Port {PORT} is busy. Close the other program or an earlier copy of this one.')
        raise
    url = f'http://{HOST}:{PORT}/'
    print(f'Voice service: {url}\nKeep this window open. Press Ctrl+C to stop.', flush=True)
    if '--no-browser' not in sys.argv:
        threading.Timer(1, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopping.')
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
