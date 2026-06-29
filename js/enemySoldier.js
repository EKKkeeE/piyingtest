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

const MAX_HP = 20;
const ATTACK_INTERVAL_SEC = 1.2;
const ATTACK_DURATION_SEC = 0.42;
const ATTACK_QI_RELEASE = 0.36;
const SWORD_PIVOT = PART_ATTACH.armSword;
/** 刀尖在 arm_sword 贴图局部坐标中的近似位置 */
const SWORD_TIP = [58, 462];
const STAND_DELAY_SEC = 0.45;
const WALK_SPEED = 85;
const WALK_SWING_SPEED = 6.5;
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
function pickStandAnchor(stageRect) {
  const padX = Math.max(48, stageRect.width * 0.04);
  const minX = stageRect.width * 0.52 + padX * 0.5;
  const maxX = stageRect.width * 0.76 - padX * 0.5;
  const minY = stageRect.height * 0.58;
  const maxY = stageRect.height * 0.92;
  const spanX = Math.max(80, maxX - minX);
  return {
    x: minX + Math.random() * spanX,
    y: minY + Math.random() * Math.max(1, maxY - minY),
  };
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

  /** @param {DOMRect} stageRect */
  spawn(stageRect) {
    if (!this.root || !stageRect) return;
    this.scale = Math.min(0.36, Math.max(0.27, stageRect.height / 2700));
    const anchor = pickStandAnchor(stageRect);
    this.anchorX = anchor.x;
    this.anchorY = anchor.y;
    this.x = stageRect.width + 70;
    this.y = this.anchorY;
    this.phase = "move";
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
    this.active = true;
    clearTimeout(this._hitTimer);
    clearTimeout(this._deathTimer);
    this.root.classList.add("active");
    this.root.classList.remove("enemy-dead", "enemy-hit");
    this.assembly?.classList.remove("enemy-assembly-hit");
    this._updateHp();
    this._render();
  }

  /**
   * @param {number} dt
   * @param {{ x: number, y: number } | null | undefined} playerPoint
   */
  update(dt, playerPoint) {
    if (!this.active || !this.root) return;
    this.time += dt;
    this.walking = false;

    if (this.phase === "move") {
      const dx = this.anchorX - this.x;
      if (Math.abs(dx) <= ANCHOR_REACH_DIST) {
        this.x = this.anchorX;
        this.y = this.anchorY;
        this.phase = "stand";
        this.standTimer = 0;
        this.attackTimer = ATTACK_INTERVAL_SEC;
      } else {
        this.x += Math.sign(dx) * this.speed * dt;
        this.walking = true;
      }
    } else if (this.phase === "attack") {
      this.attackElapsed += dt;
      const progress = Math.min(1, this.attackElapsed / ATTACK_DURATION_SEC);
      if (
        !this.attackQiSpawned &&
        progress >= ATTACK_QI_RELEASE &&
        playerPoint &&
        this.onSpawnSwordQi
      ) {
        this.attackQiSpawned = true;
        const swordDeg = this.getSwordDegAt(ATTACK_QI_RELEASE);
        this.onSpawnSwordQi(
          this.getSwordQiOrigin(swordDeg),
          { x: playerPoint.x, y: playerPoint.y },
          swordDeg
        );
      }
      if (this.attackElapsed >= ATTACK_DURATION_SEC) {
        this.phase = "stand";
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

    this._render();
  }

  takeDamage(amount) {
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
    }
    return true;
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
    const bob = walking
      ? Math.abs(step) * 11
      : standing
        ? Math.sin(this.time * 2.2) * 2.5
        : Math.sin(this.time * 2.2) * 3;
    let attackOffsetX = 0;
    let attackOffsetY = 0;
    if (this.phase === "attack") {
      const p = Math.min(1, this.attackElapsed / ATTACK_DURATION_SEC);
      const offset = attackBodyOffset(p);
      attackOffsetX = offset.x;
      attackOffsetY = offset.y;
    }
    this.root.style.transform = `translate(${this.x + attackOffsetX}px, ${this.y - bob + attackOffsetY}px) scale(${this.scale})`;
    this._displayBob = bob;
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
