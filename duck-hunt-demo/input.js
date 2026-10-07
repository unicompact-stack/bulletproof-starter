/*
 * Единый слой ввода игры.
 * Сейчас активен MouseInput. Позже Android-контроллер сможет передавать сюда
 * нормализованные координаты и событие fire, не меняя игровую логику.
 */
class MouseInput {
  constructor(canvas) { this.canvas = canvas; this.point = { x: 0.5, y: 0.5 }; this.onMove = null; this.onFire = null; }
  start(onMove, onFire) {
    this.onMove = onMove; this.onFire = onFire;
    this.canvas.addEventListener('pointermove', e => this.move(e));
    this.canvas.addEventListener('pointerdown', e => { this.move(e); if (this.onFire) this.onFire(this.point); });
  }
  move(e) {
    const r = this.canvas.getBoundingClientRect();
    this.point = { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
    if (this.onMove) this.onMove(this.point);
  }
}

// Будущий Android-ввод будет иметь тот же контракт:
// window.gameInput = new PhoneInput({ onMove, onFire });
// Телефон будет отправлять x/y в диапазоне 0..1 через WebSocket/WebRTC/HTTP.
window.gameInput = new MouseInput(document.getElementById('gameCanvas'));
