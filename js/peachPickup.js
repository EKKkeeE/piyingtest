const PEACH_SRC = "assets/effects/pantao.png";
const SPAWN_INTERVAL_SEC = 8;
const LIFETIME_SEC = 4;
const HEAL_AMOUNT = 40;
const HIT_RADIUS = 54;

/**
 * @param {DOMRect} stageRect
 */
function randomStagePoint(stageRect) {
  const padX = Math.max(96, stageRect.width * 0.14);
  const padY = Math.max(48, stageRect.height * 0.05);
  const minY = stageRect.height * 0.56;
  const maxY = stageRect.height * 0.88;
  return {
    x: padX + Math.random() * Math.max(1, stageRect.width - padX * 2),
    y: minY + Math.random() * Math.max(1, maxY - minY - padY),
  };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function hitsPickup(item, playerPoints) {
  if (!playerPoints?.length) return false;
  return playerPoints.some((point) => dist(item, point) <= HIT_RADIUS);
}

/** 蟠桃拾取：定时刷新，触碰后回血。 */
export class PeachPickupManager {
  /**
   * @param {HTMLElement | null} layer
   */
  constructor(layer) {
    this.layer = layer;
    /** @type {Array<{ el: HTMLElement, x: number, y: number, age: number }>} */
    this.pickups = [];
    this.spawnTimer = 0;
  }

  reset() {
    this.clear();
    this.spawnTimer = 0;
  }

  clear() {
    for (const item of this.pickups) {
      item.el.remove();
    }
    this.pickups = [];
  }

  /**
   * @param {DOMRect} stageRect
   */
  spawn(stageRect) {
    if (!this.layer || !stageRect?.width || this.pickups.length > 0) return;

    const point = randomStagePoint(stageRect);

    const el = document.createElement("div");
    el.className = "peach-pickup";
    el.style.left = `${point.x}px`;
    el.style.top = `${point.y}px`;

    const body = document.createElement("div");
    body.className = "peach-pickup-body";

    for (let i = 0; i < 3; i += 1) {
      const plus = document.createElement("span");
      plus.className = `peach-plus peach-plus-${i + 1}`;
      plus.textContent = "+";
      plus.setAttribute("aria-hidden", "true");
      body.appendChild(plus);
    }

    const img = document.createElement("img");
    img.className = "peach-pickup-img";
    img.src = PEACH_SRC;
    img.alt = "蟠桃";
    img.draggable = false;
    body.appendChild(img);

    el.appendChild(body);
    this.layer.appendChild(el);
    this.pickups.push({ el, x: point.x, y: point.y, age: 0 });
  }

  /**
   * @param {number} dt
   * @param {DOMRect} stageRect
   * @param {Array<{ x: number, y: number }>} playerPoints
   * @param {{ onHeal?: (amount: number) => boolean }} handlers
   */
  update(dt, stageRect, playerPoints, handlers = {}) {
    if (!stageRect?.width) return;

    this.spawnTimer += dt;
    if (this.pickups.length === 0 && this.spawnTimer >= SPAWN_INTERVAL_SEC) {
      this.spawn(stageRect);
      this.spawnTimer = 0;
    }

    const remaining = [];
    for (const item of this.pickups) {
      item.age += dt;
      if (item.age >= LIFETIME_SEC) {
        item.el.remove();
        continue;
      }

      if (hitsPickup(item, playerPoints)) {
        handlers.onHeal?.(HEAL_AMOUNT);
        item.el.remove();
        continue;
      }

      remaining.push(item);
    }
    this.pickups = remaining;
  }
}
