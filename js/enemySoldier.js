/** 躯干锚点：body 贴图左上角相对角色根节点 */
const BODY = { x: -191, y: -620 };

/**
 * 躯干关节（body.png 局部坐标）
 * 肩：肩甲孔对齐；髋：裙摆下沿挂腿
 */
const BODY_JOINTS = {
  shoulder_l: [54, 248],
  shoulder_r: [321, 338],
  hip_l: [120, 535],
  hip_r: [246, 535],
};

/** 各部件贴图内挂点（孔位或肩甲下缘） */
const PART_ATTACH = {
  armSword: [305, 50],
  armFree: [68, 38],
  legBack: [111, 0],
  legFront: [94, 18],
};

function partPos(attach, joint) {
  return {
    x: BODY.x + joint[0] - attach[0],
    y: BODY.y + joint[1] - attach[1],
  };
}

const PARTS = {
  body: {
    src: "assets/minion/body.png",
    width: 382,
    height: 650,
    x: BODY.x,
    y: BODY.y,
    z: 5,
  },
  legBack: {
    src: "assets/minion/leg_back.png",
    width: 204,
    height: 300,
    ...partPos(PART_ATTACH.legBack, BODY_JOINTS.hip_l),
    origin: PART_ATTACH.legBack,
    z: 1,
  },
  legFront: {
    src: "assets/minion/leg_front.png",
    width: 207,
    height: 303,
    ...partPos(PART_ATTACH.legFront, BODY_JOINTS.hip_r),
    origin: PART_ATTACH.legFront,
    z: 2,
  },
  armSword: {
    src: "assets/minion/arm_sword.png",
    width: 371,
    height: 519,
    ...partPos(PART_ATTACH.armSword, BODY_JOINTS.shoulder_l),
    origin: PART_ATTACH.armSword,
    z: 3,
  },
  armFree: {
    src: "assets/minion/arm_free.png",
    width: 120,
    height: 348,
    ...partPos(PART_ATTACH.armFree, BODY_JOINTS.shoulder_r),
    origin: PART_ATTACH.armFree,
    z: 4,
  },
};

const MAX_HP = 30;
const ATTACK_INTERVAL_SEC = 1.2;
const ATTACK_DURATION_SEC = 0.42;
const ATTACK_QI_RELEASE = 0.36;
const SWORD_PIVOT = PART_ATTACH.armSword;
/** 刀尖在 arm_sword 贴图局部坐标中的近似位置 */
const SWORD_TIP = [58, 462];
const STAND_DELAY_SEC = 0.45;
const WALK_SPEED = 85;
const WALK_SWING_SPEED = 6.5;
const DROP_SPEED = 340;
const HIT_ZONE = { w: 250, h: 405 };

function distPointToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

function segmentsCross(a, b, c, d) {
  const det = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(det) < 1e-9) return false;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / det;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / det;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function segmentIntersectsRect(a, b, minX, minY, maxX, maxY) {
  if (
    a.x >= minX &&
    a.x <= maxX &&
    a.y >= minY &&
    a.y <= maxY
  ) {
    return true;
  }
  if (
    b.x >= minX &&
    b.x <= maxX &&
    b.y >= minY &&
    b.y <= maxY
  ) {
    return true;
  }
  const edges = [
    [
      { x: minX, y: minY },
      { x: maxX, y: minY },
    ],
    [
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
    ],
    [
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ],
    [
      { x: minX, y: maxY },
      { x: minX, y: minY },
    ],
  ];
  return edges.some(([c, d]) => segmentsCross(a, b, c, d));
}
const ANCHOR_REACH_DIST = 6;

/** 吊线挂点：部件贴图局部坐标（头、双臂、双脚） */
const MINION_STRING_ATTACH = [
  { part: "body", local: [191, 118] },
  { part: "armSword", local: [210, 300] },
  { part: "armFree", local: [58, 260] },
  { part: "legBack", local: [72, 296] },
  { part: "legFront", local: [58, 300] },
];

function swordAttackDeg(progress) {
  const p = Math.max(0, Math.min(1, progress));
  if (p < 0.35) {
    const t = p / 0.35;
    return -18 + (65 - -18) * t;
  }
  if (p < 0.7) {
    const t = (p - 0.35) / 0.35;
    return 65 + (-105 - 65) * t;
  }
  const t = (p - 0.7) / 0.3;
  return -105 + (-15 - -105) * t;
}

function attackFreeArmDeg(progress) {
  const p = Math.max(0, Math.min(1, progress));
  if (p < 0.35) return -24 + (p / 0.35) * 4;
  if (p < 0.7) return -20 + ((p - 0.35) / 0.35) * 18;
  return -2 - ((p - 0.7) / 0.3) * 14;
}

function attackBodyOffset(progress) {
  const p = Math.max(0, Math.min(1, progress));
  if (p < 0.35) {
    const t = p / 0.35;
    return { x: -t * 10, y: t * 6 };
  }
  if (p < 0.7) {
    const t = (p - 0.35) / 0.35;
    return { x: -10 + t * 26, y: 6 - t * 10 };
  }
  const t = (p - 0.7) / 0.3;
  return { x: 16 - t * 16, y: -4 + t * 4 };
}

/** @param {DOMRect} stageRect */
function getStandAnchorBounds(stageRect) {
  const padX = Math.max(48, stageRect.width * 0.04);
  const curtainRightPad = Math.max(56, stageRect.width * 0.09);
  const minX = stageRect.width * 0.52 + padX * 0.5;
  const maxX = stageRect.width - curtainRightPad - padX * 0.5;
  const minY = stageRect.height * 0.58;
  const maxY = stageRect.height * 0.92;
  return { minX, maxX, minY, maxY };
}

/** @param {DOMRect} stageRect */
function pickStandAnchor(stageRect) {
  const { minX, maxX, minY, maxY } = getStandAnchorBounds(stageRect);
  const spanX = Math.max(80, maxX - minX);
  return {
    x: minX + Math.random() * spanX,
    y: minY + Math.random() * Math.max(1, maxY - minY),
  };
}

/**
 * @param {DOMRect} stageRect
 * @param {number} minX
 * @param {number} maxX
 * @param {number} minY
 * @param {number} maxY
 */
function pickStandAnchorInZone(stageRect, minX, maxX, minY, maxY) {
  const spanX = Math.max(40, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  return {
    x: minX + Math.random() * spanX,
    y: minY + Math.random() * spanY,
  };
}

/** @param {DOMRect} stageRect @param {number} fromX */
function pickForwardStandAnchor(stageRect, fromX) {
  const { minX, maxX, minY, maxY } = getStandAnchorBounds(stageRect);
  // 小兵面向左侧（玩家方向），向前 = x 减小
  const forwardMaxX = fromX - 24;
  if (forwardMaxX > minX + 36) {
    return pickStandAnchorInZone(stageRect, minX, forwardMaxX, minY, maxY);
  }
  return pickStandAnchorInZone(
    stageRect,
    minX,
    Math.max(minX + 36, Math.min(fromX, maxX)),
    minY,
    maxY
  );
}

function anchorDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * @param {{ x: number, y: number }} anchor
 * @param {Array<{ x: number, y: number }>} others
 * @param {number} minDist
 * @param {number} minXDist
 */
function isAnchorSeparated(anchor, others, minDist, minXDist) {
  for (const other of others) {
    if (anchorDistance(anchor, other) < minDist) return false;
    if (Math.abs(anchor.x - other.x) < minXDist) return false;
  }
  return true;
}

/**
 * @param {number} minX
 * @param {number} maxX
 * @param {number} minY
 * @param {number} maxY
 * @param {Array<{ x: number, y: number }>} avoidPoints
 * @param {number} excludeRadius
 */
function isSpawnZoneFree(minX, maxX, minY, maxY, avoidPoints, excludeRadius) {
  if (!avoidPoints.length) return true;
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const halfW = (maxX - minX) * 0.5;
  const halfH = (maxY - minY) * 0.5;
  for (const point of avoidPoints) {
    const dx = Math.abs(point.x - cx);
    const dy = Math.abs(point.y - cy);
    const edgeDist = Math.hypot(Math.max(0, dx - halfW), Math.max(0, dy - halfH));
    if (edgeDist < excludeRadius) return false;
    if (Math.hypot(point.x - cx, point.y - cy) < excludeRadius + Math.min(halfW, halfH) * 0.35) {
      return false;
    }
  }
  return true;
}

/**
 * @param {Array<[number, number]>} xZones
 * @param {Array<[number, number]>} yZones
 * @param {Array<{ x: number, y: number }>} avoidPoints
 * @param {number} excludeRadius
 */
function getAvailableSpawnSlots(xZones, yZones, avoidPoints, excludeRadius) {
  /** @type {Array<{ xi: number, yi: number, cx: number, cy: number }>} */
  const slots = [];
  for (let xi = 0; xi < xZones.length; xi += 1) {
    for (let yi = 0; yi < yZones.length; yi += 1) {
      const [x0, x1] = xZones[xi];
      const [y0, y1] = yZones[yi];
      if (!isSpawnZoneFree(x0, x1, y0, y1, avoidPoints, excludeRadius)) continue;
      slots.push({
        xi,
        yi,
        cx: (x0 + x1) * 0.5,
        cy: (y0 + y1) * 0.5,
      });
    }
  }
  return slots;
}

/**
 * @param {Array<{ xi: number, yi: number, cx: number, cy: number }>} slots
 * @param {Array<[number, number]>} xZones
 * @param {Array<[number, number]>} yZones
 * @param {DOMRect} stageRect
 */
function pickAnchorsFromSlots(slots, xZones, yZones, stageRect) {
  if (slots.length === 1) {
    const slot = slots[0];
    return [
      pickStandAnchorInZone(
        stageRect,
        xZones[slot.xi][0],
        xZones[slot.xi][1],
        yZones[slot.yi][0],
        yZones[slot.yi][1]
      ),
    ];
  }

  let bestA = slots[0];
  let bestB = slots[1];
  let bestDist = -1;
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      const dist = anchorDistance(slots[i], slots[j]);
      if (dist > bestDist) {
        bestDist = dist;
        bestA = slots[i];
        bestB = slots[j];
      }
    }
  }

  const toAnchor = (slot) =>
    pickStandAnchorInZone(
      stageRect,
      xZones[slot.xi][0],
      xZones[slot.xi][1],
      yZones[slot.yi][0],
      yZones[slot.yi][1]
    );

  return Math.random() < 0.5
    ? [toAnchor(bestA), toAnchor(bestB)]
    : [toAnchor(bestB), toAnchor(bestA)];
}

/** @param {DOMRect} stageRect @param {number} count @param {Array<{ x: number, y: number }>} [avoidPoints] */
export function pickDistinctStandAnchors(stageRect, count, avoidPoints = []) {
  const { minX, maxX, minY, maxY } = getStandAnchorBounds(stageRect);
  const spanX = Math.max(80, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const minDistWithinWave = Math.max(280, spanX * 0.52, spanY * 0.44);
  const minXDistWithinWave = Math.max(180, spanX * 0.36);
  const excludeExistingRadius = Math.max(320, spanX * 0.62, spanY * 0.52);
  const occupied = [...avoidPoints];

  const xZones = [
    [minX, minX + spanX * 0.3],
    [minX + spanX * 0.35, minX + spanX * 0.65],
    [minX + spanX * 0.7, maxX],
  ];
  const yZones = [
    [minY, minY + spanY * 0.48],
    [minY + spanY * 0.52, maxY],
  ];

  if (count >= 2) {
    const slots = getAvailableSpawnSlots(xZones, yZones, occupied, excludeExistingRadius);
    if (slots.length >= 2) {
      for (let tries = 0; tries < 24; tries += 1) {
        const anchors = pickAnchorsFromSlots(slots, xZones, yZones, stageRect);
        if (
          isAnchorSeparated(anchors[0], occupied, excludeExistingRadius, minXDistWithinWave) &&
          isAnchorSeparated(
            anchors[1],
            [...occupied, anchors[0]],
            excludeExistingRadius,
            minXDistWithinWave
          ) &&
          isAnchorSeparated(anchors[0], [anchors[1]], minDistWithinWave, minXDistWithinWave)
        ) {
          return anchors;
        }
      }
    }
  } else if (count === 1) {
    const slots = getAvailableSpawnSlots(xZones, yZones, occupied, excludeExistingRadius);
    if (slots.length) {
      for (let tries = 0; tries < 24; tries += 1) {
        const slot = slots[Math.floor(Math.random() * slots.length)];
        const anchor = pickStandAnchorInZone(
          stageRect,
          xZones[slot.xi][0],
          xZones[slot.xi][1],
          yZones[slot.yi][0],
          yZones[slot.yi][1]
        );
        if (isAnchorSeparated(anchor, occupied, excludeExistingRadius, minXDistWithinWave)) {
          return [anchor];
        }
      }
    }
  }

  for (let tries = 0; tries < 80; tries += 1) {
    const anchors = [];
    for (let i = 0; i < count; i += 1) {
      let anchor = pickStandAnchor(stageRect);
      let inner = 0;
      while (
        inner < 24 &&
        !isAnchorSeparated(
          anchor,
          [...occupied, ...anchors],
          excludeExistingRadius,
          minXDistWithinWave
        )
      ) {
        anchor = pickStandAnchor(stageRect);
        inner += 1;
      }
      anchors.push(anchor);
    }
    if (
      count < 2 ||
      isAnchorSeparated(anchors[0], [anchors[1]], minDistWithinWave, minXDistWithinWave)
    ) {
      return anchors;
    }
  }

  const anchors = [];
  for (let i = 0; i < count; i += 1) {
    anchors.push(pickStandAnchor(stageRect));
  }
  return anchors;
}

export class EnemySoldier {
  /**
   * @param {HTMLElement | null} layer
   * @param {(origin: { x: number, y: number }, target: { x: number, y: number }, swordDeg: number) => void} [onSpawnSwordQi]
   */
  constructor(layer, onSpawnSwordQi) {
    this.layer = layer;
    this.onSpawnSwordQi = onSpawnSwordQi ?? null;
    this.root = null;
    this.parts = {};
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.anchorX = 0;
    this.anchorY = 0;
    this.phase = "move";
    this.standTimer = 0;
    this.scale = 0.3;
    this.time = 0;
    this.speed = WALK_SPEED;
    this.hp = MAX_HP;
    this.maxHp = MAX_HP;
    this.attackTimer = 0;
    this.attackElapsed = 0;
    this.attacking = false;
    this.attackQiSpawned = false;
    this.walking = false;
    this.hpFill = null;
    this.assembly = null;
    this._hitTimer = 0;
    this._deathTimer = 0;
    this._partRot = {};
    this._displayBob = 0;
    this._attackOffsetX = 0;
    this._attackOffsetY = 0;
    this._lastDt = 0;
    this._playerPoint = null;
    this._stageRect = null;
    this._firstHitReacted = false;
    this._retaliateThenMove = false;
    this.entry = "walk";
    this.dropSpeed = DROP_SPEED;
    this._mount();
  }

  _mount() {
    if (!this.layer) return;
    this.root = document.createElement("div");
    this.root.className = "enemy-soldier";
    this.layer.appendChild(this.root);

    this.assembly = document.createElement("div");
    this.assembly.className = "enemy-assembly";
    this.root.appendChild(this.assembly);

    const hp = document.createElement("div");
    hp.className = "enemy-hp";
    const hpFill = document.createElement("div");
    hpFill.className = "enemy-hp-fill";
    hp.appendChild(hpFill);
    this.root.appendChild(hp);
    this.hpFill = hpFill;

    for (const [name, spec] of Object.entries(PARTS)) {
      const img = document.createElement("img");
      img.className = `enemy-part enemy-part-${name}`;
      img.src = spec.src;
      img.alt = "";
      img.draggable = false;
      img.style.width = `${spec.width}px`;
      img.style.height = `${spec.height}px`;
      img.style.left = `${spec.x}px`;
      img.style.top = `${spec.y}px`;
      img.style.zIndex = String(spec.z);
      if (spec.origin) {
        img.style.transformOrigin = `${spec.origin[0]}px ${spec.origin[1]}px`;
      }
      this.assembly.appendChild(img);
      this.parts[name] = img;
    }
  }

  /**
   * @param {DOMRect} stageRect
   * @param {{
   *   anchor?: { x: number, y: number },
   *   entry?: "walk" | "drop",
   * }} [options]
   */
  spawn(stageRect, options = {}) {
    if (!this.root || !stageRect) return;
    this.scale = Math.min(0.36, Math.max(0.27, stageRect.height / 2700));
    const anchor = options.anchor ?? pickStandAnchor(stageRect);
    const entry = options.entry === "drop" ? "drop" : "walk";
    this.entry = entry;
    this.anchorX = anchor.x;
    this.anchorY = anchor.y;

    if (entry === "drop") {
      this.x = anchor.x;
      this.y = -Math.max(120, stageRect.height * 0.12);
      this.phase = "drop";
    } else {
      this.x = stageRect.width + 70;
      this.y = anchor.y;
      this.phase = "move";
    }

    this.standTimer = 0;
    this.time = 0;
    this.hp = MAX_HP;
    this.attackTimer = 0;
    this.attackElapsed = 0;
    this.attacking = false;
    this.attackQiSpawned = false;
    this.walking = false;
    this._partRot = {};
    this._displayBob = 0;
    this._attackOffsetX = 0;
    this._attackOffsetY = 0;
    this._lastDt = 0;
    this._firstHitReacted = false;
    this._retaliateThenMove = false;
    this.active = true;
    clearTimeout(this._hitTimer);
    clearTimeout(this._deathTimer);
    this.root.classList.add("active");
    this.root.classList.remove("enemy-dead", "enemy-hit", "enemy-entry-drop");
    if (entry === "drop") {
      this.root.classList.add("enemy-entry-drop");
    }
    this.assembly?.classList.remove("enemy-assembly-hit");
    this._updateHp();
    this._render();
  }

  /** @param {boolean} [immediateAttack] */
  _enterStandReadyToAttack(immediateAttack = false) {
    this.phase = "stand";
    this.standTimer = immediateAttack ? STAND_DELAY_SEC : 0;
    this.attackTimer = ATTACK_INTERVAL_SEC;
    this.root?.classList.remove("enemy-entry-drop");
    if (this.assembly) {
      this.assembly.style.transform = "";
    }
  }

  /**
   * @param {number} dt
   * @param {{ x: number, y: number } | null | undefined} playerPoint
   * @param {DOMRect | null | undefined} [stageRect]
   */
  update(dt, playerPoint, stageRect) {
    if (!this.active || !this.root) return;
    this._playerPoint = playerPoint ?? null;
    this._stageRect = stageRect ?? null;
    this.time += dt;
    this.walking = false;

    if (this.phase === "move") {
      const dx = this.anchorX - this.x;
      const dy = this.anchorY - this.y;
      const reachedX = Math.abs(dx) <= ANCHOR_REACH_DIST;
      const reachedY = Math.abs(dy) <= ANCHOR_REACH_DIST;
      if (reachedX && reachedY) {
        this.x = this.anchorX;
        this.y = this.anchorY;
        this._enterStandReadyToAttack(false);
      } else {
        if (!reachedX) {
          this.x += Math.sign(dx) * this.speed * dt;
        }
        if (!reachedY) {
          this.y += Math.sign(dy) * this.speed * dt;
        }
        this.walking = true;
      }
    } else if (this.phase === "drop") {
      if (this.y + this.dropSpeed * dt >= this.anchorY) {
        this.x = this.anchorX;
        this.y = this.anchorY;
        this._enterStandReadyToAttack(true);
      } else {
        this.y += this.dropSpeed * dt;
      }
    } else if (this.phase === "attack") {
      this.attackElapsed += dt;
      const progress = Math.min(1, this.attackElapsed / ATTACK_DURATION_SEC);
      if (
        !this.attackQiSpawned &&
        progress >= ATTACK_QI_RELEASE &&
        playerPoint
      ) {
        this.attackQiSpawned = this._releaseSwordQi(playerPoint);
      }
      if (this.attackElapsed >= ATTACK_DURATION_SEC) {
        if (this._retaliateThenMove) {
          this._retaliateThenMove = false;
          this.phase = "move";
        } else {
          this.phase = "stand";
        }
        this.attacking = false;
        this.attackElapsed = 0;
        this.attackQiSpawned = false;
        this.attackTimer = 0;
      }
    } else if (this.phase === "stand") {
      this.standTimer += dt;
      this.attackTimer += dt;
      if (
        this.standTimer >= STAND_DELAY_SEC &&
        this.attackTimer >= ATTACK_INTERVAL_SEC &&
        playerPoint
      ) {
        this.phase = "attack";
        this.attacking = true;
        this.attackElapsed = 0;
        this.attackQiSpawned = false;
        this.attackTimer = 0;
      }
    }

    this._lastDt = dt;
    this._render();
  }

  takeDamage(amount, context = {}) {
    if (!this.active || this.hp <= 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this._updateHp();
    this.root?.classList.remove("enemy-hit");
    this.assembly?.classList.remove("enemy-assembly-hit");
    // Restart the CSS hit flash.
    void this.root?.offsetWidth;
    this.root?.classList.add("enemy-hit");
    void this.assembly?.offsetWidth;
    this.assembly?.classList.add("enemy-assembly-hit");
    clearTimeout(this._hitTimer);
    this._hitTimer = setTimeout(() => {
      this.root?.classList.remove("enemy-hit");
      this.assembly?.classList.remove("enemy-assembly-hit");
    }, 260);

    if (this.hp <= 0) {
      this.active = false;
      this.root?.classList.add("enemy-dead");
      clearTimeout(this._deathTimer);
      this._deathTimer = setTimeout(() => this.root?.classList.remove("active"), 980);
    } else if (!this._firstHitReacted) {
      this._firstHitReacted = true;
      if (this.entry !== "drop") {
        this._reactToFirstHit(context.playerPoint, context.stageRect);
      }
    }
    return true;
  }

  /**
   * @param {{ x: number, y: number } | null | undefined} playerPoint
   * @returns {boolean}
   */
  _releaseSwordQi(playerPoint) {
    if (!playerPoint || !this.onSpawnSwordQi || !this.isAlive()) return false;
    const swordDeg = this.getSwordDegAt(ATTACK_QI_RELEASE);
    this.onSpawnSwordQi(
      this.getSwordQiOrigin(swordDeg),
      { x: playerPoint.x, y: playerPoint.y },
      swordDeg
    );
    return true;
  }

  /**
   * 首次受击：向前劈砍并放剑气 → 继续走向随机站位 → 到站后恢复常规攻击循环
   * @param {{ x: number, y: number } | null | undefined} _playerPoint
   * @param {DOMRect | null | undefined} stageRect
   */
  _reactToFirstHit(_playerPoint, stageRect) {
    if (!this.isAlive()) return;

    const rect = stageRect ?? this._stageRect;
    if (rect) {
      const anchor = pickForwardStandAnchor(rect, this.x);
      this.anchorX = anchor.x;
      this.anchorY = anchor.y;
    }

    this._retaliateThenMove = true;
    this.phase = "attack";
    this.attacking = true;
    this.attackElapsed = 0;
    this.attackQiSpawned = false;
    this.standTimer = 0;
    this.attackTimer = 0;
  }

  /** @returns {Array<{ x: number, y: number }>} */
  getSpawnAvoidPoints() {
    const points = [{ x: this.anchorX, y: this.anchorY }];
    const center = this.getCenterStage();
    if (anchorDistance(center, points[0]) > 28) {
      points.push(center);
    }
    return points;
  }

  getOccupancyPoint() {
    return { x: this.anchorX, y: this.anchorY };
  }

  isAlive() {
    return this.active && this.hp > 0;
  }

  containsStagePoint(point) {
    if (!this.isAlive() || !point) return false;
    const center = this.getCenterStage();
    return (
      Math.abs(point.x - center.x) <= (HIT_ZONE.w * this.scale) / 2 &&
      Math.abs(point.y - center.y) <= (HIT_ZONE.h * this.scale) / 2
    );
  }

  /**
   * 金箍棒线段与躯干判定盒相交（沿棍身采样 + 厚度）
   * @param {{ x: number, y: number }} from
   * @param {{ x: number, y: number }} to
   * @param {number} [thickness]
   * @param {number} [samples]
   */
  intersectsStaff(from, to, thickness = 32) {
    if (!this.isAlive() || !from || !to) return false;
    const center = this.getCenterStage();
    const halfW = (HIT_ZONE.w * this.scale) / 2 + thickness;
    const halfH = (HIT_ZONE.h * this.scale) / 2 + thickness;
    const minX = center.x - halfW;
    const maxX = center.x + halfW;
    const minY = center.y - halfH;
    const maxY = center.y + halfH;
    return segmentIntersectsRect(from, to, minX, minY, maxX, maxY);
  }

  getSwordDegAt(progress) {
    return swordAttackDeg(progress);
  }

  _swordTipAssembly(swordDeg) {
    const [ox, oy] = SWORD_PIVOT;
    const rad = (swordDeg * Math.PI) / 180;
    const lx = SWORD_TIP[0] - ox;
    const ly = SWORD_TIP[1] - oy;
    const rx = lx * Math.cos(rad) - ly * Math.sin(rad);
    const ry = lx * Math.sin(rad) + ly * Math.cos(rad);
    return {
      x: PARTS.armSword.x + ox + rx,
      y: PARTS.armSword.y + oy + ry,
    };
  }

  getSwordQiOrigin(swordDeg = this.getSwordDegAt(ATTACK_QI_RELEASE)) {
    const tip = this._swordTipAssembly(swordDeg);
    const standing = this.phase === "stand" || this.phase === "attack";
    const bob = standing ? Math.sin(this.time * 2.2) * 1.5 : 0;
    return {
      x: this.x + tip.x * this.scale,
      y: this.y - bob + tip.y * this.scale,
    };
  }

  getCenterStage() {
    return {
      x: this.x,
      y: this.y - 150 * this.scale,
    };
  }

  _assemblyPoint(partName, localX, localY) {
    const spec = PARTS[partName];
    if (!spec) return { x: 0, y: 0 };
    if (!spec.origin) {
      return { x: spec.x + localX, y: spec.y + localY };
    }
    const [ox, oy] = spec.origin;
    const deg = this._partRot[partName] ?? 0;
    const rad = (deg * Math.PI) / 180;
    const dx = localX - ox;
    const dy = localY - oy;
    return {
      x: spec.x + ox + dx * Math.cos(rad) - dy * Math.sin(rad),
      y: spec.y + oy + dx * Math.sin(rad) + dy * Math.cos(rad),
    };
  }

  /** @returns {Array<{ x: number, y: number }>} */
  getCeilingStringJoints() {
    if (!this.isAlive()) return [];
    return MINION_STRING_ATTACH.map(({ part, local }) => {
      const pt = this._assemblyPoint(part, local[0], local[1]);
      return {
        x: this.x + this._attackOffsetX + pt.x * this.scale,
        y: this.y - this._displayBob + this._attackOffsetY + pt.y * this.scale,
      };
    });
  }

  _updateHp() {
    if (!this.hpFill) return;
    const pct = Math.max(0, Math.min(1, this.hp / this.maxHp));
    this.hpFill.style.transform = `scaleX(${pct})`;
  }

  _render() {
    if (!this.root) return;
    const walking = this.walking;
    const standing =
      !walking && (this.phase === "stand" || this.phase === "attack");
    const step = Math.sin(this.time * WALK_SWING_SPEED);
    const targetBob = walking
      ? Math.abs(step) * 11
      : standing
        ? Math.sin(this.time * 2.2) * 2.5
        : Math.sin(this.time * 2.2) * 3;
    const bobBlend = Math.min(1, (this._lastDt || 0.016) * 14);
    this._displayBob += (targetBob - this._displayBob) * bobBlend;

    let attackOffsetX = 0;
    let attackOffsetY = 0;
    if (this.phase === "attack") {
      const p = Math.min(1, this.attackElapsed / ATTACK_DURATION_SEC);
      const offset = attackBodyOffset(p);
      // 小兵在舞台右侧面向左，攻击位移 x 取反才是向前（朝玩家）
      attackOffsetX = -offset.x;
      attackOffsetY = offset.y;
    }
    this.root.style.transform = `translate(${this.x + attackOffsetX}px, ${this.y - this._displayBob + attackOffsetY}px) scale(${this.scale})`;
    this._attackOffsetX = attackOffsetX;
    this._attackOffsetY = attackOffsetY;

    if (this.phase === "attack") {
      const p = Math.min(1, this.attackElapsed / ATTACK_DURATION_SEC);
      const swordDeg = swordAttackDeg(p);
      this._rotate("legFront", 10);
      this._rotate("legBack", -10);
      this._rotate("armSword", swordDeg);
      this._rotate("armFree", attackFreeArmDeg(p));
      return;
    }

    if (this.phase === "drop") {
      const sway = Math.sin(this.time * 9) * 7;
      this._rotate("legFront", 10 + sway);
      this._rotate("legBack", -10 - sway);
      this._rotate("armSword", -28 + Math.sin(this.time * 7) * 10);
      this._rotate("armFree", 18 - sway * 0.6);
      return;
    }

    this._rotate("legFront", walking ? 3 + step * 11 : 3);
    this._rotate("legBack", walking ? -3 - step * 11 : -3);
    this._rotate("armSword", walking ? -9 + step * 7 : -9);
    this._rotate("armFree", walking ? -4 + step * 6 : -4);
  }

  _rotate(name, deg) {
    this._partRot[name] = deg;
    const el = this.parts[name];
    if (!el) return;
    el.style.transform = `rotate(${deg}deg)`;
  }
}
