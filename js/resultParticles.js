/** 胜利面板周围的少量金色粒子 */
export class ResultParticles {
  /**
   * @param {HTMLCanvasElement | null} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext("2d") ?? null;
    /** @type {{ x: number, y: number, vx: number, vy: number, life: number, maxLife: number, size: number }[]} */
    this.particles = [];
    this.running = false;
    this.rafId = 0;
    /** @type {DOMRect | null} */
    this.cardRect = null;
  }

  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w <= 0 || h <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** @param {HTMLElement | null} card */
  setCard(card) {
    if (!card || !this.canvas?.parentElement) {
      this.cardRect = null;
      return;
    }
    const overlay = this.canvas.parentElement;
    const overlayRect = overlay.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    this.cardRect = new DOMRect(
      cardRect.left - overlayRect.left,
      cardRect.top - overlayRect.top,
      cardRect.width,
      cardRect.height
    );
  }

  _spawn() {
    const r = this.cardRect;
    if (!r) return;

    const pad = 18;
    const side = Math.floor(Math.random() * 4);
    let x = 0;
    let y = 0;

    if (side === 0) {
      x = r.left + Math.random() * r.width;
      y = r.top - pad;
    } else if (side === 1) {
      x = r.right + pad;
      y = r.top + Math.random() * r.height;
    } else if (side === 2) {
      x = r.left + Math.random() * r.width;
      y = r.bottom + pad;
    } else {
      x = r.left - pad;
      y = r.top + Math.random() * r.height;
    }

    const angle = Math.random() * Math.PI * 2;
    const speed = 0.3 + Math.random() * 0.7;
    const maxLife = 40 + Math.random() * 50;

    this.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.15,
      life: maxLife,
      maxLife,
      size: 1.5 + Math.random() * 2.5,
    });

    if (this.particles.length > 48) {
      this.particles.shift();
    }
  }

  _tick() {
    if (!this.ctx || !this.canvas) return;

    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.ctx.clearRect(0, 0, w, h);

    if (Math.random() < 0.55) this._spawn();

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      const t = p.life / p.maxLife;
      const alpha = t * 0.85;
      const grad = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
      grad.addColorStop(0, `rgba(255, 230, 140, ${alpha})`);
      grad.addColorStop(0.5, `rgba(232, 197, 71, ${alpha * 0.6})`);
      grad.addColorStop(1, "rgba(232, 197, 71, 0)");

      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  _loop = () => {
    if (!this.running) return;
    this._tick();
    this.rafId = requestAnimationFrame(this._loop);
  };

  /** @param {HTMLElement | null} card */
  start(card) {
    if (!this.canvas || !this.ctx) return;
    this.stop();
    this.resize();
    this.setCard(card);
    this.particles = [];
    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.particles = [];
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    }
  }
}
