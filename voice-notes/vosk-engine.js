/* ==========================================================================
   vosk-engine.js — офлайн-движок распознавания речи (Vosk WASM, vosk-browser)
   --------------------------------------------------------------------------
   Что здесь есть:
     • однократное скачивание модели (tar.gz) с прогрессом и 3 попытками;
     • проверка целостности кэша (тип, размер) + самовосстановление;
     • ленивая «тяжёлая» инициализация Vosk (Web Worker + WASM) при 1-й записи;
     • микрофон → AudioContext(16 кГц) → ScriptProcessor(4096) →
       recognizer.acceptWaveformFloat(...) (как в официальном примере vosk-browser);

   ВАЖНО про модель:
     Vosk.createModel(url) поднимает Web Worker из blob-URL. Такой воркер
     НЕ видит кэш Service Worker и не умеет тянуть относительный путь,
     поэтому модель всегда передаётся как blob: URL, полученный из Cache API.

   ВАЖНО про vosk-processor.js:
     В опубликованном пакете vosk-browser@0.0.8 файла vosk-processor.js нет:
     AudioWorklet в этой сборке не используется вообще, а аудио-пайплайн
     строится на ScriptProcessorNode (официальный пример ccoreilly/vosk-browser).
     Поэтому подключать нечего — см. README, раздел «Отличия от ТЗ».

   Зависимости: скрипт lib/vosk/vosk-browser/dist/vosk.js подключается лениво
   (тег <script> создаётся при первом использовании) и даёт глобальный Vosk.
   ========================================================================== */

(function (global) {
  'use strict';

  /** Путь к модели. Поменяй здесь (и кэш моделей подхватит новый файл). */
  var MODEL_PATH = 'models/vosk-model-small-ru-0.4.tar.gz';
  /** Отдельный кэш для модели: любые обновления приложения его не трогают. */
  var MODELS_CACHE = 'voice-notes-models-v1';
  var VOSK_SCRIPT_PATH = 'lib/vosk/vosk-browser/dist/vosk.js';
  var SAMPLE_RATE = 16000;
  var MIN_MODEL_BYTES = 10 * 1024 * 1024; // меньше 10 МБ — точно битый кэш / HTML-страница
  var DOWNLOAD_ATTEMPTS = 3;
  var MODEL_LOAD_TIMEOUT = 120000; // 2 минуты на разворачивание WASM + модели

  /* ------------------------------------------------------------------ утилиты */

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function engineError(code, message) {
    var error = new Error(message);
    error.code = code;
    return error;
  }

  function withTimeout(promise, ms, message) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(engineError('timeout', message));
      }, ms);
      promise.then(
        function (value) { clearTimeout(timer); resolve(value); },
        function (error) { clearTimeout(timer); reject(error); }
      );
    });
  }

  /* ------------------------------------------------------------ поддержка --- */

  function isSupported() {
    return typeof global.fetch === 'function' &&
      typeof global.caches !== 'undefined' &&
      typeof global.WebAssembly === 'object' &&
      typeof (global.AudioContext || global.webkitAudioContext) === 'function';
  }

  /* ------------------------------------------------------------- в кэше ----- */

  /**
   * Проверяет ответ из кэша: это должен быть не HTML и не «огрызок».
   * Content-Type у python -m http.server для .tar.gz бывает
   * application/x-tar, application/gzip или application/octet-stream —
   * поэтому запрещаем только явно «страничные» типы.
   */
  async function inspectResponse(response) {
    var type = (response.headers.get('content-type') || '').toLowerCase();

    if (type.indexOf('text/html') !== -1 || type.indexOf('application/json') !== -1) {
      return { ok: false, reason: 'type', type: type };
    }

    var size = Number(response.headers.get('content-length') || 0);
    if (!size) {
      try {
        size = (await response.clone().blob()).size;
      } catch (error) {
        size = 0;
      }
    }

    if (size > 0 && size < MIN_MODEL_BYTES) {
      return { ok: false, reason: 'size', size: size, type: type };
    }

    return { ok: true, size: size, type: type };
  }

  async function readCachedModel() {
    if (typeof global.caches === 'undefined') return null;
    var cache;
    try {
      cache = await caches.open(MODELS_CACHE);
    } catch (error) {
      return null;
    }
    var response = await cache.match(MODEL_PATH);
    if (!response) return null;

    var info = await inspectResponse(response);
    if (!info.ok) {
      // Битый кэш (например, сервер отдал 404-страницу) — лечим себя сами.
      try { await cache.delete(MODEL_PATH); } catch (error) { /* ignore */ }
      return null;
    }
    return response;
  }

  async function getModelState() {
    try {
      var response = await readCachedModel();
      if (!response) return { cached: false, size: 0 };
      var info = await inspectResponse(response);
      return { cached: true, size: info.size || 0 };
    } catch (error) {
      return { cached: false, size: 0, error: error };
    }
  }

  /* --------------------------------------------------------- скачивание ----- */

  var downloadPromise = null;

  /**
   * Скачивает модель в Cache API с прогрессом. Повторные вызовы
   * переиспользуют уже идущее скачивание.
   * onProgress({ percent, loaded, total, attempt })
   */
  function downloadModel(onProgress) {
    if (downloadPromise) return downloadPromise;

    downloadPromise = (async function () {
      var lastError = null;

      for (var attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
        try {
          await downloadOnce(onProgress, attempt);
          return await getModelState();
        } catch (error) {
          lastError = error;
          console.warn('[vosk] попытка скачивания ' + attempt + ' не удалась:', error);
          if (attempt < DOWNLOAD_ATTEMPTS) {
            await sleep(700 * attempt);
          }
        }
      }

      throw lastError || engineError('download', 'Не удалось скачать модель');
    })();

    // Позволяем повторить позже, если попытка провалилась.
    downloadPromise.catch(function () { downloadPromise = null; });

    return downloadPromise;
  }

  async function downloadOnce(onProgress, attempt) {
    var cache = await caches.open(MODELS_CACHE);

    var response;
    try {
      response = await fetch(MODEL_PATH, { cache: 'no-store', credentials: 'same-origin' });
    } catch (error) {
      throw engineError('network', 'Нет соединения — модель не скачалась');
    }

    if (!response.ok) {
      throw engineError('http', 'Сервер вернул ошибку ' + response.status + ' вместо файла модели. ' +
        'Проверь, что файл лежит в папке models/');
    }

    var type = (response.headers.get('content-type') || '').toLowerCase();
    if (type.indexOf('text/html') !== -1) {
      throw engineError('http', 'Сервер вернул HTML вместо модели — файл models/*.tar.gz отсутствует');
    }

    var total = Number(response.headers.get('content-length') || 0);
    var loaded = 0;
    var body;

    function report(final) {
      if (typeof onProgress !== 'function') return;
      var percent = total ? Math.min(final ? 100 : 99, Math.floor((loaded / total) * 100)) : null;
      onProgress({ percent: percent, loaded: loaded, total: total, attempt: attempt });
    }

    report(false);

    if (response.body && typeof global.TransformStream === 'function') {
      // Потоковая запись: данные сразу уходят в Cache API, память не растёт.
      body = response.body.pipeThrough(new TransformStream({
        transform: function (chunk, controller) {
          loaded += chunk.byteLength;
          report(false);
          controller.enqueue(chunk);
        }
      }));
    } else if (response.body && typeof response.body.getReader === 'function') {
      // Fallback для старых браузеров: читаем поток вручную и считаем проценты.
      var reader = response.body.getReader();
      var chunks = [];
      for (;;) {
        var step = await reader.read();
        if (step.done) break;
        chunks.push(step.value);
        loaded += step.value.byteLength;
        report(false);
      }
      body = new Blob(chunks);
    } else {
      var buffer = await response.arrayBuffer();
      loaded = buffer.byteLength;
      body = buffer;
    }

    var headers = { 'Content-Type': 'application/gzip' };
    if (total) headers['Content-Length'] = String(total);

    try {
      await cache.put(MODEL_PATH, new Response(body, {
        status: 200,
        statusText: 'OK',
        headers: headers
      }));
    } catch (error) {
      throw engineError('quota', 'Браузер не смог сохранить модель (не хватает места). ' +
        'Освободи 100+ МБ и попробуй снова');
    }

    // Проверяем, что запись действительно произошла: молчаливые сбои бывают.
    var check = await cache.match(MODEL_PATH);
    if (!check) {
      throw engineError('cache', 'Модель не сохранилась в кэш');
    }

    var info = await inspectResponse(check);
    if (!info.ok) {
      try { await cache.delete(MODEL_PATH); } catch (error) { /* ignore */ }
      throw engineError('cache', 'Скачанный файл модели повреждён (' + info.reason + ')');
    }

    if (typeof onProgress === 'function') {
      onProgress({ percent: 100, loaded: loaded, total: total || loaded, attempt: attempt });
    }
  }

  /* ------------------------------------------------- загрузка скрипта Vosk --- */

  var scriptPromise = null;

  function loadVoskScript() {
    if (global.Vosk) return Promise.resolve();
    if (scriptPromise) return scriptPromise;

    scriptPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = VOSK_SCRIPT_PATH;
      script.async = true;
      script.onload = function () {
        if (global.Vosk) resolve();
        else reject(engineError('script', 'vosk.js загрузился, но объект Vosk не появился'));
      };
      script.onerror = function () {
        reject(engineError('script', 'Не удалось загрузить vosk.js. Проверь, что файл на месте и закэширован'));
      };
      document.head.appendChild(script);
    });

    scriptPromise.catch(function () { scriptPromise = null; });
    return scriptPromise;
  }

  /** Прогревает vosk.js (≈5.6 МБ) в кэш, чтобы он был доступен офлайн. */
  async function prefetchScript() {
    try {
      await fetch(VOSK_SCRIPT_PATH, { cache: 'force-cache' });
    } catch (error) { /* не критично */ }
  }

  /* ------------------------------------------------------------- модель ----- */

  var model = null;
  var modelPromise = null;

  function blobStartsWithGzip(blob) {
    return blob.slice(0, 2).arrayBuffer().then(function (buffer) {
      var head = new Uint8Array(buffer);
      return head.length === 2 && head[0] === 0x1f && head[1] === 0x8b;
    });
  }

  /**
   * Ленивая инициализация: скачанную модель разворачиваем в Web Worker.
   * Модель передаётся только как blob: URL (см. шапку файла).
   */
  function ensureModel(onStatus) {
    if (model) return Promise.resolve(model);
    if (modelPromise) return modelPromise;

    modelPromise = (async function () {
      var status = typeof onStatus === 'function' ? onStatus : function () {};

      status('Загружаю офлайн-движок…');
      await loadVoskScript();

      var response = await readCachedModel();
      if (!response) {
        if (!navigator.onLine) {
          throw engineError('model-missing',
            'Офлайн-движок ещё не скачан. Подключи интернет один раз — дальше всё работает без сети');
        }
        status('Скачиваем модель…');
        await downloadModel();
        response = await readCachedModel();
        if (!response) {
          throw engineError('model-missing', 'Не удалось получить модель распознавания');
        }
      }

      status('Проверяю модель…');
      var blob = await response.blob();

      if (!(await blobStartsWithGzip(blob))) {
        try {
          var cache = await caches.open(MODELS_CACHE);
          await cache.delete(MODEL_PATH);
        } catch (error) { /* ignore */ }
        throw engineError('corrupt', 'Файл модели повреждён. Перезагрузи приложение — я скачаю его заново');
      }

      status('Распаковываю движок…');
      var blobUrl = URL.createObjectURL(blob);

      try {
        var loadedModel = await withTimeout(
          global.Vosk.createModel(blobUrl),
          MODEL_LOAD_TIMEOUT,
          'Движок не успел запуститься за 2 минуты. Попробуй перезагрузить приложение'
        );
        model = loadedModel;
        return model;
      } catch (error) {
        throw error instanceof Error
          ? error
          : engineError('model-load', 'Не удалось запустить офлайн-движок');
      } finally {
        // Воркер уже прочитал модель при загрузке — blob больше не нужен.
        setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 0);
      }
    })();

    modelPromise.catch(function () { modelPromise = null; });

    return modelPromise;
  }

  /* -------------------------------------------------------------- аудио ----- */

  /**
   * Линейный ресемплер: браузер может проигнорировать запрошенные 16 кГц,
   * а модель Vosk ждёт именно 16 кГц.
   */
  function createResampler(sourceRate, targetRate) {
    if (!sourceRate || sourceRate === targetRate) return null;

    var ratio = sourceRate / targetRate;
    var tail = new Float32Array(0);
    var position = 0;

    return {
      process: function (input) {
        var data = new Float32Array(tail.length + input.length);
        data.set(tail, 0);
        data.set(input, tail.length);

        var out = new Float32Array(Math.ceil((data.length - position) / ratio) + 2);
        var written = 0;
        var cursor = position;

        while (cursor + 1 < data.length) {
          var index = Math.floor(cursor);
          var fraction = cursor - index;
          out[written++] = data[index] * (1 - fraction) + data[index + 1] * fraction;
          cursor += ratio;
        }

        var keepFrom = Math.floor(cursor);
        if (keepFrom > data.length) keepFrom = data.length;
        tail = data.slice(keepFrom);
        position = cursor - keepFrom;

        return out.subarray(0, written);
      }
    };
  }

  function createAudioContext() {
    var Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) {
      throw engineError('no-audio', 'Браузер не поддерживает Web Audio');
    }
    try {
      return new Ctx({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
    } catch (error) {
      return new Ctx();
    }
  }

  async function getMicStream() {
    var mediaDevices = navigator.mediaDevices;
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
      throw engineError('insecure',
        'Микрофон недоступен: открой приложение через localhost или HTTPS');
    }

    try {
      return await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: SAMPLE_RATE
        },
        video: false
      });
    } catch (error) {
      var codes = {
        NotAllowedError: 'mic-denied',
        PermissionDeniedError: 'mic-denied',
        SecurityError: 'insecure',
        NotFoundError: 'mic-missing',
        DevicesNotFoundError: 'mic-missing',
        OverconstrainedError: 'mic-missing',
        ConstraintNotSatisfiedError: 'mic-missing',
        NotReadableError: 'mic-busy',
        TrackStartError: 'mic-busy',
        AbortError: 'mic-busy'
      };
      var messages = {
        'mic-denied': 'Нет доступа к микрофону. Разреши его в настройках браузера',
        'insecure': 'Микрофон доступен только по localhost или HTTPS',
        'mic-missing': 'Микрофон не найден на этом устройстве',
        'mic-busy': 'Микрофон занят другим приложением'
      };
      var code = codes[error && error.name] || 'mic-error';
      throw engineError(code, messages[code] || 'Не удалось включить микрофон');
    }
  }

  /* ------------------------------------------------------------ сессия ------ */

  var session = null;

  function safeDisconnect(node) {
    if (!node) return;
    try { node.disconnect(); } catch (error) { /* ignore */ }
  }

  async function cleanup(s) {
    if (!s) return;

    if (s.processor) {
      s.processor.onaudioprocess = null;
      safeDisconnect(s.processor);
    }
    safeDisconnect(s.source);
    safeDisconnect(s.sink);

    if (s.recognizer) {
      try { s.recognizer.remove(); } catch (error) { /* ignore */ }
      s.recognizer = null;
    }

    if (s.stream) {
      s.stream.getTracks().forEach(function (track) {
        try { track.stop(); } catch (error) { /* ignore */ }
      });
      s.stream = null;
    }

    if (s.ctx && s.ctx.state !== 'closed') {
      try { await s.ctx.close(); } catch (error) { /* ignore */ }
    }
    s.ctx = null;
  }

  /**
   * Стартует офлайн-распознавание.
   * handlers: { onStatus, onReady, onPartial, onFinal, onError, onEnd }
   */
  async function start(handlers) {
    handlers = handlers || {};
    if (session) {
      throw engineError('busy', 'Запись уже идёт');
    }

    var s = {
      handlers: handlers,
      cancelled: false,
      ended: false,
      ctx: null,
      stream: null,
      source: null,
      processor: null,
      sink: null,
      recognizer: null,
      resampler: null
    };
    session = s;

    try {
      // AudioContext создаём синхронно, ещё внутри жеста пользователя:
      // иначе Safari считает его «автовоспроизведением» и не запускает звук.
      s.ctx = createAudioContext();
      if (s.ctx.state === 'suspended') {
        try { await s.ctx.resume(); } catch (error) { /* ignore */ }
      }

      handlers.onStatus && handlers.onStatus('Готовлю микрофон…');
      s.stream = await getMicStream();
      if (s.cancelled) { await cleanup(s); return; }

      var loadedModel = await ensureModel(function (message) {
        handlers.onStatus && handlers.onStatus(message);
      });
      if (s.cancelled) { await cleanup(s); return; }

      var recognizer = new loadedModel.KaldiRecognizer(SAMPLE_RATE);
      s.recognizer = recognizer;

      recognizer.on('partialresult', function (message) {
        if (s.ended) return;
        var partial = message && message.result && message.result.partial;
        if (partial) handlers.onPartial && handlers.onPartial(String(partial));
      });

      recognizer.on('result', function (message) {
        if (s.ended) return;
        var text = message && message.result ? message.result.text : '';
        handlers.onFinal && handlers.onFinal(String(text || ''));
      });

      recognizer.on('error', function (message) {
        if (s.ended) return;
        handlers.onError && handlers.onError(
          engineError('vosk', (message && message.error) || 'Ошибка движка Vosk')
        );
      });

      // Модель могла грузиться долго — на всякий случай будим контекст снова.
      if (s.ctx.state === 'suspended') {
        try { await s.ctx.resume(); } catch (error) { /* ignore */ }
      }
      if (s.cancelled) { await cleanup(s); return; }

      s.resampler = createResampler(s.ctx.sampleRate, SAMPLE_RATE);
      s.source = s.ctx.createMediaStreamSource(s.stream);
      s.processor = s.ctx.createScriptProcessor(4096, 1, 1);

      s.processor.onaudioprocess = function (event) {
        if (s.ended || !s.recognizer) return;
        try {
          var input = event.inputBuffer.getChannelData(0);
          var chunk = s.resampler ? s.resampler.process(input) : input;
          if (chunk.length) {
            s.recognizer.acceptWaveformFloat(chunk, SAMPLE_RATE);
          }
        } catch (error) {
          console.error('[vosk] audio chunk failed', error);
        }
      };

      // ScriptProcessor работает только при подключении к destination.
      // Gain = 0, чтобы микрофон не уходил в динамики (иначе эхо).
      s.sink = s.ctx.createGain();
      s.sink.gain.value = 0;
      s.source.connect(s.processor);
      s.processor.connect(s.sink);
      s.sink.connect(s.ctx.destination);

      handlers.onStatus && handlers.onStatus('Слушаю…');
      handlers.onReady && handlers.onReady();
    } catch (error) {
      session = null;
      await cleanup(s);
      throw error;
    }
  }

  async function stop() {
    var s = session;
    if (!s) return;
    session = null;
    s.cancelled = true;

    // 1. Перестаём подавать звук.
    if (s.processor) {
      s.processor.onaudioprocess = null;
      safeDisconnect(s.processor);
    }
    safeDisconnect(s.source);
    if (s.stream) {
      s.stream.getTracks().forEach(function (track) {
        try { track.stop(); } catch (error) { /* ignore */ }
      });
    }

    // 2. Просим движок досчитать последнюю фразу и ждём событие result.
    if (s.recognizer) {
      try { s.recognizer.retrieveFinalResult(); } catch (error) { /* ignore */ }
      await sleep(400);
    }

    s.ended = true;
    await cleanup(s);

    if (s.handlers && s.handlers.onEnd) s.handlers.onEnd();
  }

  function isActive() {
    return !!session;
  }

  function resetModel() {
    model = null;
    modelPromise = null;
  }

  global.VoskEngine = {
    MODEL_PATH: MODEL_PATH,
    MODELS_CACHE: MODELS_CACHE,
    SAMPLE_RATE: SAMPLE_RATE,
    isSupported: isSupported,
    isActive: isActive,
    getModelState: getModelState,
    downloadModel: downloadModel,
    ensureModel: ensureModel,
    prefetchScript: prefetchScript,
    resetModel: resetModel,
    start: start,
    stop: stop
  };
})(window);
