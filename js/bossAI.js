/** 待机多久后发动下一次攻击（秒，含上下界） */
const IDLE_WAIT = { min: 3, max: 5 };
const CAST_DURATION = 1.15;
const CAST_WINDUP = 0.34;
const RECOVER_DURATION = 0.65;

/** 白骨精 flipX=true：左臂正角、右臂负角才能视觉上张开 */
const POSE = {
  idle: { arm_l: 0, arm_r: 0, torso: 0 },
  spread: { arm_l: 112, arm_r: -72, torso: 16 },
};

function randomIdleWait() {
  return IDLE_WAIT.min + Math.random() * (IDLE_WAIT.max - IDLE_WAIT.min);
}

function easeOutCubic(t) {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) ** 3;
}

function lerpPose(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  return {
    arm_l: a.arm_l + (b.arm_l - a.arm_l) * k,
    arm_r: a.arm_r + (b.arm_r - a.arm_r) * k,
    torso: a.torso + (b.torso - a.torso) * k,
  };
}

/**
 * @param {import('./puppetRig.js').PuppetRig} bossRig
 * @param {() => import('./puppetRig.js').PuppetRig} getPlayerRig
 * @param {() => void} [onAttack]
 */
export class BossAI {
  constructor(bossRig, getPlayerRig, onAttack) {
    this.bossRig = bossRig;
    this.getPlayerRig = getPlayerRig;
    this.onAttack = onAttack ?? null;
    this.state = "idle";
    this.timer = randomIdleWait();
    this.homeX = 0;
    this.homeY = 0;
    this._fired = false;
  }

  _applyPose(pose, direct) {
    this.bossRig.setBoneRotation("arm_l", pose.arm_l);
    this.bossRig.setBoneRotation("arm_r", pose.arm_r);
    this.bossRig.setBoneRotation("torso", pose.torso);
    if (direct) {
      for (const name of ["arm_l", "arm_r", "torso"]) {
        this.bossRig.displayRotations[name] = this.bossRig.targetRotations[name] ?? 0;
      }
    }
  }

  reset(homeX, homeY) {
    this.homeX = homeX;
    this.homeY = homeY;
    this.state = "idle";
    this.timer = randomIdleWait();
    this._fired = false;
    this.bossRig.setRootTransform(homeX, homeY, 0);
    for (const name of Object.keys(this.bossRig.parts)) {
      this.bossRig.setBoneRotation(name, 0);
    }
    this.bossRig.update(0, { direct: true });
  }

  /** @returns {boolean} */
  isAttacking() {
    return this.state === "cast";
  }

  /**
   * @param {number} dt
   * @param {DOMRect} stageRect
   */
  update(dt, stageRect) {
    void stageRect;
    this.timer -= dt;

    switch (this.state) {
      case "idle":
        this._applyPose(POSE.idle, false);
        this.bossRig.setRootTransform(this.homeX, this.homeY, 0);
        if (this.timer <= 0) {
          this.state = "cast";
          this.timer = CAST_DURATION;
          this._fired = false;
        }
        break;

      case "cast": {
        const elapsed = CAST_DURATION - this.timer;
        const spreadT = easeOutCubic(Math.min(1, elapsed / CAST_WINDUP));
        const pose = lerpPose(POSE.idle, POSE.spread, spreadT);
        this._applyPose(pose, spreadT >= 0.92);

        if (!this._fired && elapsed >= CAST_WINDUP) {
          this._fired = true;
          this._applyPose(POSE.spread, true);
          this.onAttack?.();
        }

        this.bossRig.setRootTransform(this.homeX, this.homeY, -8 * spreadT);
        if (this.timer <= 0) {
          this.state = "recover";
          this.timer = RECOVER_DURATION;
        }
        break;
      }

      case "recover": {
        const recoverT = easeOutCubic(1 - this.timer / RECOVER_DURATION);
        const pose = lerpPose(POSE.spread, POSE.idle, recoverT);
        this._applyPose(pose, false);
        this.bossRig.setRootTransform(this.homeX, this.homeY, -8 * (1 - recoverT));
        if (this.timer <= 0) {
          this.state = "idle";
          this.timer = randomIdleWait();
          this.bossRig.setRootTransform(this.homeX, this.homeY, 0);
          this._applyPose(POSE.idle, false);
        }
        break;
      }

      default:
        this.state = "idle";
        this.timer = randomIdleWait();
    }

    const casting = this.state === "cast";
    this.bossRig.update(dt, {
      direct: casting,
      alpha: casting ? 0.88 : 0.35,
      idle: false,
    });
  }
}
