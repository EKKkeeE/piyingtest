const DAMAGE = 5;
const SPEED = 210;
const HIT_RADIUS = 56;
const LIFETIME = 3;
const LAUNCH_SPEED = 0.55;
const HOMING = 5.2;
const FIRE_SRC = "assets/effects/ghost-fire.png";
const FIRE_HEIGHT = 114;
const FIRE_WIDTH = Math.round(FIRE_HEIGHT * (182 / 315));
const FIRE_PIVOT_X = FIRE_WIDTH * 0.5;
const FIRE_PIVOT_Y = FIRE_HEIGHT * 0.92;
const TAIL_LEN_BASE = 70;
const TAIL_LEN_SPEED = 86;

function fireRotationDeg(vx, vy) {
  return (Math.atan2(vy, vx) * 180) / Math.PI - 90;
}

/**
 * 白骨精鬼火：自 Boss 射出、追击主角的投射物。
 */
export class BossGhostFireManager {
  /**
   * @param {HTMLElement | null} layer
   */
  constructor(layer) {
    this.layer = layer;
    /** @type {Array<{ el: HTMLElement, x: number, y: number, vx: number, vy: number, age: number, phase: number }>} */
    this.projectiles = [];
  }

  clear() {
    for (const p of this.projectiles) {
      p.el.remove();
    }
    this.projectiles = [];
  }

  /**
   * @param {Array<{ x: number, y: number, launchAngleOffset?: number }>} spawns 各鬼火发射点与初始角度偏移（弧度）
   * @param {{ x: number, y: number } | null} playerTarget
   */
  spawnBurst(spawns, playerTarget) {
    if (!this.layer || !spawns?.length) return;

    for (const spawn of spawns) {
      const { x, y, launchAngleOffset = 0 } = spawn;
      const baseAngle = playerTarget
        ? Math.atan2(playerTarget.y - y, playerTarget.x - x)
        : Math.PI;
      const angle = baseAngle + launchAngleOffset;
      const vx = Math.cos(angle) * SPEED * LAUNCH_SPEED;
      const vy = Math.sin(angle) * SPEED * LAUNCH_SPEED;

      const el = document.createElement("div");
      el.className = "boss-ghost-fire";
      el.style.setProperty("--fire-w", `${FIRE_WIDTH}px`);
      el.style.setProperty("--fire-h", `${FIRE_HEIGHT}px`);

      const tail = document.createElement("div");
      tail.className = "boss-ghost-fire-tail";
      const glow = document.createElement("div");
      glow.className = "boss-ghost-fire-glow";
      const core = document.createElement("div");
      core.className = "boss-ghost-fire-core";
      const img = document.createElement("img");
      img.className = "boss-ghost-fire-img";
      img.src = FIRE_SRC;
      img.alt = "";
      img.draggable = false;

      el.appendChild(tail);
      el.appendChild(glow);
      el.appendChild(core);
      el.appendChild(img);
      this.layer.appendChild(el);

      this.projectiles.push({
        el,
        x,
        y,
        vx,
        vy,
        age: 0,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  _applyMotionStyle(p) {
    const speed = Math.hypot(p.vx, p.vy);
    const speedRatio = Math.min(1, speed / SPEED);
    const lifeFade = Math.max(0, 1 - p.age / LIFETIME);
    const tailLen = (TAIL_LEN_BASE + speedRatio * TAIL_LEN_SPEED) * (0.72 + lifeFade * 0.28);
    const tailW = 30 + speedRatio * 22;
    const pulse = 1 + Math.sin(p.age * 22 + p.phase) * 0.09;
    const wobble = Math.sin(p.age * 15 + p.phase) * 4.5;
    const sway = Math.sin(p.age * 10.5 + p.phase * 1.3) * 7;
    const stretch = 1 + speedRatio * 0.12;

    p.el.style.setProperty("--tail-len", `${tailLen}px`);
    p.el.style.setProperty("--tail-w", `${tailW}px`);
    p.el.style.setProperty("--tail-sway", `${sway}deg`);
    p.el.style.setProperty("--fire-pulse", String(pulse));
    p.el.style.setProperty("--fire-stretch", String(stretch));
    p.el.style.setProperty("--fire-alpha", String(0.82 + lifeFade * 0.18));

    const angleDeg = fireRotationDeg(p.vx, p.vy);
    p.el.style.transform = [
      `translate(${p.x - FIRE_PIVOT_X}px, ${p.y - FIRE_PIVOT_Y + wobble}px)`,
      `rotate(${angleDeg}deg)`,
      `scale(${pulse}, ${pulse * stretch})`,
    ].join(" ");
  }

  /**
   * @param {number} dt
   * @param {{ x: number, y: number } | null} playerTarget
   * @param {(amount: number) => boolean} onHit
   */
  update(dt, playerTarget, onHit) {
    const next = [];
    for (const p of this.projectiles) {
      p.age += dt;
      if (p.age >= LIFETIME) {
        p.el.remove();
        continue;
      }

      if (playerTarget) {
        const dx = playerTarget.x - p.x;
        const dy = playerTarget.y - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        const desiredVx = (dx / dist) * SPEED;
        const desiredVy = (dy / dist) * SPEED;
        const blend = Math.min(1, dt * HOMING);
        p.vx += (desiredVx - p.vx) * blend;
        p.vy += (desiredVy - p.vy) * blend;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      this._applyMotionStyle(p);

      if (playerTarget && Math.hypot(playerTarget.x - p.x, playerTarget.y - p.y) <= HIT_RADIUS) {
        onHit(DAMAGE);
        p.el.remove();
        continue;
      }

      next.push(p);
    }
    this.projectiles = next;
  }

  get activeCount() {
    return this.projectiles.length;
  }
}
