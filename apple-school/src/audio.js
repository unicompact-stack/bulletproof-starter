import { AUDIO } from './lesson.js';

// Local MP3s only. One audio source at a time; real sound volume drives the SVG mouth.
export class VoicePlayer {
  constructor({ onState, onLevel, onError }) {
    this.onState = onState;
    this.onLevel = onLevel;
    this.onError = onError;
    this.cache = new Map();
    this.serial = 0;
    this.muted = false;
    this.source = null;
    this.context = null;
    this.frame = null;
    this.controller = null;
  }
  getContext() {
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error('Web Audio is not supported');
      this.context = new Context();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.samples = new Float32Array(this.analyser.fftSize);
      this.analyser.connect(this.context.destination);
    }
    return this.context;
  }
  stop() {
    this.serial += 1;
    this.controller?.abort();
    this.controller = null;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    try { this.source?.stop(); } catch { /* Already ended. */ }
    this.source = null;
    this.onLevel(0);
    this.onState('idle');
  }
  setMuted(value) {
    this.muted = value;
    if (value) this.stop();
  }
  async play(key) {
    this.stop();
    if (this.muted || !AUDIO[key]) return false;
    const ticket = this.serial;
    try {
      // Called inside a click handler, before any fetch, for mobile autoplay rules.
      const context = this.getContext();
      const resuming = context.resume();
      this.onState('loading');
      let buffer = this.cache.get(key);
      if (!buffer) {
        this.controller = new AbortController();
        const response = await fetch(`${import.meta.env.BASE_URL}audio/${AUDIO[key]}`, { signal: this.controller.signal });
        if (!response.ok) throw new Error(`Audio HTTP ${response.status}`);
        buffer = await context.decodeAudioData(await response.arrayBuffer());
        this.cache.set(key, buffer);
      }
      await resuming;
      if (ticket !== this.serial || this.muted) return false;
      this.controller = null;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.analyser);
      this.source = source;
      this.onState('speaking');
      const animate = () => {
        if (ticket !== this.serial) return;
        this.analyser.getFloatTimeDomainData(this.samples);
        const rms = Math.sqrt(this.samples.reduce((sum, value) => sum + value * value, 0) / this.samples.length);
        this.onLevel(Math.min(1, rms * 9));
        this.frame = requestAnimationFrame(animate);
      };
      animate();
      return await new Promise((resolve) => {
        source.onended = () => {
          source.disconnect();
          if (ticket === this.serial) {
            if (this.frame !== null) cancelAnimationFrame(this.frame);
            this.frame = null;
            this.source = null;
            this.onLevel(0);
            this.onState('idle');
          }
          resolve(ticket === this.serial);
        };
        source.start();
      });
    } catch (error) {
      if (ticket !== this.serial || error.name === 'AbortError') return false;
      if (this.frame !== null) cancelAnimationFrame(this.frame);
      this.frame = null;
      this.source?.disconnect();
      this.source = null;
      this.onState('error');
      this.onLevel(0);
      this.onError(error);
      return false;
    }
  }
  tick(count) {
    if (this.muted) return;
    try {
      const context = this.getContext();
      context.resume().catch(() => {});
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 510 + count * 55;
      gain.gain.setValueAtTime(0.035, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.1);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start();
      oscillator.stop(context.currentTime + 0.1);
    } catch { /* Counting stays usable even if sound is unavailable. */ }
  }
}
