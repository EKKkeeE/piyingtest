import { projectileHitsPoints } from "./utils.js";

const DAMAGE = 10;
const SPEED = 160;
const HIT_RADIUS = 46;
const LIFETIME = 2;
const QI_SRC = "assets/effects/sword-qi.png";
const QI_DISPLAY = 142;
const QI_PIVOT_X = QI_DISPLAY * 0.9;
const QI_PIVOT_Y = QI_DISPLAY * 0.5;

/**
 * 小兵剑气：发射时瞄准主角，沿直线飞行，不追踪。
 */
export class EnemySwordQiManager {
  /**
   * @param {HTMLElement | null} layer
   */
  constructor(layer) {
    this.layer = layer;
    /** @type {Array<{ el: HTMLElement, x: number, y: number, vx: number, vy: number, angleDeg: number, age: number }>} */
    this.projectiles = [];
  }

  clear() {
    for (const p of this.projectiles) {
      p.el.remove();
    }
    this.projectiles = [];
  }

  /**
   * @param {{ x: number, y: number }} origin
   * @param {{ x: number, y: number }} target
   */
  spawn(origin, target) {
    if (!this.layer || !origin || !target) return;
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dist = Math.hypot(dx, dy) || 1;
    const vx = (dx / dist) * SPEED;
    const vy = (dy / dist) * SPEED;
    const flightDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const angleDeg = flightDeg;

    const el = document.createElement("div");
    el.className = "enemy-sword-qi";
    const img = document.createElement("img");
    img.className = "enemy-sword-qi-img";
    img.src = QI_SRC;
    img.alt = "";
    img.draggable = false;
    el.appendChild(img);
    this.layer.appendChild(el);

    this.projectiles.push({
      el,
      x: origin.x,
      y: origin.y,
      vx,
      vy,
      angleDeg,
      age: 0,
    });
  }

  /**
   * @param {number} dt
   * @param {Array<{ x: number, y: number }>} playerPoints
   * @param {(amount: number) => boolean} onHit
   */
  update(dt, playerPoints, onHit) {
    const next = [];
    for (const p of this.projectiles) {
      p.age += dt;
      if (p.age >= LIFETIME) {
        p.el.remove();
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.el.style.transform = `translate(${p.x - QI_PIVOT_X}px, ${p.y - QI_PIVOT_Y}px) rotate(${p.angleDeg}deg)`;

      if (projectileHitsPoints(p, playerPoints, HIT_RADIUS)) {
        onHit(DAMAGE);
        p.el.remove();
        continue;
      }

      next.push(p);
    }
    this.projectiles = next;
  }
}
