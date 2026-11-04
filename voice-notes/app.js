/* ==========================================================================
   app.js — вся логика приложения «Заметки»
   --------------------------------------------------------------------------
   • IndexedDB: база voice-notes, хранилище notes (id, text, createdAt, updatedAt)
   • Список заметок, поиск, редактор, тосты
   • Запись: Web Speech API (онлайн) или Vosk WASM (офлайн) — выбор автоматический
   • Автосохранение после 4 секунд тишины
   • Однократное скачивание офлайн-модели с прогрессом
   • Регистрация Service Worker

   ВАЖНО: приложение запускается только через http://localhost или HTTPS.
   При file:// микрофон и Service Worker заблокированы браузером — это не баг
   кода, а требование безопасного контекста (см. экран-подсказку ниже).
   ========================================================================== */

(function () {
  'use strict';

  /* ====================================================== константы ===== */

  var DB_NAME = 'voice-notes';
  var DB_VERSION = 1;
  var STORE = 'notes';

  var SILENCE_MS = 4000;      // 4 секунды тишины → автосохранение
  var EMPTY_TIMEOUT_MS = 12000; // 12 секунд без единого слова → стоп
  var TICK_MS = 250;

  /* ====================================================== среда ======== */

  var env = {
    isFile: location.protocol === 'file:',
    isSecureContext: window.isSecureContext === true,
    hasMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    hasSpeechRecognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    hasVosk: !!(window.VoskEngine && window.VoskEngine.isSupported()),
    hasServiceWorker: 'serviceWorker' in navigator
  };
  env.canRecord = env.isSecureContext && !env.isFile && env.hasMedia;

  /* ====================================================== состояние ===== */

  var state = {
    notes: [],
    query: '',
    screen: null,          // null | 'record' | 'editor'
    editing: null,         // редактируемая заметка (или null для новой)
    insecureDismissed: false,
    modelCached: false,
    modelDownloading: false,
    storageReady: false
  };

  var rec = {
    active: false,
    finalized: false,
    stopping: false,
    seq: 0,
    engine: null,
    session: null,
    finals: [],
    interim: '',
    lastTextAt: 0,
    startedAt: 0,
    ticker: null,
    stopGuard: null,
    ready: false,
    stopReason: null,
    lastError: null,
    pendingFallback: false,
    fallbackTried: false
  };

  /* ====================================================== DOM =========== */

  var el = {};

  function cacheDom() {
    el.app = document.getElementById('app');
    el.netBadge = document.getElementById('net-badge');
    el.netBadgeText = document.getElementById('net-badge-text');
    el.searchInput = document.getElementById('search-input');
    el.searchClear = document.getElementById('search-clear');
    el.newNoteBtn = document.getElementById('new-note-btn');
    el.engineLine = document.getElementById('engine-line');

    el.downloadCard = document.getElementById('download-card');
    el.downloadTitle = document.getElementById('download-title');
    el.downloadPercent = document.getElementById('download-percent');
    el.downloadBar = document.getElementById('download-bar');
    el.downloadHint = document.getElementById('download-hint');

    el.notesList = document.getElementById('notes-list');
    el.emptyState = document.getElementById('empty-state');
    el.emptyTitle = document.getElementById('empty-title');
    el.emptyText = document.getElementById('empty-text');

    el.fab = document.getElementById('fab');

    el.recordScreen = document.getElementById('record-screen');
    el.recordCancel = document.getElementById('record-cancel');
    el.recordStop = document.getElementById('record-stop');
    el.recordStatus = document.getElementById('record-status');
    el.recordEngine = document.getElementById('record-engine');
    el.recordViz = document.getElementById('record-viz');
    el.recordText = document.getElementById('record-text');
    el.recordFinal = document.getElementById('record-final');
    el.recordInterim = document.getElementById('record-interim');
    el.recordPlaceholder = document.getElementById('record-placeholder');
    el.recordHint = document.getElementById('record-hint');

    el.editorScreen = document.getElementById('editor-screen');
    el.editorBack = document.getElementById('editor-back');
    el.editorDelete = document.getElementById('editor-delete');
    el.editorTitle = document.getElementById('editor-title');
    el.editorText = document.getElementById('editor-text');
    el.editorMeta = document.getElementById('editor-meta');
    el.editorSave = document.getElementById('editor-save');

    el.notice = document.getElementById('insecure-notice');
    el.noticeTitle = document.getElementById('insecure-title');
    el.noticeLead = document.getElementById('insecure-lead');
    el.noticeContinue = document.getElementById('notice-continue');

    el.toasts = document.getElementById('toasts');
  }

  /* ====================================================== утилиты ======= */

  function appError(code, message) {
    var error = new Error(message);
    error.code = code;
    return error;
  }

  function pad2(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function formatDate(timestamp) {
    var date = new Date(timestamp);
    var now = new Date();
    var time = pad2(date.getHours()) + ':' + pad2(date.getMinutes());

    if (sameDay(date, now)) return 'Сегодня, ' + time;

    var yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (sameDay(date, yesterday)) return 'Вчера, ' + time;

    var options = { day: 'numeric', month: 'long' };
    if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
    var day = date.toLocaleDateString('ru-RU', options);
    return day + ', ' + time;
  }

  function formatFullDate(timestamp) {
    var date = new Date(timestamp);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric', month: 'long', year: 'numeric'
    }) + ', ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
  }

  function formatMegabytes(bytes) {
    if (!bytes) return '0 МБ';
    return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' МБ';
  }

  function createId() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
    } catch (error) { /* ignore */ }
    return 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function friendlyError(error) {
    if (!error) return 'Что-то пошло не так';
    var map = {
      'mic-denied': 'Нет доступа к микрофону. Разреши его в настройках браузера',
      'mic-missing': 'Микрофон не найден на этом устройстве',
      'mic-busy': 'Микрофон занят другим приложением',
      'insecure': 'Микрофон доступен только по localhost или HTTPS',
      'network': 'Нет связи с сервисом распознавания. Попробуй офлайн-движок',
      'model-missing': 'Офлайн-движок ещё не скачан. Подключи интернет один раз',
      'timeout': 'Движок не успел загрузиться. Попробуй ещё раз',
      'quota': 'В браузере не хватает места',
      'busy': 'Запись уже идёт'
    };
    return map[error.code] || error.message || 'Что-то пошло не так';
  }

  /* ====================================================== тосты ========= */

  var lastToast = { text: '', at: 0 };

  function toast(message, type, duration) {
    if (!el.toasts) return;

    // Не дублируем одинаковые сообщения, если они идут подряд.
    var now = Date.now();
    if (lastToast.text === message && now - lastToast.at < 1200) {
      lastToast.at = now;
      return;
    }
    lastToast = { text: message, at: now };

    var node = document.createElement('div');
    node.className = 'toast' + (type ? ' toast--' + type : '');
    node.setAttribute('role', type === 'error' ? 'alert' : 'status');
    node.textContent = message;
    el.toasts.appendChild(node);

    var timeout = typeof duration === 'number' ? duration : 3200;
    setTimeout(function () {
      node.classList.add('toast--leaving');
      setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 200);
    }, timeout);
  }

  /* ====================================================== IndexedDB ===== */

  var dbPromise = null;

  function openDatabase() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) {
        reject(appError('no-db', 'IndexedDB недоступен'));
        return;
      }

      var request;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        reject(error);
        return;
      }

      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('Не удалось открыть базу')); };
      request.onblocked = function () { reject(new Error('База открыта в другой вкладке')); };
    });

    dbPromise.catch(function () { dbPromise = null; });
    return dbPromise;
  }

  var Notes = {
    all: function () {
      return openDatabase().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE, 'readonly');
          var request = tx.objectStore(STORE).getAll();
          request.onsuccess = function () { resolve(request.result || []); };
          request.onerror = function () { reject(request.error); };
        });
      });
    },

    put: function (note) {
      return openDatabase().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(note);
          tx.oncomplete = function () { resolve(note); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error || new Error('Запись отменена')); };
        });
      });
    },

    remove: function (id) {
      return openDatabase().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(id);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
        });
      });
    }
  };

  function sortNotes() {
    state.notes.sort(function (a, b) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  /* ====================================================== список ======== */

  function renderNotes() {
    var query = state.query.trim().toLowerCase();
    var list = query
      ? state.notes.filter(function (note) {
        return String(note.text || '').toLowerCase().indexOf(query) !== -1;
      })
      : state.notes;

    el.notesList.textContent = '';

    var fragment = document.createDocumentFragment();
    list.forEach(function (note) {
      fragment.appendChild(buildNoteCard(note));
    });
    el.notesList.appendChild(fragment);

    var isEmpty = list.length === 0;
    el.notesList.hidden = isEmpty;
    el.emptyState.hidden = !isEmpty;

    if (isEmpty) {
      if (query) {
        el.emptyTitle.textContent = 'Ничего не найдено';
        el.emptyText.textContent = 'По запросу «' + state.query.trim() + '» заметок нет.';
      } else {
        el.emptyTitle.textContent = 'Пока пусто';
        el.emptyText.textContent = 'Нажми на микрофон и просто говори — текст появится сам, ' +
          'а заметка сохранится после 4 секунд тишины.';
      }
    }
  }

  function buildNoteCard(note) {
    var item = document.createElement('li');
    item.className = 'note';

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'note__btn';
    button.setAttribute('aria-label', 'Открыть заметку: ' + formatDate(note.createdAt));

    var text = document.createElement('p');
    text.className = 'note__text';
    text.textContent = note.text;

    var meta = document.createElement('div');
    meta.className = 'note__meta';

    var date = document.createElement('span');
    date.textContent = formatDate(note.createdAt);
    meta.appendChild(date);

    if (note.updatedAt && note.createdAt && note.updatedAt - note.createdAt > 60000) {
      var dot = document.createElement('span');
      dot.className = 'note__dot';
      dot.setAttribute('aria-hidden', 'true');
      meta.appendChild(dot);

      var edited = document.createElement('span');
      edited.textContent = 'изменено';
      meta.appendChild(edited);
    }

    button.appendChild(text);
    button.appendChild(meta);
    button.addEventListener('click', function () { openEditor(note); });

    item.appendChild(button);
    return item;
  }

  /* ====================================================== сохранение ==== */

  function saveNote(rawText, options) {
    options = options || {};
    var text = options.clean === false ? String(rawText || '').trim() : cleanText(rawText);
    if (!text) return Promise.resolve(null);

    var now = Date.now();
    var note = {
      id: createId(),
      text: text,
      createdAt: now,
      updatedAt: now
    };

    return Notes.put(note).then(function () {
      state.notes.push(note);
      sortNotes();

      if (state.query) {
        // Показываем сохранённую заметку, даже если был активен поиск.
        state.query = '';
        el.searchInput.value = '';
        el.searchClear.hidden = true;
      }

      renderNotes();
      if (!options.silent) toast('Заметка сохранена', 'ok');
      return note;
    }).catch(function (error) {
      console.error('[notes] save failed', error);
      var hint = error && (error.name === 'QuotaExceededError' || error.code === 22)
        ? 'В браузере не хватает места для новой заметки'
        : 'Не удалось сохранить заметку';
      toast(hint, 'error', 5000);
      return null;
    });
  }

  /* ====================================================== чистка речи === */

  var FILLER_RE = /(^|\s)(?:эм+|ээ+|ммм+|ну+|короче|типа|как\s+бы|это\s+самое)(?=\s|[,.!?;:…]|$)/gi;
  var PUNCT_RE = /[.,!?;:…"«»()]/g;

  function normalizeWord(word) {
    return word.toLowerCase().replace(PUNCT_RE, '');
  }

  function cleanText(raw) {
    var text = String(raw || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text) return '';

    // Слова-паразиты: прогоняем дважды, чтобы вычистить «ну короче типа».
    text = text.replace(FILLER_RE, ' ');
    text = text.replace(FILLER_RE, ' ');
    text = text.replace(/\s+/g, ' ').trim();

    // Убрали слово-паразита — убираем и осиротевшую запятую в начале.
    text = text.replace(/^[\s,.;:!?…—–-]+/, '');

    // Пробелы перед знаками препинания и после них.
    text = text.replace(/\s+([,.!?;:…])/g, '$1');
    text = text.replace(/([,;:!?])(?=[А-Яа-яЁёA-Za-z])/g, '$1 ');
    text = text.replace(/([,;:])\s*([.!?…])/g, '$2');
    text = text.replace(/([,;:])\s*(?=[,.;:!?…])/g, '');
    text = text.replace(/([.!?…])\1+/g, '$1');

    // Склеиваем повторы слов подряд: «это это будет» → «это будет».
    var words = text.split(' ');
    var result = [];
    for (var i = 0; i < words.length; i++) {
      var word = words[i];
      var prev = result.length ? result[result.length - 1] : '';
      if (prev && normalizeWord(prev) === normalizeWord(word) && normalizeWord(word)) continue;
      result.push(word);
    }
    text = result.join(' ').replace(/\s+/g, ' ').trim();

    if (!text) return '';

    // Заглавная буква в начале и после точки.
    text = text.replace(/^([«"']?)([а-яёa-z])/, function (match, quote, letter) {
      return quote + letter.toUpperCase();
    });
    text = text.replace(/([.!?…]\s+)([а-яёa-z])/g, function (match, prefix, letter) {
      return prefix + letter.toUpperCase();
    });

    // Точка в конце.
    if (!/[.!?…]$/.test(text)) text += '.';

    return text;
  }

  /* ====================================================== редактор ====== */

  function openEditor(note) {
    state.editing = note || null;
    el.editorText.value = note ? note.text : '';
    el.editorTitle.textContent = note ? 'Заметка' : 'Новая заметка';
    el.editorMeta.textContent = note ? 'Создано ' + formatFullDate(note.createdAt) : '';
    el.editorDelete.hidden = !note;

    showScreen('editor');
    setTimeout(function () { el.editorText.focus(); }, 60);
  }

  function closeEditor() {
    hideScreens();
    state.editing = null;
    el.editorText.value = '';
    el.fab.focus();
  }

  function saveEditor() {
    var value = el.editorText.value.replace(/[ \t]+$/gm, '').replace(/^\n+/, '').trim();
    var editing = state.editing;

    if (!value) {
      if (editing) {
        return Notes.remove(editing.id).then(function () {
          state.notes = state.notes.filter(function (note) { return note.id !== editing.id; });
          renderNotes();
          closeEditor();
          toast('Пустая заметка удалена');
        }).catch(function () {
          toast('Не удалось удалить заметку', 'error');
        });
      }
      closeEditor();
      return Promise.resolve();
    }

    if (!editing) {
      return saveNote(value, { clean: false }).then(function (note) {
        if (note) closeEditor();
      });
    }

    var updated = {
      id: editing.id,
      text: value,
      createdAt: editing.createdAt,
      updatedAt: Date.now()
    };

    return Notes.put(updated).then(function () {
      state.notes = state.notes.map(function (note) {
        return note.id === updated.id ? updated : note;
      });
      sortNotes();
      renderNotes();
      closeEditor();
      toast('Изменения сохранены', 'ok');
    }).catch(function (error) {
      console.error('[notes] update failed', error);
      toast('Не удалось сохранить изменения', 'error');
    });
  }

  function onEditorBack() {
    var editing = state.editing;
    var value = el.editorText.value.trim();
    var changed = editing ? value !== editing.text : value.length > 0;

    if (changed && window.confirm(editing ? 'Сохранить изменения?' : 'Сохранить новую заметку?')) {
      saveEditor();
      return;
    }
    closeEditor();
  }

  function deleteEditingNote() {
    var editing = state.editing;
    if (!editing) return;
    if (!window.confirm('Удалить эту заметку? Действие нельзя отменить.')) return;

    Notes.remove(editing.id).then(function () {
      state.notes = state.notes.filter(function (note) { return note.id !== editing.id; });
      renderNotes();
      closeEditor();
      toast('Заметка удалена');
    }).catch(function () {
      toast('Не удалось удалить заметку', 'error');
    });
  }

  /* ====================================================== экраны ======== */

  function showScreen(name) {
    state.screen = name;
    document.body.classList.add('is-locked');
    el.toasts.classList.add('toasts--on-screen');
    el.recordScreen.hidden = name !== 'record';
    el.editorScreen.hidden = name !== 'editor';

  }

  function hideScreens() {
    state.screen = null;
    el.recordScreen.hidden = true;
    el.editorScreen.hidden = true;
    document.body.classList.remove('is-locked');
    el.toasts.classList.remove('toasts--on-screen');
  }

  function setRecordStatus(text) {
    if (el.recordStatus.textContent !== text) el.recordStatus.textContent = text;
  }

  function setRecordHint(text, warn) {
    if (el.recordHint.textContent !== text) el.recordHint.textContent = text;
    el.recordHint.dataset.warn = warn ? 'true' : 'false';
  }

  function setRecordEngine(engine) {
    el.recordEngine.textContent = engine === 'webspeech' ? 'Web Speech' : 'Vosk офлайн';
  }

  function renderLiveText() {
    var finalText = rec.finals.join(' ');
    var interim = rec.interim;

    el.recordFinal.textContent = finalText ? finalText + ' ' : '';
    el.recordInterim.textContent = interim;
    el.recordPlaceholder.hidden = !!(finalText || interim);

    // Держим свежий текст в поле зрения.
    el.recordText.scrollTop = el.recordText.scrollHeight;
  }

  function resetLiveText() {
    el.recordFinal.textContent = '';
    el.recordInterim.textContent = '';
    el.recordPlaceholder.hidden = false;
  }

  /* ====================================================== движки ======== */

  function pickEngine() {
    if (navigator.onLine && env.hasSpeechRecognition) return 'webspeech';
    return 'vosk';
  }

  function createHandlers() {
    var id = ++rec.seq;

    function alive() {
      return rec.active && !rec.finalized && rec.seq === id;
    }

    return {
      onStatus: function (message) {
        if (!alive() || !message) return;

        if (message === 'Слушаю…') {
          if (!rec.ready) {
            rec.ready = true;
            rec.startedAt = Date.now();
            rec.lastTextAt = Date.now();
          }
          setRecordStatus('Слушаю…');
        } else {
          // Микрофон, распаковка движка и т.п. — честно показываем, что происходит.
          setRecordStatus(message);
          setRecordHint(message);
        }
      },

      onReady: function () {
        if (!alive()) return;
        if (!rec.ready) {
          rec.ready = true;
          rec.startedAt = Date.now();
          rec.lastTextAt = Date.now();
        }
        setRecordStatus('Слушаю…');
        setRecordHint('Говори — сохранится само');
      },

      onPartial: function (text) {
        if (!alive()) return;
        rec.interim = text || '';
        if (rec.interim.trim()) touchSpeech();
        renderLiveText();
      },

      onFinal: function (text) {
        if (!alive()) return;
        var clean = String(text || '').trim();
        if (clean) {
          rec.finals.push(clean);
          rec.interim = '';
          touchSpeech();
          renderLiveText();
        } else {
          rec.interim = '';
          renderLiveText();
        }
      },

      onError: function (error) {
        if (!alive()) return;
        rec.lastError = error;
        // Если онлайн-движок потерял сеть, а офлайн-модель уже скачана —
        // переключимся на Vosk, не теряя наговоренный текст.
        if (error && error.code === 'network' && !rec.fallbackTried &&
            !rec.stopping && env.hasVosk && state.modelCached) {
          rec.pendingFallback = true;
        }
      },

      onEnd: function (reason) {
        if (!alive()) return;
        handleSessionEnd(reason);
      }
    };
  }

  function touchSpeech() {
    rec.lastTextAt = Date.now();
  }

  /* ------------------------------------------------------- Web Speech --- */

  function WebSpeechSession(handlers) {
    this.handlers = handlers || {};
    this.ended = false;
    this.manualStop = false;
    this.isListening = false;
    this.emptyRestarts = 0;
    this.restartTimer = null;
    this.recognition = null;
    this.fatal = null;
  }

  WebSpeechSession.prototype.start = function () {
    var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      throw appError('no-speech-api', 'Web Speech API недоступен в этом браузере');
    }

    var recognition = new Recognition();
    this.recognition = recognition;
    recognition.lang = 'ru-RU';
    recognition.continuous = true;      // на десктопе держит сессию, на Android — нет
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    var self = this;

    recognition.onstart = function () {
      self.isListening = true;
      self.emitStatus('Слушаю…');
    };

    recognition.onresult = function (event) {
      self.handleResult(event);
    };

    recognition.onerror = function (event) {
      self.handleError(event);
    };

    recognition.onend = function () {
      self.handleEnd();
    };

    this.begin();
  };

  WebSpeechSession.prototype.begin = function () {
    if (this.ended || this.manualStop || !this.recognition) return;

    try {
      this.recognition.start();
      this.isListening = true;
    } catch (error) {
      if (error && error.name === 'InvalidStateError') {
        // Экземпляр уже слушает — это не ошибка.
        this.isListening = true;
        return;
      }
      this.fatal = appError('speech-start', 'Не удалось запустить распознавание речи');
      this.handlers.onError && this.handlers.onError(this.fatal);
      this.finish('error');
    }
  };

  WebSpeechSession.prototype.handleResult = function (event) {
    if (this.ended) return;

    var interim = '';

    for (var i = event.resultIndex; i < event.results.length; i++) {
      var result = event.results[i];
      var alternative = result && result[0];
      // ВАЖНО: у результата поле transcript, а не text.
      var transcript = alternative && alternative.transcript ? alternative.transcript : '';

      if (result.isFinal) {
        var text = transcript.trim();
        if (text) {
          this.emptyRestarts = 0;
          this.handlers.onFinal && this.handlers.onFinal(text);
        }
      } else {
        interim += transcript;
      }
    }

    this.handlers.onPartial && this.handlers.onPartial(interim.trim());
  };

  WebSpeechSession.prototype.handleError = function (event) {
    var code = (event && event.error) || 'unknown';

    // no-speech / aborted: это нормальные концы сессии, их обработает onend.
    if (code === 'no-speech' || code === 'aborted') return;

    if (code === 'network') {
      this.fail('network', 'Нет связи с сервисом распознавания');
      return;
    }
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      this.fail('mic-denied', 'Нет доступа к микрофону или сервису распознавания');
      return;
    }
    if (code === 'audio-capture') {
      this.fail('mic-missing', 'Микрофон не найден');
      return;
    }
    if (code === 'language-not-supported') {
      this.fail('language', 'Русский язык не поддерживается распознаванием');
      return;
    }
    this.fail(code, 'Распознавание прервалось: ' + code);
  };

  WebSpeechSession.prototype.fail = function (code, message) {
    if (this.ended) return;

    this.fatal = appError(code, message);
    this.manualStop = true;
    clearTimeout(this.restartTimer);

    // НЕ вызываем stop() на неактивном экземпляре: на Android Chrome это
    // синхронно дёргает onend и ломает логику перезапуска.
    if (this.recognition && this.isListening) {
      try { this.recognition.stop(); } catch (error) { /* ignore */ }
    }

    this.handlers.onError && this.handlers.onError(this.fatal);
    this.finish('error');
  };

  WebSpeechSession.prototype.handleEnd = function () {
    this.isListening = false;
    if (this.ended) return;

    if (this.manualStop) {
      this.finish(this.fatal ? 'error' : 'stopped');
      return;
    }

    // Android Chrome рвёт сессию после каждой фразы: перезапускаемся,
    // но не больше 3 раз подряд без нового текста.
    if (this.emptyRestarts >= 3) {
      this.manualStop = true;
      this.finish('restart-limit');
      return;
    }

    this.emptyRestarts += 1;
    clearTimeout(this.restartTimer);

    var self = this;
    this.restartTimer = setTimeout(function () {
      self.begin();
    }, 300);
  };

  WebSpeechSession.prototype.stop = function () {
    if (this.ended) return;

    this.manualStop = true;
    clearTimeout(this.restartTimer);

    if (this.recognition && this.isListening) {
      try { this.recognition.stop(); } catch (error) { /* ignore */ }
      // завершение придёт в onend → finish()
    } else {
      this.finish('stopped');
    }
  };

  WebSpeechSession.prototype.abort = function () {
    if (this.ended) return;
    this.manualStop = true;
    clearTimeout(this.restartTimer);
    if (this.recognition && this.isListening) {
      try { this.recognition.abort(); } catch (error) { /* ignore */ }
    }
    this.finish('stopped');
  };

  WebSpeechSession.prototype.finish = function (reason) {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.restartTimer);
    this.handlers.onEnd && this.handlers.onEnd(reason || 'stopped');
  };

  WebSpeechSession.prototype.emitStatus = function (text) {
    this.handlers.onStatus && this.handlers.onStatus(text);
  };

  /* ------------------------------------------------------------- Vosk --- */

  function createVoskSession(handlers) {
    return {
      kind: 'vosk',
      start: function () {
        return window.VoskEngine.start({
          onStatus: function (message) { handlers.onStatus && handlers.onStatus(message); },
          onReady: function () { handlers.onReady && handlers.onReady(); },
          onPartial: function (text) { handlers.onPartial && handlers.onPartial(text); },
          onFinal: function (text) { handlers.onFinal && handlers.onFinal(text); },
          onError: function (error) { handlers.onError && handlers.onError(error); },
          onEnd: function () { handlers.onEnd && handlers.onEnd('stopped'); }
        });
      },
      stop: function () { return window.VoskEngine.stop(); },
      abort: function () { return window.VoskEngine.stop(); }
    };
  }

  /* ====================================================== запись ======== */

  function startRecording(options) {
    options = options || {};

    if (rec.active) return Promise.resolve();

    if (!env.canRecord) {
      if (env.isFile || !env.isSecureContext) {
        showInsecureNotice();
      } else {
        toast('Браузер не даёт доступ к микрофону', 'error');
      }
      return Promise.resolve();
    }

    var engine = options.engine || pickEngine();

    rec.active = true;
    rec.finalized = false;
    rec.stopping = false;
    rec.stopReason = null;
    rec.lastError = null;
    rec.pendingFallback = false;
    rec.fallbackTried = false;
    rec.ready = false;
    rec.engine = engine;
    rec.finals = options.keepFinals || [];
    rec.interim = '';
    rec.startedAt = Date.now();
    rec.lastTextAt = Date.now();

    showScreen('record');
    setRecordEngine(engine);
    resetLiveText();
    renderLiveText();
    setRecordStatus(engine === 'webspeech' ? 'Включаю микрофон…' : 'Готовлю офлайн-движок…');
    setRecordHint('Говори — сохранится само');
    el.recordViz.dataset.state = 'live';

    var handlers = createHandlers();
    var session = engine === 'webspeech'
      ? new WebSpeechSession(handlers)
      : createVoskSession(handlers);

    rec.session = session;

    clearInterval(rec.ticker);
    rec.ticker = setInterval(tick, TICK_MS);

    return Promise.resolve()
      .then(function () { return session.start(); })
      .then(function () {
        if (!rec.active || rec.finalized) return;
        setRecordStatus('Слушаю…');
      })
      .catch(function (error) {
        console.error('[record] start failed', error);
        if (!rec.active) return;

        rec.lastError = error;
        rec.stopping = true;
        rec.stopReason = 'error';
        clearInterval(rec.ticker);
        finalizeRecording();
      });
  }

  function tick() {
    if (!rec.active || rec.finalized || rec.stopping || !rec.ready) return;

    var now = Date.now();
    var hasText = rec.finals.length > 0 || rec.interim.trim().length > 0;
    var silence = now - (rec.lastTextAt || rec.startedAt);

    if (hasText) {
      var left = Math.ceil((SILENCE_MS - silence) / 1000);
      if (left > 0) {
        setRecordHint('Автосохранение через ' + left + ' с тишины');
      } else {
        setRecordHint('Сохраняю…');
      }
      if (silence >= SILENCE_MS) stopRecording('auto');
      return;
    }

    if (now - rec.startedAt >= EMPTY_TIMEOUT_MS) {
      stopRecording('empty');
      return;
    }

    if (silence >= 7000) {
      setRecordHint(rec.engine === 'vosk'
        ? 'Не слышу речь. Проверь микрофон'
        : 'Не слышу речь…', true);
    } else {
      setRecordHint('Говори — сохранится само');
    }
  }

  function stopRecording(reason) {
    if (!rec.active || rec.finalized) return Promise.resolve();

    if (!rec.stopping) {
      rec.stopping = true;
      rec.stopReason = reason || 'manual';
      clearInterval(rec.ticker);
      setRecordStatus(rec.stopReason === 'cancel' ? 'Отменяю…' : 'Сохраняю…');
      setRecordHint(rec.stopReason === 'cancel' ? 'Запись отменена' : 'Секунду…');
    }

    clearTimeout(rec.stopGuard);
    rec.stopGuard = setTimeout(function () {
      if (rec.active && !rec.finalized) {
        console.warn('[record] session stop timeout — сохраняем принудительно');
        finalizeRecording();
      }
    }, 3500);

    var session = rec.session;
    if (!session) {
      finalizeRecording();
      return Promise.resolve();
    }

    return Promise.resolve()
      .then(function () { return session.stop(); })
      .catch(function (error) {
        console.error('[record] stop failed', error);
        finalizeRecording();
      });
  }

  function handleSessionEnd(reason) {
    if (!rec.active || rec.finalized) return;

    if (rec.pendingFallback && !rec.fallbackTried && !rec.stopping && env.hasVosk) {
      restartWithVosk();
      return;
    }

    if (!rec.stopping) {
      // Движок завершил сессию сам (например, 3 пустых перезапуска на Android).
      rec.stopping = true;
      rec.stopReason = reason === 'restart-limit' ? 'engine' : 'manual';
      clearInterval(rec.ticker);
      setRecordStatus('Сохраняю…');
    }

    finalizeRecording();
  }

  function restartWithVosk() {
    rec.fallbackTried = true;
    rec.pendingFallback = false;
    rec.session = null;
    rec.engine = 'vosk';
    rec.stopping = false;
    rec.stopReason = null;
    // Пока Vosk поднимается, таймеры тишины не должны сработать.
    rec.ready = false;
    rec.startedAt = Date.now();
    rec.lastTextAt = Date.now();
    rec.lastError = null; // о сбое уже сказали тостом, не путаем им итог записи

    setRecordEngine('vosk');
    setRecordStatus('Переключаюсь на офлайн-движок…');
    setRecordHint('Интернет пропал — работаю без сети');
    toast('Интернет пропал — переключаюсь на офлайн-движок', 'info', 4200);

    var handlers = createHandlers();
    var session = createVoskSession(handlers);
    rec.session = session;

    Promise.resolve()
      .then(function () { return session.start(); })
      .then(function () {
        if (!rec.active || rec.finalized) return;
        setRecordStatus('Слушаю…');
      })
      .catch(function (error) {
        if (!rec.active || rec.finalized) return;
        rec.lastError = error;
        rec.stopping = true;
        rec.stopReason = 'error';
        finalizeRecording();
      });
  }

  function finalizeRecording() {
    if (rec.finalized) return;

    rec.finalized = true;
    clearInterval(rec.ticker);
    clearTimeout(rec.stopGuard);

    var cancelled = rec.stopReason === 'cancel';
    var hadError = rec.lastError;
    var rawText = rec.finals.join(' ') + ' ' + rec.interim;
    var text = cleanText(rawText);

    rec.active = false;
    rec.stopping = false;
    rec.session = null;
    rec.interim = '';
    rec.finals = [];

    el.recordViz.dataset.state = 'paused';
    hideScreens();

    if (cancelled) {
      toast('Запись отменена');
      return;
    }

    if (!text) {
      var message = hadError
        ? friendlyError(hadError)
        : 'Ничего не расслышал. Попробуй ещё раз или напиши вручную';
      toast(message, 'error', 4800);
      return;
    }

    saveNote(text).then(function (note) {
      if (note) el.fab.focus();
    });
  }

  function cancelRecording() {
    if (!rec.active) return;
    if (!rec.finals.length && !rec.interim.trim()) {
      // Ничего не сказано — отменяем без лишних вопросов.
      rec.stopReason = 'cancel';
      stopRecording('cancel');
      return;
    }
    if (window.confirm('Отменить запись? Текст не сохранится.')) {
      stopRecording('cancel');
    }
  }

  /* ====================================================== модель ======== */

  var progressState = { lastPercent: null };

  function showDownloadCard() {
    el.downloadCard.hidden = false;
    el.downloadCard.classList.remove('download--error');
  }

  function updateDownloadProgress(info) {
    showDownloadCard();
    el.downloadTitle.textContent = 'Качаем голосовой движок…';
    el.downloadHint.textContent = 'Один раз, дальше всё работает без интернета.';

    if (info.percent === null || typeof info.percent === 'undefined') {
      el.downloadPercent.textContent = formatMegabytes(info.loaded) +
        (info.total ? ' / ' + formatMegabytes(info.total) : '');
      el.downloadBar.style.width = '12%';
    } else {
      el.downloadPercent.textContent = info.percent + '%';
      el.downloadBar.style.width = info.percent + '%';
      progressState.lastPercent = info.percent;
    }

    if (info.attempt > 1) {
      el.downloadHint.textContent = 'Попытка ' + info.attempt + ' из 3…';
    }
  }

  function showDownloadError(error) {
    showDownloadCard();
    el.downloadCard.classList.add('download--error');
    el.downloadTitle.textContent = 'Движок не скачался';
    el.downloadPercent.textContent = '';
    el.downloadBar.style.width = '0%';

    var text = error && error.code === 'network'
      ? 'Нет интернета. Подключись к сети и перезагрузи приложение.'
      : (error && error.message
        ? error.message
        : 'Неизвестная ошибка загрузки. Перезагрузи приложение, чтобы попробовать снова.');

    el.downloadHint.textContent = text + ' Онлайн-распознавание при этом работает.';
    console.warn('[model] download failed', error);
  }

  function hideDownloadCard() {
    el.downloadCard.hidden = true;
    el.downloadCard.classList.remove('download--error');
  }

  function requestPersistence() {
    if (!navigator.storage || typeof navigator.storage.persist !== 'function') return;

    Promise.resolve()
      .then(function () {
        return typeof navigator.storage.persisted === 'function'
          ? navigator.storage.persisted()
          : false;
      })
      .then(function (already) {
        if (already) return true;
        return navigator.storage.persist();
      })
      .catch(function (error) {
        console.warn('[storage] persist failed', error);
      });
  }

  function bootstrapEngine() {
    // На file:// и по обычному http кэш и микрофон всё равно недоступны —
    // не тратим трафик и не пугаем прогресс-баром.
    if (!env.hasVosk || env.isFile || !env.isSecureContext) {
      updateEngineLine();
      return;
    }

    window.VoskEngine.getModelState().then(function (modelState) {
      state.modelCached = !!modelState.cached;
      updateEngineLine();

      if (state.modelCached) {
        // Прогреваем vosk.js в кэш, чтобы офлайн-движок точно запустился без сети.
        window.VoskEngine.prefetchScript();
        return;
      }

      if (!navigator.onLine) {
        showDownloadCard();
        el.downloadTitle.textContent = 'Офлайн-движок ещё не скачан';
        el.downloadPercent.textContent = '';
        el.downloadBar.style.width = '0%';
        el.downloadHint.textContent = 'Подключи интернет один раз — я скачаю движок в фоне, ' +
          'потом всё будет работать без сети.';
        return;
      }

      downloadModel();
    });
  }

  function downloadModel() {
    if (state.modelDownloading || state.modelCached || !env.hasVosk) return;
    if (!navigator.onLine) return;

    state.modelDownloading = true;
    showDownloadCard();
    el.downloadTitle.textContent = 'Качаем голосовой движок…';
    el.downloadPercent.textContent = '0%';
    el.downloadBar.style.width = '0%';

    window.VoskEngine.downloadModel(updateDownloadProgress).then(function (modelState) {
      state.modelDownloading = false;
      state.modelCached = !!modelState.cached;

      if (state.modelCached) {
        hideDownloadCard();
        window.VoskEngine.prefetchScript();
        toast('Офлайн-движок готов — можно без интернета', 'ok', 3600);
      }
      updateEngineLine();
    }).catch(function (error) {
      state.modelDownloading = false;
      showDownloadError(error);
      updateEngineLine();
    });
  }

  function updateEngineLine() {
    if (!el.engineLine) return;

    if (env.isFile || !env.isSecureContext) {
      el.engineLine.textContent = 'Запись недоступна: открой через localhost или HTTPS';
      return;
    }

    if (navigator.onLine && env.hasSpeechRecognition) {
      el.engineLine.textContent = 'Движок: Web Speech · онлайн (нужен интернет)';
      return;
    }

    if (!env.hasVosk) {
      el.engineLine.textContent = 'Офлайн-движок не поддерживается этим браузером';
      return;
    }

    el.engineLine.textContent = state.modelCached
      ? 'Движок: Vosk · офлайн, работает без сети'
      : 'Движок: Vosk · офлайн, модель ещё не скачана';
  }

  /* ====================================================== сеть ========== */

  function updateNetworkUi() {
    var online = navigator.onLine;

    el.netBadge.dataset.state = online ? 'online' : 'offline';
    el.netBadgeText.textContent = online ? 'онлайн' : 'офлайн';
    el.netBadge.setAttribute('title', online
      ? 'Есть сеть: распознавание через Web Speech'
      : 'Нет сети: распознавание через Vosk, всё работает локально');

    el.fab.classList.toggle('fab--armed', env.canRecord);
    updateEngineLine();
  }

  /* ====================================================== SW ============ */

  function registerServiceWorker() {
    if (!env.hasServiceWorker || env.isFile) return;

    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .catch(function (error) {
        console.warn('[sw] регистрация не удалась', error);
      });
  }

  /* ====================================================== безопасность == */

  function showInsecureNotice() {
    if (!el.notice) return;

    if (!env.isFile && !env.isSecureContext) {
      el.noticeTitle.textContent = 'Нужен localhost или HTTPS';
      el.noticeLead.textContent = 'Ты открыл приложение по обычному http на внешнем адресе. ' +
        'Браузер разрешает микрофон и Service Worker только на localhost или по HTTPS.';
    }

    el.notice.hidden = false;
    document.body.classList.add('is-locked');
    el.noticeContinue.focus();
  }

  function hideInsecureNotice() {
    el.notice.hidden = true;
    if (state.screen) return;
    document.body.classList.remove('is-locked');
  }

  /* ====================================================== события ======= */

  function bindEvents() {
    el.fab.addEventListener('click', function () {
      if (rec.active) {
        el.recordScreen.hidden = false;
        return;
      }
      startRecording();
    });

    el.newNoteBtn.addEventListener('click', function () { openEditor(null); });

    var searchTimer = null;
    el.searchInput.addEventListener('input', function () {
      var value = el.searchInput.value;
      el.searchClear.hidden = !value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.query = value;
        renderNotes();
      }, 120);
    });

    el.searchClear.addEventListener('click', function () {
      el.searchInput.value = '';
      state.query = '';
      el.searchClear.hidden = true;
      renderNotes();
      el.searchInput.focus();
    });

    el.recordStop.addEventListener('click', function () {
      stopRecording(rec.finals.length || rec.interim.trim() ? 'manual' : 'empty');
    });

    el.recordCancel.addEventListener('click', cancelRecording);

    el.editorSave.addEventListener('click', saveEditor);
    el.editorBack.addEventListener('click', onEditorBack);
    el.editorDelete.addEventListener('click', deleteEditingNote);

    el.noticeContinue.addEventListener('click', function () {
      state.insecureDismissed = true;
      hideInsecureNotice();
      toast('Можно писать заметки вручную: кнопка с карандашом', 'info', 4200);
    });

    window.addEventListener('online', function () {
      updateNetworkUi();
      // Появилась сеть — дозагружаем модель, если её ещё нет.
      if (!state.modelCached) downloadModel();
    });

    window.addEventListener('offline', updateNetworkUi);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') updateNetworkUi();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;

      if (!el.notice.hidden) {
        state.insecureDismissed = true;
        hideInsecureNotice();
        return;
      }
      if (state.screen === 'record') { cancelRecording(); return; }
      if (state.screen === 'editor') { onEditorBack(); }
    });

    window.addEventListener('beforeunload', function (event) {
      if (!rec.active) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  /* ====================================================== старт ========= */

  function loadNotes() {
    return Notes.all().then(function (notes) {
      state.notes = (notes || []).filter(function (note) {
        return note && typeof note.text === 'string';
      });
      sortNotes();
      state.storageReady = true;
      renderNotes();
    }).catch(function (error) {
      console.error('[db] load failed', error);
      state.storageReady = false;
      renderNotes();
      toast('Хранилище недоступно — заметки не сохранятся', 'error', 6000);
    });
  }

  function init() {
    cacheDom();
    bindEvents();
    updateNetworkUi();
    renderNotes();

    if (env.isFile || !env.isSecureContext) {
      showInsecureNotice();
    }

    requestPersistence();
    loadNotes();
    registerServiceWorker();
    bootstrapEngine();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
