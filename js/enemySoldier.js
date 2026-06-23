/** 躯干锚点：body 贴图左上角相对角色根节点 */
const BODY = { x: -191, y: -620 };

/**
 * 躯干关节（body.png 局部坐标）
 * 肩：肩甲孔对齐；髋：裙摆下沿挂腿
 */
const BODY_JOINTS = {
  shoulder_l: [54, 248],
  shoulder_r: [324, 304],
  hip_l: [120, 605],
  hip_r: [246, 605],
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
    z: 3,
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
    z: 4,
  },
  armSword: {
    src: "assets/minion/arm_sword.png",
    width: 371,
    height: 519,
    ...partPos(PART_ATTACH.armSword, BODY_JOINTS.shoulder_l),
    origin: PART_ATTACH.armSword,
    z: 2,
  },
  armFree: {
    src: "assets/minion/arm_free.png",
    width: 120,
    height: 348,
    ...partPos(PART_ATTACH.armFree, BODY_JOINTS.shoulder_r),
    origin: PART_ATTACH.armFree,
    z: 5,
  },
};

const MAX_HP = 20;
const ATTACK_INTERVAL_SEC = 1;
const ATTACK_DURATION_SEC = 0.34;
const WALK_SPEED = 70;
const WALK_SWING_SPEED = 5;
const HIT_ZONE = { w: 250, h: 405 };
const ATTACK_HIT_RANGE = { minAhead: 20, maxAhead: 210, y: 420 };
const ATTACK_TRIGGER_RANGE = { minAhead: 80, maxAhead: 175, y: 450 };
const ATTACK_IMPACT_START = 0.35;
const ATTACK_IMPACT_END = 0.72;

export class EnemySoldier {
  /**
   * @param {HTMLElement | null} layer
   */
  constructor(layer) {
    this.layer = layer;
    this.root = null;
    this.parts = {};
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.scale = 0.3;
    this.time = 0;
    this.speed = WALK_SPEED;
    this.hp = MAX_HP;
    this.maxHp = MAX_HP;
    this.attackTimer = 0;
    this.attackElapsed = 0;
    this.attacking = false;
    this.attackDamageDealt = false;
    this.wasNearPlayer = false;
    this.walking = false;
    this.hpFill = null;
    this.assembly = null;
    this._hitTimer = 0;
    this._deathTimer = 0;
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
    this.x = stageRect.width + 70;
    this.y = stageRect.height * 0.84;
    this.targetX = -220;
    this.time = 0;
    this.hp = MAX_HP;
    this.attackTimer = 0;
    this.attackElapsed = 0;
    this.attacking = false;
    this.attackDamageDealt = false;
    this.wasNearPlayer = false;
    this.walking = false;
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

    if (this.attacking) {
      this.attackElapsed += dt;
      if (this.attackElapsed >= ATTACK_DURATION_SEC) {
        this.attacking = false;
        this.attackElapsed = 0;
        this.attackDamageDealt = false;
      }
    } else {
      const nearPlayer = this._isNearPlayer(playerPoint);
      if (nearPlayer) {
        if (!this.wasNearPlayer || this.attackTimer >= ATTACK_INTERVAL_SEC) {
          this.attackTimer = 0;
          this.attacking = true;
          this.attackElapsed = 0;
          this.attackDamageDealt = false;
        } else {
          this.attackTimer += dt;
        }
      } else {
        this.attackTimer = 0;
        this.wasNearPlayer = false;
        const center = this.getCenterStage();
        const playerIsLeft = playerPoint && playerPoint.x < center.x;
        if (playerIsLeft) {
          this.x -= this.speed * dt;
          this.walking = true;
        }
      }
    }
    this.wasNearPlayer = this._isNearPlayer(playerPoint);

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

  tryHitPlayerStagePoint(point) {
    if (!this.isAlive() || !this.attacking || this.attackDamageDealt || !point) {
      return false;
    }
    const p = Math.min(1, this.attackElapsed / ATTACK_DURATION_SEC);
    if (p < ATTACK_IMPACT_START || p > ATTACK_IMPACT_END) return false;
    const center = this.getCenterStage();
    const ahead = center.x - point.x;
    const hit =
      ahead >= ATTACK_HIT_RANGE.minAhead &&
      ahead <= ATTACK_HIT_RANGE.maxAhead &&
      Math.abs(point.y - center.y) <= ATTACK_HIT_RANGE.y;
    if (hit) {
      this.attackDamageDealt = true;
    }
    return hit;
  }

  _isNearPlayer(point) {
    if (!point) return false;
    const center = this.getCenterStage();
    const ahead = center.x - point.x;
    return (
      ahead >= ATTACK_TRIGGER_RANGE.minAhead &&
      ahead <= ATTACK_TRIGGER_RANGE.maxAhead &&
      Math.abs(point.y - center.y) <= ATTACK_TRIGGER_RANGE.y
    );
  }

  getCenterStage() {
    return {
      x: this.x,
      y: this.y - 150 * this.scale,
    };
  }

  _updateHp() {
    if (!this.hpFill) return;
    const pct = Math.max(0, Math.min(1, this.hp / this.maxHp));
    this.hpFill.style.transform = `scaleX(${pct})`;
  }

  _render() {
    if (!this.root) return;
    const walking = this.walking && !this.attacking;
    const step = Math.sin(this.time * WALK_SWING_SPEED);
    const bob = walking ? Math.abs(step) * 7 : Math.sin(this.time * 2.2) * 2;
    this.root.style.transform = `translate(${this.x}px, ${this.y - bob}px) scale(${this.scale})`;

    if (this.attacking) {
      const p = Math.min(1, this.attackElapsed / ATTACK_DURATION_SEC);
      let swordDeg;
      if (p < 0.35) {
        const t = p / 0.35;
        swordDeg = -8 + (42 - -8) * t;
      } else if (p < 0.7) {
        const t = (p - 0.35) / 0.35;
        swordDeg = 42 + (-78 - 42) * t;
      } else {
        const t = (p - 0.7) / 0.3;
        swordDeg = -78 + (-8 - -78) * t;
      }
      this._rotate("legFront", 2);
      this._rotate("legBack", -2);
      this._rotate("armSword", swordDeg);
      this._rotate("armFree", -5);
      return;
    }

    this._rotate("legFront", walking ? 2 + step * 7 : 2);
    this._rotate("legBack", walking ? -2 - step * 7 : -2);
    this._rotate("armSword", walking ? -6 + step * 4 : -6);
    this._rotate("armFree", walking ? -2 + step * 3 : -2);
  }

  _rotate(name, deg) {
    const el = this.parts[name];
    if (!el) return;
    el.style.transform = `rotate(${deg}deg)`;
  }
}
