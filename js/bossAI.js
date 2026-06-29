const WANDER_DURATION = 2.5;
const WANDER_PRE_CAST_DURATION = 1.5;
const WANDER_RADIUS_X = 34;
const WANDER_RADIUS_Y = 20;
const CHARGE_WINDUP = 0.72;
const CHARGE_DASH_MAX = 1.65;
const CHARGE_SPEED = 360;
const CHARGE_HIT_RADIUS = 78;
const CHARGE_RETURN = 0.85;
const CAST_DURATION = 1.65;
const CAST_WINDUP = 0.48;
const RECOVER_DURATION = 0.95;
const CHARGE_STOP_DIST = 58;

/** 白骨精 flipX=true：左臂正角、右臂负角才能视觉上张开 */
const POSE = {
  idle: { arm_l: 0, arm_r: 0, torso: 0, leg_l: 0, leg_r: 0 },
  /** 鬼火：双臂高举外展 */
  cast: { arm_l: 112, arm_r: -72, torso: 16, leg_l: 0, leg_r: 0 },
  /** 近身：水平张臂前扑（沿用登场收臂前张臂约定：左正右负） */
  charge: { arm_l: 50, arm_r: -40, torso: 10, leg_l: 8, leg_r: -6 },
};

const POSE_BONES = ["arm_l", "arm_r", "torso", "leg_l", "leg_r"];

function easeOutCubic(t) {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) ** 3;
}

function easeInOutCubic(t) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

function lerpPose(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  /** @type {Record<string, number>} */
  const out = {};
  for (const name of POSE_BONES) {
    out[name] = a[name] + (b[name] - a[name]) * k;
  }
  return out;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * @param {import('./puppetRig.js').PuppetRig} bossRig
 * @param {() => import('./puppetRig.js').PuppetRig} getPlayerRig
 * @param {() => void} [onGhostFire]
 * @param {{
 *   mountEl?: HTMLElement | null,
 *   getPlayerTorso?: (stageRect: DOMRect) => { x: number, y: number } | null,
 *   onMeleeHit?: () => void,
 * }} [options]
 */
export class BossAI {
  constructor(bossRig, getPlayerRig, onGhostFire, options = {}) {
    this.bossRig = bossRig;
    this.getPlayerRig = getPlayerRig;
    this.onGhostFire = onGhostFire ?? null;
    this.getPlayerTorso = options.getPlayerTorso ?? null;
    this.onMeleeHit = options.onMeleeHit ?? null;
    this.mountEl = options.mountEl ?? null;
    this.state = "wander";
    this.timer = WANDER_DURATION;
    this.homeX = 0;
    this.homeY = 0;
    this.posX = 0;
    this.posY = 0;
    this._wanderPhase = Math.random() * Math.PI * 2;
    this._fired = false;
    this._meleeHit = false;
    this._returnFrom = { x: 0, y: 0 };
    this._wanderDuration = WANDER_DURATION;
    this._wanderNext = "charge_windup";
  }

  _enterWander(duration, nextState = "charge_windup") {
    this.state = "wander";
    this.timer = duration;
    this._wanderDuration = duration;
    this._wanderNext = nextState;
    this._wanderPhase = Math.random() * Math.PI * 2;
    this.posX = this.homeX;
    this.posY = this.homeY;
  }

  _stepWander() {
    this._applyPose(POSE.idle, false);
    const duration = this._wanderDuration || WANDER_DURATION;
    const t = 1 - this.timer / duration;
    const angle = this._wanderPhase + t * Math.PI * 2;
    const ox = Math.cos(angle) * WANDER_RADIUS_X;
    const oy = Math.sin(angle * 0.85) * WANDER_RADIUS_Y;
    const sway = Math.sin(angle * 2) * 5;
    this._applyRoot(this.homeX + ox, this.homeY + oy, sway);
  }

  _applyPose(pose, direct) {
    for (const name of POSE_BONES) {
      this.bossRig.setBoneRotation(name, pose[name] ?? 0);
    }
    if (direct) {
      for (const name of POSE_BONES) {
        this.bossRig.displayRotations[name] = this.bossRig.targetRotations[name] ?? 0;
      }
    }
  }

  _setMeleeGlow(on) {
    this.mountEl?.classList.toggle("boss-melee-glow", on);
  }

  _bossStage(stageRect) {
    return (
      this.bossRig.getJointStage("torso", "root", stageRect) ??
      this.bossRig.getRootStage(stageRect)
    );
  }

  /** @param {DOMRect} stageRect */
  _chargeTargetRoot(stageRect) {
    const torso = this.getPlayerTorso?.(stageRect);
    const bossStage = this._bossStage(stageRect);
    if (!torso || !bossStage) return null;

    const dx = torso.x - bossStage.x;
    const dy = torso.y - bossStage.y;
    const len = Math.hypot(dx, dy) || 1;
    const targetStageX = torso.x - (dx / len) * CHARGE_STOP_DIST;
    const targetStageY = torso.y - (dy / len) * CHARGE_STOP_DIST;
    const deltaX = targetStageX - bossStage.x;
    const deltaY = targetStageY - bossStage.y;
    return {
      x: this.posX + deltaX,
      y: this.posY + deltaY,
    };
  }

  _applyRoot(x, y, rotation = 0) {
    this.posX = x;
    this.posY = y;
    this.bossRig.setRootTransform(x, y, rotation);
  }

  reset(homeX, homeY) {
    this.homeX = homeX;
    this.homeY = homeY;
    this.posX = homeX;
    this.posY = homeY;
    this.state = "wander";
    this.timer = WANDER_DURATION;
    this._wanderDuration = WANDER_DURATION;
    this._wanderNext = "charge_windup";
    this._wanderPhase = Math.random() * Math.PI * 2;
    this._fired = false;
    this._meleeHit = false;
    this._setMeleeGlow(false);
    this.bossRig.setRootTransform(homeX, homeY, 0);
    for (const name of Object.keys(this.bossRig.parts)) {
      this.bossRig.setBoneRotation(name, 0);
    }
    this.bossRig.update(0, { direct: true });
  }

  /** @returns {boolean} */
  isAttacking() {
    return (
      this.state === "cast" ||
      this.state === "charge_windup" ||
      this.state === "charge_dash"
    );
  }

  /**
   * @param {number} dt
   * @param {DOMRect} stageRect
   */
  update(dt, stageRect) {
    this.timer -= dt;

    switch (this.state) {
      case "wander": {
        this._stepWander();
        if (this.timer <= 0) {
          if (this._wanderNext === "cast") {
            this.state = "cast";
            this.timer = CAST_DURATION;
            this._fired = false;
            this._applyRoot(this.homeX, this.homeY, 0);
            this._applyPose(POSE.idle, false);
          } else {
            this.state = "charge_windup";
            this.timer = CHARGE_WINDUP;
            this._meleeHit = false;
          }
        }
        break;
      }

      case "charge_windup": {
        const elapsed = CHARGE_WINDUP - this.timer;
        const chargeT = easeOutCubic(Math.min(1, elapsed / (CHARGE_WINDUP * 0.82)));
        const pose = lerpPose(POSE.idle, POSE.charge, chargeT);
        this._applyPose(pose, chargeT >= 0.9);
        this._setMeleeGlow(true);
        this.bossRig.setRootTransform(this.posX, this.posY, -3 * chargeT);
        if (this.timer <= 0) {
          this.state = "charge_dash";
          this.timer = CHARGE_DASH_MAX;
          this._applyPose(POSE.charge, true);
        }
        break;
      }

      case "charge_dash": {
        this._applyPose(POSE.charge, true);
        this._setMeleeGlow(true);

        const target = this._chargeTargetRoot(stageRect);
        if (target) {
          const dx = target.x - this.posX;
          const dy = target.y - this.posY;
          const len = Math.hypot(dx, dy);
          if (len > 4) {
            const step = CHARGE_SPEED * dt;
            const move = Math.min(step, len);
            this._applyRoot(
              this.posX + (dx / len) * move,
              this.posY + (dy / len) * move,
              -4
            );
          }
        }

        const bossStage = this._bossStage(stageRect);
        const playerTorso = this.getPlayerTorso?.(stageRect);
        if (
          !this._meleeHit &&
          bossStage &&
          playerTorso &&
          dist(bossStage, playerTorso) <= CHARGE_HIT_RADIUS
        ) {
          this._meleeHit = true;
          this.onMeleeHit?.();
        }

        if (this.timer <= 0 || this._meleeHit) {
          this.state = "charge_return";
          this.timer = CHARGE_RETURN;
          this._returnFrom = { x: this.posX, y: this.posY };
          this._setMeleeGlow(false);
        }
        break;
      }

      case "charge_return": {
        const returnT = easeInOutCubic(1 - this.timer / CHARGE_RETURN);
        const x = this._returnFrom.x + (this.homeX - this._returnFrom.x) * returnT;
        const y = this._returnFrom.y + (this.homeY - this._returnFrom.y) * returnT;
        const pose = lerpPose(POSE.charge, POSE.idle, returnT);
        this._applyPose(pose, false);
        this._applyRoot(x, y, -3 * (1 - returnT));
        if (this.timer <= 0) {
          this._enterWander(WANDER_PRE_CAST_DURATION, "cast");
        }
        break;
      }

      case "cast": {
        const elapsed = CAST_DURATION - this.timer;
        const castT = easeOutCubic(Math.min(1, elapsed / CAST_WINDUP));
        const pose = lerpPose(POSE.idle, POSE.cast, castT);
        this._applyPose(pose, castT >= 0.92);

        if (!this._fired && elapsed >= CAST_WINDUP) {
          this._fired = true;
          this._applyPose(POSE.cast, true);
          this.onGhostFire?.();
        }

        this.bossRig.setRootTransform(this.homeX, this.homeY, -8 * castT);
        if (this.timer <= 0) {
          this.state = "recover";
          this.timer = RECOVER_DURATION;
        }
        break;
      }

      case "recover": {
        const recoverT = easeOutCubic(1 - this.timer / RECOVER_DURATION);
        const pose = lerpPose(POSE.cast, POSE.idle, recoverT);
        this._applyPose(pose, false);
        this.bossRig.setRootTransform(this.homeX, this.homeY, -8 * (1 - recoverT));
        if (this.timer <= 0) {
          this._enterWander(WANDER_DURATION, "charge_windup");
          this.bossRig.setRootTransform(this.homeX, this.homeY, 0);
          this._applyPose(POSE.idle, false);
        }
        break;
      }

      default:
        this._enterWander(WANDER_DURATION, "charge_windup");
    }

    const directMotion =
      this.state === "cast" ||
      this.state === "charge_windup" ||
      this.state === "charge_dash";
    this.bossRig.update(dt, {
      direct: directMotion,
      alpha: directMotion ? 0.88 : 0.35,
      idle: false,
    });
  }
}
