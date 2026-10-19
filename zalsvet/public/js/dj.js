const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  ctx: null,
  graph: null,
  sound: false,
  automix: false,
  order: false,
  quantize: true,
  autogain: true,
  monitor: false,
  learn: false,
  learnTarget: null,
  recording: null,
  chunks: [],
  midiMap: JSON.parse(localStorage.getItem('pe-dj-midi') || '{}'),
  setlists: JSON.parse(localStorage.getItem('pe-dj-sets') || '[]'),
  setId: localStorage.getItem('pe-dj-set') || 'all',
  orders: JSON.parse(localStorage.getItem('pe-dj-orders') || '[]'),
  history: JSON.parse(localStorage.getItem('pe-dj-history') || '[]'),
  tracks: [],
  selected: null,
  focus: 'A',
  libTab: 'library',
  fxTab: 'master',
  query: '',
  tour: 0,
  cross: 0.5,
  hall: 0.85,
  cueVol: 0.8,
  blend: 0,
  fx: {},
  ranges: { A: 0.16, B: 0.16 }
};

const decks = {
  A: blankDeck('A'),
  B: blankDeck('B')
};

const bus = ('BroadcastChannel' in window) ? new BroadcastChannel('zalsvet-dj') : null;
let toastTimer = 0;
let raf = 0;

function blankDeck(id) {
  return {
    id,
    buffer: null,
    trackId: null,
    title: '',
    duration: 0,
    bpm: 0,
    peaks: [],
    offset: 0,
    startedAt: 0,
    playing: false,
    stopping: false,
    rate: 1,
    baseRate: 1,
    cuePoint: 0,
    cueHold: false,
    cues: Array(8).fill(null),
    loop: { on: false, start: 0, end: 0 },
    fader: 0.8,
    knobs: { high: 0.5, mid: 0.5, low: 0.5, filter: 0.5 },
    kill: { high: false, mid: false, low: false },
    echo: false,
    hall: false,
    cue: false,
    mixArmed: false,
    heard: false,
    nodes: null,
    source: null
  };
}

function toast(text) {
  const node = $('#toast');
  node.textContent = text;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 2600);
}

function fmt(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function otherId(id) { return id === 'A' ? 'B' : 'A'; }

function ensureCtx() {
  if (state.ctx) return state.ctx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  state.ctx = new Ctx();
  buildGraph();
  return state.ctx;
}

async function unlock() {
  const ctx = ensureCtx();
  if (ctx.state === 'suspended') await ctx.resume();
  state.sound = ctx.state === 'running';
  $('#soundBtn').textContent = state.sound ? 'Звук включён' : 'Включить звук';
  $('#soundBtn').classList.toggle('on', state.sound);
}

function buildGraph() {
  const ctx = state.ctx;
  const sum = ctx.createGain();
  const cueBus = ctx.createGain();
  const hallVol = ctx.createGain();
  const cueToOut = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  const masterAnalyser = ctx.createAnalyser();
  masterAnalyser.fftSize = 256;
  const streamDest = ctx.createMediaStreamDestination();
  const echoDelay = ctx.createDelay(1.2);
  echoDelay.delayTime.value = 0.37;
  const echoFb = ctx.createGain();
  echoFb.gain.value = 0.38;
  echoDelay.connect(echoFb);
  echoFb.connect(echoDelay);
  echoDelay.connect(sum);
  const hall = makeHall(ctx);
  const hallGain = ctx.createGain();
  hallGain.gain.value = 0.7;
  hall.connect(hallGain);
  hallGain.connect(sum);
  sum.connect(comp);
  comp.connect(masterAnalyser);
  comp.connect(hallVol);
  hallVol.connect(ctx.destination);
  hallVol.connect(streamDest);
  state.graph = { sum, hallVol, cueToOut, comp, masterAnalyser, streamDest, echoDelay };
  cueBus.connect(cueToOut);
  cueToOut.connect(ctx.destination);
  ['A', 'B'].forEach((id) => {
    const deck = decks[id];
    const trim = ctx.createGain();
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 140;
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1000;
    mid.Q.value = 0.8;
    const high = ctx.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = 6800;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 18000;
    const fader = ctx.createGain();
    const xf = ctx.createGain();
    const cue = ctx.createGain();
    const echoSend = ctx.createGain();
    const hallSend = ctx.createGain();
    const meter = ctx.createAnalyser();
    meter.fftSize = 256;
    trim.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(filter);
    filter.connect(fader);
    fader.connect(meter);
    fader.connect(xf);
    xf.connect(sum);
    filter.connect(cue);
    cue.connect(cueBus);
    filter.connect(echoSend);
    echoSend.connect(echoDelay);
    filter.connect(hallSend);
    hallSend.connect(hall);
    cue.gain.value = 0;
    echoSend.gain.value = 0;
    hallSend.gain.value = 0;
    deck.nodes = { trim, low, mid, high, filter, fader, xf, cue, echoSend, hallSend, meter };
    applyDeckMix(deck);
  });
  state.fx = createEffects(sum, comp);
  updateOutput();
}

function makeHall(ctx) {
  const len = Math.floor(ctx.sampleRate * 1.5);
  const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
  }
  const conv = ctx.createConvolver();
  conv.buffer = impulse;
  return conv;
}

function createEffects(sum, dest) {
  const ctx = state.ctx;
  const fx = {};
  fx.echo = { on: false, delay: ctx.createDelay(1), fb: ctx.createGain(), wet: ctx.createGain() };
  fx.echo.delay.delayTime.value = 0.28;
  fx.echo.fb.gain.value = 0.42;
  fx.echo.wet.gain.value = 0;
  sum.connect(fx.echo.delay);
  fx.echo.delay.connect(fx.echo.fb);
  fx.echo.fb.connect(fx.echo.delay);
  fx.echo.delay.connect(fx.echo.wet);
  fx.echo.wet.connect(dest);
  fx.stutter = { on: false, gain: ctx.createGain(), timer: 0 };
  fx.tunnel = { on: false, filter: ctx.createBiquadFilter(), timer: 0 };
  fx.tunnel.filter.type = 'bandpass';
  fx.tunnel.filter.Q.value = 6;
  fx.tunnel.filter.frequency.value = 800;
  fx.freeze = { on: false, delay: ctx.createDelay(1), fb: ctx.createGain(), inn: ctx.createGain() };
  fx.freeze.delay.delayTime.value = 0.35;
  fx.freeze.fb.gain.value = 0.2;
  fx.freeze.inn.gain.value = 0;
  sum.connect(fx.freeze.inn);
  fx.freeze.inn.connect(fx.freeze.delay);
  fx.freeze.delay.connect(fx.freeze.fb);
  fx.freeze.fb.connect(fx.freeze.delay);
  fx.freeze.delay.connect(dest);
  fx.radio = { on: false, filter: ctx.createBiquadFilter(), gain: ctx.createGain() };
  fx.radio.filter.type = 'bandpass';
  fx.radio.filter.frequency.value = 1600;
  fx.radio.filter.Q.value = 5;
  fx.radio.gain.gain.value = 0;
  sum.connect(fx.radio.filter);
  fx.radio.filter.connect(fx.radio.gain);
  fx.radio.gain.connect(dest);
  fx.riser = { on: false, osc: null };
  fx.siren = { on: false, timer: 0, osc: null };
  fx.brake = { on: false };
  return fx;
}

function setFx(name, on) {
  ensureCtx();
  const fx = state.fx[name];
  if (!fx) return;
  fx.on = on;
  if (name === 'echo') fx.wet.gain.value = on ? 0.45 : 0;
  if (name === 'radio') fx.gain.gain.value = on ? 0.55 : 0;
  if (name === 'freeze') {
    fx.inn.gain.value = on ? 0.8 : 0;
    fx.fb.gain.value = on ? 0.9 : 0.2;
  }
  if (name === 'tunnel') {
    if (fx.timer) cancelAnimationFrame(fx.timer);
    if (on) {
      const loop = () => {
        if (!fx.on) return;
        fx.filter.frequency.value = 280 + (Math.sin(performance.now() / 420) * 0.5 + 0.5) * 3200;
        fx.timer = requestAnimationFrame(loop);
      };
      if (state.graph) {
        try { state.graph.sum.disconnect(fx.filter); } catch { /* first connect */ }
        state.graph.sum.connect(fx.filter);
        fx.filter.connect(state.graph.comp);
      }
      loop();
    } else {
      try { fx.filter.disconnect(); } catch { /* already off */ }
    }
  }
  if (name === 'stutter') {
    clearInterval(fx.timer);
    if (on) {
      let open = true;
      fx.timer = setInterval(() => {
        open = !open;
        state.graph.hallVol.gain.value = open ? state.hall : 0;
      }, 90);
    } else updateOutput();
  }
  if (name === 'riser') toggleRiser(on);
  if (name === 'siren') toggleSiren(on);
  if (name === 'brake') {
    ['A', 'B'].forEach((id) => {
      const deck = decks[id];
      deck.rate = on ? deck.baseRate * 0.62 : deck.baseRate;
      if (deck.source) deck.source.playbackRate.value = deck.rate;
    });
  }
  paintFx();
}

function toggleRiser(on) {
  const ctx = state.ctx;
  if (!on) {
    if (state.fx.riser.osc) {
      try { state.fx.riser.osc.stop(); } catch { /* ended */ }
      state.fx.riser.osc = null;
    }
    return;
  }
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = 180;
  osc.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 3.2);
  gain.gain.value = 0.0001;
  gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 2.6);
  osc.connect(gain);
  gain.connect(state.graph.comp);
  osc.start();
  osc.stop(ctx.currentTime + 3.4);
  state.fx.riser.osc = osc;
  osc.onended = () => { state.fx.riser.on = false; paintFx(); };
}

function toggleSiren(on) {
  clearInterval(state.fx.siren.timer);
  if (state.fx.siren.osc) {
    try { state.fx.siren.osc.stop(); } catch { /* ended */ }
    state.fx.siren.osc = null;
  }
  if (!on) return;
  const osc = state.ctx.createOscillator();
  const gain = state.ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = 620;
  gain.gain.value = 0.08;
  osc.connect(gain);
  gain.connect(state.graph.comp);
  osc.start();
  state.fx.siren.osc = osc;
  let high = false;
  state.fx.siren.timer = setInterval(() => {
    high = !high;
    if (state.fx.siren.osc) state.fx.siren.osc.frequency.value = high ? 880 : 540;
  }, 180);
}

function clearFx() {
  ['echo', 'stutter', 'tunnel', 'freeze', 'radio', 'riser', 'siren', 'brake'].forEach((name) => setFx(name, false));
  ['A', 'B'].forEach((id) => {
    decks[id].echo = false;
    decks[id].hall = false;
    applyDeckMix(decks[id]);
  });
  paintSends();
}

function stinger(kind) {
  unlock();
  const ctx = ensureCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(state.graph.comp);
  const now = ctx.currentTime;
  if (kind === 'horn') {
    osc.type = 'sawtooth';
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.stop(now + 0.5);
  } else if (kind === 'clap') {
    osc.type = 'square';
    osc.frequency.value = 180;
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.stop(now + 0.14);
  } else if (kind === 'sweep') {
    osc.frequency.setValueAtTime(2000, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.7);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc.stop(now + 0.72);
  } else {
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.stop(now + 0.48);
  }
  osc.start();
}

function updateOutput() {
  if (!state.graph) return;
  const anyCue = decks.A.cue || decks.B.cue;
  if (state.monitor && anyCue) {
    state.graph.hallVol.gain.value = state.hall * 0.15;
    state.graph.cueToOut.gain.value = state.cueVol;
  } else {
    state.graph.hallVol.gain.value = state.hall * (1 - state.blend * 0.35);
    state.graph.cueToOut.gain.value = state.cueVol * state.blend;
  }
}

function applyDeckMix(deck) {
  const nodes = deck.nodes;
  if (!nodes) return;
  const eq = (knob, kill) => (kill ? -36 : (knob - 0.5) * 24);
  nodes.low.gain.value = eq(deck.knobs.low, deck.kill.low);
  nodes.mid.gain.value = eq(deck.knobs.mid, deck.kill.mid);
  nodes.high.gain.value = eq(deck.knobs.high, deck.kill.high);
  const f = deck.knobs.filter;
  if (f < 0.48) {
    nodes.filter.type = 'lowpass';
    nodes.filter.frequency.value = 180 + f / 0.48 * 6000;
  } else if (f > 0.52) {
    nodes.filter.type = 'highpass';
    nodes.filter.frequency.value = 80 + (f - 0.52) / 0.48 * 4000;
  } else {
    nodes.filter.type = 'lowpass';
    nodes.filter.frequency.value = 18000;
  }
  nodes.fader.gain.value = deck.fader;
  const xf = state.cross;
  const a = Math.cos(xf * Math.PI / 2);
  const b = Math.sin(xf * Math.PI / 2);
  nodes.xf.gain.value = deck.id === 'A' ? a : b;
  nodes.cue.gain.value = deck.cue ? 1 : 0;
  nodes.echoSend.gain.value = deck.echo ? 0.45 : 0;
  nodes.hallSend.gain.value = deck.hall ? 0.4 : 0;
}

function position(deck) {
  if (!deck.playing || !state.ctx) return deck.offset;
  let pos = deck.offset + (state.ctx.currentTime - deck.startedAt) * deck.rate;
  if (deck.loop.on && deck.loop.end > deck.loop.start && pos >= deck.loop.end) {
    const span = deck.loop.end - deck.loop.start;
    pos = deck.loop.start + ((pos - deck.loop.start) % span);
  }
  return clamp(pos, 0, deck.duration || 0);
}

function stopSource(deck) {
  deck.stopping = true;
  if (deck.source) {
    try { deck.source.onended = null; deck.source.stop(); } catch { /* already stopped */ }
    try { deck.source.disconnect(); } catch { /* already disconnected */ }
    deck.source = null;
  }
  deck.playing = false;
}

function play(deck) {
  if (!deck.buffer) return toast('Сначала загрузите трек');
  unlock();
  if (deck.playing) return;
  const src = state.ctx.createBufferSource();
  src.buffer = deck.buffer;
  src.playbackRate.value = deck.rate;
  src.loop = deck.loop.on;
  src.loopStart = deck.loop.start;
  src.loopEnd = Math.max(deck.loop.start + 0.05, deck.loop.end || deck.duration);
  src.connect(deck.nodes.trim);
  deck.stopping = false;
  deck.startedAt = state.ctx.currentTime;
  const startAt = clamp(deck.offset, 0, Math.max(0, deck.duration - 0.05));
  src.start(0, startAt);
  deck.source = src;
  deck.playing = true;
  src.onended = () => {
    if (deck.source !== src || deck.stopping) return;
    deck.playing = false;
    deck.source = null;
    deck.offset = 0;
    onEnded(deck);
  };
  if (!deck.heard) {
    deck.heard = true;
    state.history.unshift({ title: deck.title, at: Date.now() });
    state.history = state.history.slice(0, 40);
    localStorage.setItem('pe-dj-history', JSON.stringify(state.history));
  }
  paintDeck(deck);
}

function pause(deck) {
  if (!deck.playing) return;
  deck.offset = position(deck);
  stopSource(deck);
  paintDeck(deck);
}

function seek(deck, seconds) {
  const was = deck.playing;
  stopSource(deck);
  deck.offset = clamp(seconds, 0, Math.max(0, deck.duration - 0.02));
  if (was) play(deck);
  else paintDeck(deck);
}

function setRate(deck, rate, keepBase) {
  const pos = position(deck);
  deck.offset = pos;
  deck.startedAt = state.ctx ? state.ctx.currentTime : 0;
  deck.rate = clamp(rate, 0.5, 1.5);
  if (!keepBase) deck.baseRate = deck.rate;
  if (deck.source) deck.source.playbackRate.value = deck.rate;
  const slider = $(`[data-rate="${deck.id}"]`);
  if (slider) slider.value = String(clamp(deck.rate, Number(slider.min), Number(slider.max)));
  paintDeck(deck);
}

function applyLoop(deck) {
  if (!deck.source) return;
  deck.source.loop = deck.loop.on;
  deck.source.loopStart = deck.loop.start;
  deck.source.loopEnd = Math.max(deck.loop.start + 0.05, deck.loop.end);
}

function setLoop(deck, beats) {
  if (!deck.buffer) return;
  const beat = 60 / (deck.bpm || 120);
  let start = position(deck);
  if (state.quantize) start = Math.floor(start / beat) * beat;
  deck.loop = { on: true, start, end: Math.min(deck.duration, start + beat * beats) };
  applyLoop(deck);
  toast(`Петля ${beats}`);
  paintDeck(deck);
}

function cueDown(deck) {
  if (!deck.buffer) return;
  if (deck.playing) {
    pause(deck);
    deck.offset = deck.cuePoint;
    paintDeck(deck);
    return;
  }
  if (Math.abs(position(deck) - deck.cuePoint) > 0.08) {
    deck.cuePoint = position(deck);
    toast('Метка поставлена');
    paintDeck(deck);
    return;
  }
  deck.offset = deck.cuePoint;
  deck.cueHold = true;
  play(deck);
}

function cueUp(deck) {
  if (!deck.cueHold) return;
  pause(deck);
  deck.offset = deck.cuePoint;
  deck.cueHold = false;
  paintDeck(deck);
}

function hotCue(deck, slot, clear) {
  if (!deck.buffer) return;
  if (clear || (deck.cues[slot] != null && eventShift())) {
    deck.cues[slot] = null;
  } else if (deck.cues[slot] == null) {
    deck.cues[slot] = position(deck);
    toast(`Точка ${slot + 1}`);
  } else {
    seek(deck, deck.cues[slot]);
  }
  paintDeck(deck);
}

let shift = false;
let heldCue = null;
let heldBend = null;
function eventShift() { return shift; }

function syncDeck(deck) {
  const other = decks[otherId(deck.id)];
  if (!deck.bpm || !other.bpm) return toast('Нужен темп на обеих деках');
  const target = other.bpm * other.rate / deck.bpm;
  if (target < 0.5 || target > 1.5) return toast('Темп слишком разный');
  setRate(deck, target);
  toast('Темп сведён');
}

function tap(deck) {
  const now = performance.now();
  deck.taps = (deck.taps || []).filter((t) => now - t < 2500).concat(now);
  if (deck.taps.length < 2) return;
  const gaps = deck.taps.slice(1).map((t, i) => t - deck.taps[i]);
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  deck.bpm = Math.round(60000 / avg);
  paintDeck(deck);
}

function onEnded(deck) {
  deck.mixArmed = false;
  paintDeck(deck);
  if (!state.automix && state.order) startNext(deck.id, false);
}

function queue() {
  if (state.setId === 'all') return state.tracks;
  const set = state.setlists.find((item) => item.id === state.setId);
  if (!set) return state.tracks;
  return set.trackIds.map((id) => state.tracks.find((track) => track.id === id)).filter(Boolean);
}

function nextTrack(afterId) {
  const list = queue();
  if (!list.length) return null;
  const index = Math.max(0, list.findIndex((track) => track.id === afterId));
  return list[(index + 1) % list.length];
}

async function startNext(deckId, mix) {
  const current = decks[deckId];
  const track = nextTrack(current.trackId);
  if (!track) return;
  const target = mix ? decks[otherId(deckId)] : current;
  await loadTrack(target, track);
  play(target);
  if (mix) rampCross(target.id);
}

function rampCross(id) {
  const target = id === 'B' ? 1 : 0;
  const start = state.cross;
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 12000);
    state.cross = start + (target - start) * k;
    $('#cross').value = String(state.cross);
    applyDeckMix(decks.A);
    applyDeckMix(decks.B);
    if (k < 1) requestAnimationFrame(step);
  };
  step();
}

function tickAutomix() {
  if (!state.automix) return;
  const playing = ['A', 'B'].map((id) => decks[id]).filter((deck) => deck.playing && deck.buffer);
  if (playing.length !== 1) return;
  const deck = playing[0];
  const left = deck.duration - position(deck);
  if (left < 16 && left > 1 && !deck.mixArmed) {
    deck.mixArmed = true;
    startNext(deck.id, true);
  }
}

function peaksOf(buffer, buckets = 700) {
  const data = buffer.getChannelData(0);
  const size = Math.max(1, Math.floor(data.length / buckets));
  const out = [];
  for (let i = 0; i < buckets; i++) {
    let max = 0;
    const start = i * size;
    for (let j = 0; j < size; j += 12) max = Math.max(max, Math.abs(data[start + j] || 0));
    out.push(max);
  }
  return out;
}

function estimateBpm(buffer) {
  const data = buffer.getChannelData(0);
  const fps = 150;
  const step = Math.floor(buffer.sampleRate / fps);
  const limit = Math.min(data.length, buffer.sampleRate * 30);
  const env = [];
  for (let i = 0; i < limit; i += step) {
    let sum = 0;
    const end = Math.min(limit, i + step);
    for (let j = i; j < end; j += 4) sum += data[j] * data[j];
    env.push(Math.sqrt(sum / ((end - i) / 4)));
  }
  const diff = env.map((v, i) => Math.max(0, v - (env[i - 1] || 0)));
  let best = { bpm: 120, score: 0 };
  for (let bpm = 80; bpm <= 170; bpm++) {
    const lag = Math.round(fps * 60 / bpm);
    let score = 0;
    for (let i = lag; i < diff.length; i += 2) score += diff[i] * diff[i - lag];
    if (score > best.score) best = { bpm, score };
  }
  return best.bpm;
}

function trimOf(buffer) {
  if (!state.autogain) return 1;
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i += 48) peak = Math.max(peak, Math.abs(data[i]));
  return peak > 0.02 ? clamp(0.9 / peak, 0.4, 2.2) : 1;
}

async function decodeFile(file) {
  await unlock();
  const bytes = await file.arrayBuffer();
  const copy = bytes.slice(0);
  const audio = await state.ctx.decodeAudioData(bytes);
  return { bytes: copy, audio, name: file.name.replace(/\.[^.]+$/, '') };
}

async function rememberTrack(meta) {
  state.tracks.unshift(meta);
  try {
    const db = await idb();
    const stored = { ...meta };
    delete stored.audio;
    await new Promise((resolve, reject) => {
      const tx = db.transaction('tracks', 'readwrite');
      tx.objectStore('tracks').put(stored);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* memory only */ }
  renderLibrary();
}

async function loadDecoded(deck, audio, meta) {
  stopSource(deck);
  deck.buffer = audio;
  deck.trackId = meta.id;
  deck.title = meta.name;
  deck.duration = audio.duration;
  deck.bpm = meta.bpm || estimateBpm(audio);
  deck.peaks = meta.peaks || peaksOf(audio);
  deck.offset = 0;
  deck.cuePoint = 0;
  deck.cues = Array(8).fill(null);
  deck.loop = { on: false, start: 0, end: 0 };
  deck.heard = false;
  deck.mixArmed = false;
  deck.rate = 1;
  deck.baseRate = 1;
  if (deck.nodes) deck.nodes.trim.gain.value = meta.trim || trimOf(audio);
  $(`[data-rate="${deck.id}"]`).value = '1';
  paintDeck(deck);
}

async function loadTrack(deck, track) {
  await unlock();
  if (track.audio) {
    await loadDecoded(deck, track.audio, track);
    return;
  }
  const db = await idb();
  const stored = await new Promise((resolve, reject) => {
    const tx = db.transaction('tracks', 'readonly');
    const req = tx.objectStore('tracks').get(track.id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!stored) return toast('Трек не найден');
  const raw = stored.bytes;
  const bytes = raw instanceof ArrayBuffer ? raw.slice(0) : raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const audio = await state.ctx.decodeAudioData(bytes);
  stored.audio = audio;
  const live = state.tracks.find((item) => item.id === stored.id);
  if (live) live.audio = audio;
  await loadDecoded(deck, audio, stored);
}

async function addFiles(files, deckId) {
  await unlock();
  for (const file of files) {
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(file.name)) continue;
    try {
      const decoded = await decodeFile(file);
      const meta = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        name: decoded.name,
        bytes: decoded.bytes,
        bpm: estimateBpm(decoded.audio),
        duration: decoded.audio.duration,
        peaks: peaksOf(decoded.audio),
        trim: trimOf(decoded.audio),
        audio: decoded.audio
      };
      await rememberTrack(meta);
      if (deckId) {
        await loadDecoded(decks[deckId], decoded.audio, meta);
        deckId = null;
      } else if (!decks.A.buffer) await loadDecoded(decks.A, decoded.audio, meta);
      else if (!decks.B.buffer) await loadDecoded(decks.B, decoded.audio, meta);
    } catch (error) {
      toast(error.message || 'Файл не прочитался');
    }
  }
}

function makeBeat(bpm, root, seconds = 28) {
  const ctx = ensureCtx();
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const beat = 60 / bpm;
  const beats = Math.floor(seconds / beat);
  for (let i = 0; i < beats; i++) {
    const t0 = Math.floor(i * beat * sr);
    for (let s = 0; s < sr * 0.18 && t0 + s < n; s++) {
      const t = s / sr;
      const v = Math.sin(2 * Math.PI * (root * 0.45 * Math.exp(-t * 12) + 48) * t) * Math.exp(-t * 8) * 0.8;
      L[t0 + s] += v;
      R[t0 + s] += v;
    }
    if (i % 4 === 1) {
      for (let s = 0; s < sr * 0.1 && t0 + s < n; s++) {
        const t = s / sr;
        const v = (Math.random() * 2 - 1) * Math.exp(-t * 16) * 0.32;
        L[t0 + s] += v;
        R[t0 + s] += v;
      }
    }
    const note = root * (i % 8 < 4 ? 1 : 1.5);
    for (let s = 0; s < sr * 0.22 && t0 + s < n; s++) {
      const t = s / sr;
      const v = Math.sin(2 * Math.PI * note * t) * Math.exp(-t * 5) * 0.22;
      L[t0 + s] += v;
      R[t0 + s] += v * 0.9;
    }
  }
  for (let i = 0; i < n; i++) {
    L[i] = clamp(L[i], -1, 1);
    R[i] = clamp(R[i], -1, 1);
  }
  return buf;
}

async function loadTestBeats() {
  await unlock();
  const a = makeBeat(120, 110);
  const b = makeBeat(100, 82);
  const metaA = { id: 'test-120', name: 'Тест-бит 120', bpm: 120, duration: a.duration, peaks: peaksOf(a), audio: a, ephemeral: true };
  const metaB = { id: 'test-100', name: 'Тест-бит 100', bpm: 100, duration: b.duration, peaks: peaksOf(b), audio: b, ephemeral: true };
  state.tracks = [metaA, metaB].concat(state.tracks.filter((track) => !track.ephemeral));
  await loadDecoded(decks.A, a, metaA);
  await loadDecoded(decks.B, b, metaB);
  renderLibrary();
  toast('Тест-биты на деках. Включите звук и нажмите play');
}

function paintDeck(deck) {
  const root = $(`[data-deck-root="${deck.id}"]`);
  root.querySelector('.title').textContent = deck.title || 'Нет трека';
  root.querySelector('.time').textContent = `${fmt(position(deck))} / ${fmt(deck.duration)}`;
  root.querySelector('.hint').hidden = !!deck.buffer;
  $(`[data-bpm="${deck.id}"]`).textContent = deck.bpm ? `${Math.round(deck.bpm * deck.rate)} BPM` : '— BPM';
  $(`[data-play="${deck.id}"]`).textContent = deck.playing ? 'II' : '▶';
  root.querySelectorAll('[data-hot]').forEach((btn) => btn.classList.toggle('on', deck.cues[btn.dataset.slot] != null));
  drawWave(deck);
}

function drawWave(deck) {
  const canvas = $(`[data-deck-root="${deck.id}"] .wave`);
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(10, Math.floor(rect.width * dpr));
  const h = Math.max(10, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const mid = canvas.height / 2;
  const color = deck.id === 'A' ? '#ff2f86' : '#3ad7ff';
  const peaks = deck.peaks.length ? deck.peaks : [0.05];
  const play = deck.duration ? position(deck) / deck.duration : 0;
  peaks.forEach((peak, i) => {
    const x = (i / peaks.length) * canvas.width;
    const h = Math.max(2, peak * mid * 0.92);
    ctx.fillStyle = i / peaks.length < play ? color : 'rgba(255,255,255,.28)';
    ctx.fillRect(x, mid - h, Math.max(1, canvas.width / peaks.length - 0.4), h * 2);
  });
  ctx.fillStyle = '#fff';
  ctx.fillRect(play * canvas.width, 0, 2, canvas.height);
}

function paintSends() {
  $$('[data-send]').forEach((btn) => {
    const deck = decks[btn.dataset.deck];
    btn.classList.toggle('on', !!deck[btn.dataset.send]);
  });
  $$('[data-cue-btn]').forEach((btn) => btn.classList.toggle('on', decks[btn.dataset.cueBtn].cue));
  $$('[data-kill]').forEach((btn) => btn.classList.toggle('on', decks[btn.dataset.deck].kill[btn.dataset.kill]));
}

function paintFx() {
  const pad = $('#fxPad');
  if (state.fxTab === 'hits') {
    pad.innerHTML = ['horn:Гудок', 'clap:Хлопок', 'sweep:Свист', 'hit:Удар'].map((item) => {
      const [id, label] = item.split(':');
      return `<button class="btn" data-hit="${id}" type="button">${label}</button>`;
    }).join('');
    return;
  }
  if (state.fxTab === 'picture') {
    pad.innerHTML = '<button class="btn" id="openPic" type="button">Открыть картину</button>';
    return;
  }
  const names = [['radio', 'Радио'], ['stutter', 'Заикание'], ['tunnel', 'Туннель'], ['freeze', 'Заморозка'], ['riser', 'Взлёт'], ['brake', 'Спад'], ['siren', 'Сирена'], ['echo', 'Эхо']];
  pad.innerHTML = names.map(([id, label]) => `<button class="btn ${state.fx[id] && state.fx[id].on ? 'on' : ''}" data-fx="${id}" type="button">${label}</button>`).join('');
}

function renderLibrary() {
  const q = state.query.trim().toLowerCase();
  $('#setlist').innerHTML = `<option value="all">Универсальный</option>` + state.setlists.map((set) => `<option value="${set.id}" ${set.id === state.setId ? 'selected' : ''}>${escapeHtml(set.name)}</option>`).join('');
  if (state.libTab === 'orders') {
    $('#libList').innerHTML = state.orders.length ? state.orders.map((order, i) => `<div class="rowt"><span>${escapeHtml(order.text)}</span><button class="btn" data-order-done="${i}" type="button">Сыграно</button></div>`).join('') : '<div class="empty">Заказов пока нет</div>';
    $('#libExtra').innerHTML = '<form id="orderForm" class="lib-h"><input class="field" id="orderText" placeholder="Песня и от кого"><button class="btn" type="submit">Добавить заказ</button></form>';
    return;
  }
  if (state.libTab === 'history') {
    $('#libExtra').innerHTML = '';
    $('#libList').innerHTML = state.history.length ? state.history.map((item) => `<div class="rowt"><span>${escapeHtml(item.title)}</span><small>${new Date(item.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small></div>`).join('') : '<div class="empty">Ещё ничего не играли</div>';
    return;
  }
  $('#libExtra').innerHTML = '';
  const rows = state.tracks.filter((track) => !q || track.name.toLowerCase().includes(q));
  $('#libList').innerHTML = rows.length ? rows.map((track) => `<button class="rowt ${state.selected === track.id ? 'on' : ''}" data-track="${track.id}" type="button"><span>${escapeHtml(track.name)}</span><small>${track.bpm || '—'} BPM · ${fmt(track.duration || 0)}</small></button>`).join('') : '<div class="empty">Пусто — добавьте треки кнопкой «+ Треки» или поставьте тест-биты</div>';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function renderMeters() {
  ['A', 'B'].forEach((id) => {
    const deck = decks[id];
    paintDeck(deck);
    const meter = deck.nodes && deck.nodes.meter;
    const bar = $(`[data-meter="${id}"] i`);
    if (!meter || !bar) return;
    const data = new Uint8Array(meter.frequencyBinCount);
    meter.getByteFrequencyData(data);
    const avg = data.reduce((sum, n) => sum + n, 0) / data.length / 255;
    bar.style.height = `${Math.min(100, avg * 180)}%`;
  });
  if (state.graph) {
    const reduction = state.graph.comp.reduction || 0;
    $('#limiter').textContent = reduction < -1 ? 'ЛИМИТЕР · ДЕРЖИТ' : 'ЛИМИТЕР · ЗАПАС ЕСТЬ';
    const levelData = new Uint8Array(state.graph.masterAnalyser.frequencyBinCount);
    state.graph.masterAnalyser.getByteFrequencyData(levelData);
    state.level = levelData.reduce((sum, n) => sum + n, 0) / levelData.length / 255;
  }
  const beat = (deck) => {
    const bpm = (deck.bpm || 120) * deck.rate;
    return (position(deck) % (60 / bpm)) / (60 / bpm);
  };
  const match = $('#match');
  match.querySelector('i').style.left = `${beat(decks.A) * 92}%`;
  match.querySelector('b').style.left = `${beat(decks.B) * 92}%`;
  tickAutomix();
  publish();
}

function publish() {
  if (!bus) return;
  bus.postMessage({
    type: 'state',
    cross: state.cross,
    level: state.level || 0,
    a: { title: decks.A.title, playing: decks.A.playing },
    b: { title: decks.B.title, playing: decks.B.playing }
  });
}

function openPopover(anchor, html) {
  const pop = $('#popover');
  pop.innerHTML = html;
  pop.hidden = false;
  const rect = anchor.getBoundingClientRect();
  pop.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 240)}px`;
  pop.style.left = `${Math.min(rect.left, window.innerWidth - 440)}px`;
}

function closePopover() { $('#popover').hidden = true; }

const tourSteps = [
  ['Что это за пульт', 'Две деки и микшер в отдельном окне. Кабинет не закрывается. Назад — кнопка «В приложение».'],
  ['Деки', 'Перетащите свой файл или нажмите «Тест-биты». Волна кликается — так перематывают. Метки 1–8 запоминают место.'],
  ['Куда идёт звук', 'Сначала «Включить звук». На одном ноутбуке зал и наушники — это один выход: предпрослушка слышна, если сдвинуть «Наушники — зал» или включить «Свой монитор».'],
  ['Сведение', 'Кроссфейдер переводит зал с A на B. «Свести» подгоняет темп. «По сетке» ставит петлю в долю.'],
  ['Автомикс', 'Когда песня заканчивается, следующий трек сам заводится на второй деке и кроссфейдер уходит к ней.'],
  ['Играть подряд', 'Очередь библиотеки или сетлиста на той же деке, без сведения. Удобно, если руки заняты залом.'],
  ['Эффекты и отбивки', 'Эхо и зал — на канал. Радио, сирена и гудок — на весь звук. «Снять всё» выключает их.'],
  ['Библиотека', 'Файлы остаются в этом браузере. Заказы — просьбы гостей. Запись скачивается файлом, когда её останавливаете.']
];

function renderTour() {
  const card = $('#tour');
  if (state.tour >= tourSteps.length) {
    card.hidden = true;
    localStorage.setItem('pe-dj-tour', '1');
    $$('.hot').forEach((node) => node.classList.remove('hot'));
    return;
  }
  const [title, text] = tourSteps[state.tour];
  card.hidden = false;
  card.innerHTML = `<div class="lbl">Обучение · ${state.tour + 1} / ${tourSteps.length}</div><h3>${title}</h3><p>${text}</p><div class="group"><button class="btn" id="tourClose" type="button">Закрыть</button><button class="btn" id="tourPrev" type="button">Назад</button><button class="btn solid" id="tourNext" type="button">Далее</button></div>`;
  $$('.hot').forEach((node) => node.classList.remove('hot'));
  const map = [null, '[data-tour="decks"]', '[data-tour="outputs"]', '[data-tour="mixer"]', '[data-tour="automix"]', '[data-tour="order"]', '[data-tour="fx"]', '[data-tour="lib"]'];
  const node = map[state.tour] && $(map[state.tour]);
  if (node) node.classList.add('hot');
}

function bindKnobs() {
  $$('.knob').forEach((el) => {
    const deck = decks[el.dataset.deck];
    const key = el.dataset.knob;
    const paint = () => {
      const deg = -135 + deck.knobs[key] * 270;
      el.querySelector('b').style.transform = `rotate(${deg}deg)`;
    };
    paint();
    el.addEventListener('pointerdown', (event) => {
      if (state.learn) return armLearn(el.dataset.learn);
      event.preventDefault();
      const startY = event.clientY;
      const start = deck.knobs[key];
      const move = (ev) => {
        deck.knobs[key] = clamp(start + (startY - ev.clientY) / 110, 0, 1);
        paint();
        applyDeckMix(deck);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    el.addEventListener('dblclick', () => {
      deck.knobs[key] = 0.5;
      paint();
      applyDeckMix(deck);
    });
  });
}

function armLearn(target) {
  state.learnTarget = target;
  toast('Двиньте ручку или кнопку на контроллере');
}

function applyMidi(target, value, down) {
  if (target === 'xf') { state.cross = value; $('#cross').value = String(value); }
  if (target === 'hall') { state.hall = value; $('#hallVol').value = String(value); }
  if (target === 'blend') { state.blend = value; $('#blend').value = String(value); }
  if (target === 'faderA' || target === 'faderB') {
    const id = target.endsWith('A') ? 'A' : 'B';
    decks[id].fader = value;
    $(`[data-fader="${id}"]`).value = String(value);
  }
  ['A', 'B'].forEach((id) => applyDeckMix(decks[id]));
  updateOutput();
  if (down && target === 'playA') decks.A.playing ? pause(decks.A) : play(decks.A);
  if (down && target === 'playB') decks.B.playing ? pause(decks.B) : play(decks.B);
}

async function enableMidi() {
  if (!navigator.requestMIDIAccess) return toast('Этот браузер без MIDI');
  const access = await navigator.requestMIDIAccess();
  const hook = () => {
    for (const input of access.inputs.values()) input.onmidimessage = onMidi;
  };
  access.onstatechange = hook;
  hook();
  const names = [...access.inputs.values()].map((input) => input.name);
  openPopover($('#midiBtn'), `<h3>Контроллер</h3><p>${names.length ? names.join(', ') : 'Пока ничего не подключено. Можно играть мышкой.'}</p><p>Привязка запоминает следующую ручку MIDI за кликнутым регулятором.</p>`);
}

function onMidi(event) {
  const [status, data1, data2] = event.data;
  const cmd = status & 0xf0;
  const key = `${cmd}:${data1}`;
  if (state.learn && state.learnTarget && (cmd === 0xb0 || cmd === 0x90)) {
    state.midiMap[key] = state.learnTarget;
    localStorage.setItem('pe-dj-midi', JSON.stringify(state.midiMap));
    state.learn = false;
    $('#learnBtn').classList.remove('on');
    toast('Привязано');
    return;
  }
  const target = state.midiMap[key];
  if (!target) return;
  applyMidi(target, (data2 || 0) / 127, cmd === 0x90 && data2 > 0);
}

async function showOutputs(anchor) {
  await unlock();
  let devices = [];
  try {
    devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'audiooutput');
  } catch { /* ignore */ }
  const list = devices.length ? devices.map((device) => `<button class="btn" data-sink="${device.deviceId}" type="button">${escapeHtml(device.label || 'Выход')}</button>`).join(' ') : '<p>Браузер не отдал список. Будет устройство по умолчанию.</p>';
  openPopover(anchor, `<h3>Выходы</h3><p>Браузер играет в одно устройство. Чтобы слышать следующую деку, не отдавая её в зал, включите «Свой монитор» и наушники на этой машине. Два разных выхода сразу страница назначить не может.</p><div class="group">${list}</div>`);
}

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('zalsvet-dj', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('tracks', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadLibrary() {
  try {
    const db = await idb();
    const all = await new Promise((resolve, reject) => {
      const req = db.transaction('tracks', 'readonly').objectStore('tracks').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    state.tracks = all.sort((a, b) => (b.id > a.id ? 1 : -1));
  } catch { state.tracks = []; }
  renderLibrary();
}

function saveSet() {
  const name = prompt('Название сетлиста');
  if (!name) return;
  const set = { id: `${Date.now()}`, name: name.slice(0, 40), trackIds: state.tracks.map((track) => track.id).filter((id) => !String(id).startsWith('test-')) };
  state.setlists.push(set);
  state.setId = set.id;
  localStorage.setItem('pe-dj-sets', JSON.stringify(state.setlists));
  localStorage.setItem('pe-dj-set', state.setId);
  renderLibrary();
}

async function deleteSelected() {
  const track = state.tracks.find((item) => item.id === state.selected);
  if (!track) return toast('Сначала выберите трек');
  state.tracks = state.tracks.filter((item) => item.id !== track.id);
  if (!track.ephemeral) {
    try {
      const db = await idb();
      db.transaction('tracks', 'readwrite').objectStore('tracks').delete(track.id);
    } catch { /* ignore */ }
  }
  renderLibrary();
}

function bindWave(deck) {
  const canvas = $(`[data-deck-root="${deck.id}"] .wave`);
  canvas.addEventListener('pointerdown', (event) => {
    if (!deck.duration) return;
    const seekAt = (ev) => {
      const rect = canvas.getBoundingClientRect();
      seek(deck, ((ev.clientX - rect.left) / rect.width) * deck.duration);
    };
    seekAt(event);
    const move = (ev) => seekAt(ev);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  const root = $(`[data-deck-root="${deck.id}"]`);
  root.addEventListener('dragover', (event) => { event.preventDefault(); root.querySelector('.wave-wrap').classList.add('hot'); });
  root.addEventListener('dragleave', () => root.querySelector('.wave-wrap').classList.remove('hot'));
  root.addEventListener('drop', async (event) => {
    event.preventDefault();
    root.querySelector('.wave-wrap').classList.remove('hot');
    if (event.dataTransfer.files.length) await addFiles(event.dataTransfer.files, deck.id);
  });
}

document.addEventListener('keydown', (event) => { shift = event.shiftKey; });
document.addEventListener('keyup', (event) => { shift = event.shiftKey; });

document.addEventListener('pointerdown', (event) => {
  if (state.learn && event.target.dataset && event.target.dataset.learn) {
    armLearn(event.target.dataset.learn);
    return;
  }
  const cue = event.target.closest('[data-cue]');
  if (cue) {
    heldCue = decks[cue.dataset.cue];
    cueDown(heldCue);
  }
  const bend = event.target.closest('[data-bend]');
  if (bend) {
    heldBend = decks[bend.dataset.bend];
    heldBend.bendFrom = heldBend.baseRate;
    setRate(heldBend, heldBend.baseRate + Number(bend.dataset.dir) * 0.05, true);
  }
});

window.addEventListener('pointerup', () => {
  if (heldCue) cueUp(heldCue);
  heldCue = null;
  if (heldBend) setRate(heldBend, heldBend.bendFrom || heldBend.baseRate);
  heldBend = null;
});

document.addEventListener('click', async (event) => {
  const btn = event.target.closest('button, [data-track]');
  try {
    if (event.target.id === 'tourNext') { state.tour += 1; renderTour(); return; }
    if (event.target.id === 'tourPrev') { state.tour = Math.max(0, state.tour - 1); renderTour(); return; }
    if (event.target.id === 'tourClose') { state.tour = 99; renderTour(); return; }
    if (!btn) {
      if (!event.target.closest('#popover')) closePopover();
      return;
    }
    if (state.learn && btn.dataset.learn) return armLearn(btn.dataset.learn);
    if (btn.id === 'soundBtn') return unlock();
    if (btn.id === 'backBtn') {
      if (window.opener && !window.opener.closed) { window.opener.focus(); window.close(); return; }
      location.href = '/';
      return;
    }
    if (btn.id === 'tourBtn') { state.tour = 0; renderTour(); return; }
    if (btn.id === 'guideBtn') return openPopover(btn, '<h3>Гид</h3><p>Дека — трек. Кроссфейдер — кто звучит в зале. Наушники — подслушать следующую песню. Автомикс сам делает переход. Играть подряд ставит очередь без сведения.</p>');
    if (btn.id === 'helpBtn') return openPopover(btn, '<h3>Клавиши</h3><p>Пробел — play выбранной деки. C — метка. Стрелки влево и вправо — темп. Shift и точка 1–8 — стереть метку. Двойной щелчок по ручке — в центр.</p>');
    if (btn.id === 'screenBtn' || btn.id === 'openPic') return window.open('/dj-screen', 'zalsvet-dj-screen');
    if (btn.id === 'viewBtn') { document.body.classList.toggle('compact'); return; }
    if (btn.id === 'outputsBtn') return showOutputs(btn);
    if (btn.dataset.sink) {
      if (state.ctx.setSinkId) await state.ctx.setSinkId(btn.dataset.sink);
      else toast('Браузер не переключает выход');
      closePopover();
      return;
    }
    if (btn.id === 'automixBtn') { state.automix = !state.automix; btn.classList.toggle('on', state.automix); return; }
    if (btn.id === 'orderBtn') { state.order = !state.order; btn.classList.toggle('on', state.order); return; }
    if (btn.id === 'midiBtn') return enableMidi();
    if (btn.id === 'learnBtn') { state.learn = !state.learn; btn.classList.toggle('on', state.learn); toast(state.learn ? 'Кликните регулятор, потом крутите MIDI' : 'Привязка выключена'); return; }
    if (btn.id === 'autogainBtn') { state.autogain = !state.autogain; btn.classList.toggle('on', state.autogain); return; }
    if (btn.id === 'recBtn') return toggleRecord(btn);
    if (btn.id === 'addTracks') return $('#fileAny').click();
    if (btn.id === 'testBeats') return loadTestBeats();
    if (btn.dataset.load) { state.focus = btn.dataset.load; return $(`#file${btn.dataset.load}`).click(); }
    if (btn.dataset.play) {
      const deck = decks[btn.dataset.play];
      state.focus = deck.id;
      return deck.playing ? pause(deck) : play(deck);
    }
    if (btn.dataset.sync) return syncDeck(decks[btn.dataset.sync]);
    if (btn.dataset.tap) return tap(decks[btn.dataset.tap]);
    if (btn.dataset.range) {
      const id = btn.dataset.range;
      state.ranges[id] = state.ranges[id] === 0.16 ? 0.08 : state.ranges[id] === 0.08 ? 0.5 : 0.16;
      const slider = $(`[data-rate="${id}"]`);
      slider.min = String(1 - state.ranges[id]);
      slider.max = String(1 + state.ranges[id]);
      btn.textContent = `±${Math.round(state.ranges[id] * 100)}`;
      return;
    }
    if (btn.dataset.hot) return hotCue(decks[btn.dataset.hot], Number(btn.dataset.slot));
    if (btn.dataset.jump) {
      const deck = decks[btn.dataset.jump];
      const beat = 60 / ((deck.bpm || 120) * deck.rate);
      return seek(deck, position(deck) + Number(btn.dataset.beats) * beat);
    }
    if (btn.dataset.loop) return setLoop(decks[btn.dataset.loop], Number(btn.dataset.beats));
    if (btn.dataset.loopOff) {
      const deck = decks[btn.dataset.loopOff];
      deck.loop.on = false;
      applyLoop(deck);
      return;
    }
    if (btn.dataset.kill) {
      const deck = decks[btn.dataset.deck];
      deck.kill[btn.dataset.kill] = !deck.kill[btn.dataset.kill];
      applyDeckMix(deck);
      paintSends();
      return;
    }
    if (btn.dataset.send) {
      const deck = decks[btn.dataset.deck];
      deck[btn.dataset.send] = !deck[btn.dataset.send];
      applyDeckMix(deck);
      paintSends();
      return;
    }
    if (btn.dataset.cueBtn) {
      const deck = decks[btn.dataset.cueBtn];
      deck.cue = !deck.cue;
      applyDeckMix(deck);
      updateOutput();
      paintSends();
      if (deck.cue && !state.monitor && state.blend === 0) toast('Включите монитор или сдвиньте «Наушники — зал»');
      return;
    }
    if (btn.dataset.fx) return setFx(btn.dataset.fx, !(state.fx[btn.dataset.fx] && state.fx[btn.dataset.fx].on));
    if (btn.dataset.hit) return stinger(btn.dataset.hit);
    if (btn.id === 'fxClear') return clearFx();
    if (btn.dataset.fxTab) {
      state.fxTab = btn.dataset.fxTab;
      $$('[data-fx-tab]').forEach((tab) => tab.classList.toggle('on', tab.dataset.fxTab === state.fxTab));
      paintFx();
      return;
    }
    if (btn.dataset.libTab) {
      state.libTab = btn.dataset.libTab;
      $$('[data-lib-tab]').forEach((tab) => tab.classList.toggle('on', tab.dataset.libTab === state.libTab));
      renderLibrary();
      return;
    }
    if (btn.dataset.track) {
      state.selected = btn.dataset.track;
      renderLibrary();
      return;
    }
    if (btn.id === 'loadA' || btn.id === 'loadB') {
      const track = state.tracks.find((item) => item.id === state.selected);
      if (!track) return toast('Выберите трек в списке');
      return loadTrack(decks[btn.id === 'loadA' ? 'A' : 'B'], track);
    }
    if (btn.id === 'saveSet') return saveSet();
    if (btn.id === 'deleteTrack') return deleteSelected();
    if (btn.dataset.orderDone) {
      state.orders.splice(Number(btn.dataset.orderDone), 1);
      localStorage.setItem('pe-dj-orders', JSON.stringify(state.orders));
      renderLibrary();
    }
  } catch (error) {
    toast(error.message || 'Не получилось');
  }
});

function toggleRecord(btn) {
  unlock();
  if (!state.graph) return;
  if (!state.recording) {
    state.chunks = [];
    let rec;
    try {
      rec = new MediaRecorder(state.graph.streamDest.stream);
    } catch {
      return toast('Запись в этом браузере недоступна');
    }
    rec.ondataavailable = (event) => { if (event.data.size) state.chunks.push(event.data); };
    rec.onstop = () => {
      const blob = new Blob(state.chunks, { type: rec.mimeType || 'audio/webm' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'zalsvet-set.webm';
      link.click();
    };
    rec.start();
    state.recording = rec;
    btn.classList.add('on');
    toast('Запись пошла');
    return;
  }
  state.recording.stop();
  state.recording = null;
  btn.classList.remove('on');
}

['A', 'B'].forEach((id) => {
  const slider = $(`[data-rate="${id}"]`);
  slider.addEventListener('input', () => setRate(decks[id], Number(slider.value)));
  $(`[data-fader="${id}"]`).addEventListener('input', (event) => {
    decks[id].fader = Number(event.target.value);
    applyDeckMix(decks[id]);
  });
  bindWave(decks[id]);
  $(`#file${id}`).addEventListener('change', (event) => addFiles(event.target.files, id));
});

$('#cross').addEventListener('input', (event) => {
  state.cross = Number(event.target.value);
  applyDeckMix(decks.A);
  applyDeckMix(decks.B);
});
$('#hallVol').addEventListener('input', (event) => { state.hall = Number(event.target.value); updateOutput(); });
$('#cueVol').addEventListener('input', (event) => { state.cueVol = Number(event.target.value); updateOutput(); });
$('#blend').addEventListener('input', (event) => { state.blend = Number(event.target.value); updateOutput(); });
$('#monitor').addEventListener('change', (event) => { state.monitor = event.target.checked; updateOutput(); });
$('#quantize').addEventListener('change', (event) => { state.quantize = event.target.checked; });
$('#setlist').addEventListener('change', (event) => {
  state.setId = event.target.value;
  localStorage.setItem('pe-dj-set', state.setId);
});
$('#fileAny').addEventListener('change', (event) => addFiles(event.target.files, null));
$('#libSearch').addEventListener('input', (event) => { state.query = event.target.value; renderLibrary(); });
document.addEventListener('submit', (event) => {
  if (event.target.id !== 'orderForm') return;
  event.preventDefault();
  const text = $('#orderText').value.trim();
  if (!text) return;
  state.orders.unshift({ text: text.slice(0, 80) });
  localStorage.setItem('pe-dj-orders', JSON.stringify(state.orders));
  renderLibrary();
});
document.addEventListener('keydown', (event) => {
  if (event.target.matches('input, textarea')) return;
  if (event.code === 'Space') { event.preventDefault(); const deck = decks[state.focus]; deck.playing ? pause(deck) : play(deck); }
  if (event.key === 'c') cueDown(decks[state.focus]);
  if (event.key === 'ArrowLeft') setRate(decks[state.focus], decks[state.focus].rate - 0.01);
  if (event.key === 'ArrowRight') setRate(decks[state.focus], decks[state.focus].rate + 0.01);
});
if (bus) bus.onmessage = (event) => { if (event.data && event.data.type === 'hello') publish(); };

bindKnobs();
paintFx();
renderLibrary();
loadLibrary();
['A', 'B'].forEach((id) => paintDeck(decks[id]));
if (!localStorage.getItem('pe-dj-tour')) renderTour();
raf = requestAnimationFrame(function frame() {
  renderMeters();
  raf = requestAnimationFrame(frame);
});
