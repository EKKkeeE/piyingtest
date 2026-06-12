import { getStaffGlowPath } from "./staffPath.js";

/** 整体不透明度系数（略透明，便于透出棒身） */
const GLOW_OPACITY = 0.82;

/**
 * 比耶时沿金箍棒绘制包裹金光。
 */
export class StaffGlow {
  /**
   * @param {HTMLCanvasElement | null} canvas
   * @param {HTMLElement} stageLayer
   */
  constructor(canvas, stageLayer) {
    this.canvas = canvas;
    this.stageLayer = stageLayer;
    this.ctx = canvas?.getContext("2d") ?? null;
    this._w = 0;
    this._h = 0;
    this._intensity = 0;
    this._time = 0;
  }

  resize() {
    if (!this.canvas || !this.stageLayer) return;
    const rect = this.stageLayer.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._w = rect.width;
    this._h = rect.height;
  }

  /**
   * @param {number} dt
   * @param {{ active: boolean, playerRig: import('./puppetRig.js').PuppetRig, stageRect: DOMRect }} opts
   */
  draw(dt, opts) {
    const ctx = this.ctx;
    if (!ctx || !this._w) return;

    const target = opts.active ? 1 : 0;
    this._intensity += (target - this._intensity) * Math.min(1, dt * 10);
    this._time += dt;

    ctx.clearRect(0, 0, this._w, this._h);
    if (this._intensity < 0.02) return;

    const path = getStaffGlowPath(opts.playerRig, opts.stageRect);
    if (path.length < 2) return;

    const totalLen = this._pathLength(path);
    if (totalLen < 12) return;

    const alpha = this._intensity * GLOW_OPACITY;
    const sizeScale = Math.max(0.85, Math.min(1.8, totalLen / 200));

    this._drawAura(ctx, path, totalLen, alpha, sizeScale);
    this._drawCore(ctx, path, alpha, sizeScale);
    this._drawSparks(ctx, path, totalLen, alpha, sizeScale);
  }

  /** @param {Array<{ x: number, y: number }>} path */
  _pathLength(path) {
    let len = 0;
    for (let i = 1; i < path.length; i++) {
      len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    }
    return len;
  }

  /**
   * @param {Array<{ x: number, y: number }>} path
   * @returns {{ x: number, y: number, ux: number, uy: number, px: number, py: number } | null}
   */
  _pointAt(path, totalLen, dist) {
    let acc = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (acc + seg >= dist) {
        const t = seg > 0 ? (dist - acc) / seg : 0;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const ux = seg > 0 ? (b.x - a.x) / seg : 0;
        const uy = seg > 0 ? (b.y - a.y) / seg : 0;
        return { x, y, ux, uy, px: -uy, py: ux };
      }
      acc += seg;
    }
    const last = path[path.length - 1];
    const prev = path[path.length - 2];
    const seg = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
    return {
      x: last.x,
      y: last.y,
      ux: (last.x - prev.x) / seg,
      uy: (last.y - prev.y) / seg,
      px: -(last.y - prev.y) / seg,
      py: (last.x - prev.x) / seg,
    };
  }

  /** @param {Array<{ x: number, y: number }>} path */
  _strokePath(ctx, path, draw) {
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y);
    }
    draw();
  }

  _drawAura(ctx, path, totalLen, alpha, sizeScale) {
    const layers = [
      { width: 26 * sizeScale, color: "rgba(255, 200, 60, 0.13)", blur: 20 * sizeScale },
      { width: 16 * sizeScale, color: "rgba(255, 220, 90, 0.23)", blur: 12 * sizeScale },
      { width: 8 * sizeScale, color: "rgba(255, 240, 150, 0.36)", blur: 6 * sizeScale },
    ];

    for (const layer of layers) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = layer.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(255, 210, 70, 0.68)";
      ctx.shadowBlur = layer.blur;
      this._strokePath(ctx, path, () => ctx.stroke());
      ctx.restore();
    }

    const pulse = 0.55 + Math.sin(this._time * 6) * 0.45;
    ctx.save();
    ctx.globalAlpha = alpha * 0.3 * pulse;
    ctx.fillStyle = "rgba(255, 235, 130, 0.45)";
    ctx.shadowColor = "rgba(255, 200, 50, 0.72)";
    ctx.shadowBlur = 14 * sizeScale;
    for (let d = totalLen * 0.04; d <= totalLen * 0.96; d += totalLen * 0.11) {
      const p = this._pointAt(path, totalLen, d);
      if (!p) continue;
      const wobble = Math.sin(this._time * 8 + d * 0.05) * 2.5 * sizeScale;
      ctx.beginPath();
      ctx.ellipse(
        p.x + p.px * wobble,
        p.y + p.py * wobble,
        (9 + pulse * 3) * sizeScale,
        (4.5 + pulse * 1.5) * sizeScale,
        Math.atan2(p.uy, p.ux),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.restore();
  }

  _drawCore(ctx, path, alpha, sizeScale) {
    const tip = path[path.length - 1];
    const base = path[0];
    const grad = ctx.createLinearGradient(base.x, base.y, tip.x, tip.y);
    grad.addColorStop(0, `rgba(255, 245, 190, ${0.14 * alpha})`);
    grad.addColorStop(0.35, `rgba(255, 230, 110, ${0.48 * alpha})`);
    grad.addColorStop(0.7, `rgba(255, 210, 70, ${0.65 * alpha})`);
    grad.addColorStop(1, `rgba(255, 255, 220, ${0.76 * alpha})`);

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3.5 * sizeScale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(255, 240, 160, 0.78)";
    ctx.shadowBlur = 9 * sizeScale;
    this._strokePath(ctx, path, () => ctx.stroke());
    ctx.restore();
  }

  _drawSparks(ctx, path, totalLen, alpha, sizeScale) {
    const count = 14;
    ctx.save();
    for (let i = 0; i < count; i++) {
      const phase = (this._time * 1.6 + i * 0.13) % 1;
      const d = totalLen * phase;
      const p = this._pointAt(path, totalLen, d);
      if (!p) continue;
      const orbit = Math.sin(this._time * 10 + i * 1.7) * 5 * sizeScale;
      const sx = p.x + p.px * orbit;
      const sy = p.y + p.py * orbit;
      const sparkAlpha = alpha * (1 - Math.abs(phase - 0.5) * 1.6);
      if (sparkAlpha <= 0) continue;

      const r = (1.1 + (i % 3) * 0.55) * sizeScale;
      ctx.globalAlpha = sparkAlpha;
      ctx.fillStyle = i % 2 === 0 ? "#fff6c8" : "#ffd84a";
      ctx.shadowColor = "rgba(255, 220, 80, 0.75)";
      ctx.shadowBlur = 5 * sizeScale;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
