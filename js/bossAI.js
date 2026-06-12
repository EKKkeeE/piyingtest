/** 待机多久后发动下一次攻击（秒，含上下界） */
const IDLE_WAIT = { min: 3, max: 5 };
const FLY_DURATION = 1.1;
const RECOVER_DURATION = 0.6;
const FLY_SPEED = 5.5;
const RECOVER_SPEED = 3.5;
/** 飞到主角身前停下（相对主角 root 的 X 偏移，正值=更靠右） */
const FLY_STOP_AHEAD = 72;

/** 白骨精 flipX=true：左臂负角、右臂正角才能视觉上张开 */
const POSE = {
  idle: { arm_l: 0, arm_r: 0, torso: 0 },
  spread: { arm_l: -82, arm_r: 48, torso: -8 },
  recover: { arm_l: -12, arm_r: 8, torso: 0 },
};

function randomIdleWait() {
  return IDLE_WAIT.min + Math.random() * (IDLE_WAIT.max - IDLE_WAIT.min);
}

/**
 * @param {import('./puppetRig.js').PuppetRig} bossRig
 * @param {() => import('./puppetRig.js').PuppetRig} getPlayerRig
 */
export class BossAI {
  constructor(bossRig, getPlayerRig) {
    this.bossRig = bossRig;
    this.getPlayerRig = getPlayerRig;
    this.state = "idle";
    this.timer = randomIdleWait();
    this.homeX = 0;
    this.homeY = 0;
    this.canDealDamage = false;
  }

  /**
   * 与玩家 puppet 使用同一套 rootExtra 坐标（相对舞台中心像素）
   * @param {DOMRect} stageRect
   */
  _playerRootX(stageRect) {
    const player = this.getPlayerRig();
    if (!player) return 0;
    const root = player.getRootStage(stageRect);
    if (root) return root.x - stageRect.width * 0.5;
    return player.rootExtra?.x ?? 0;
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
    this.canDealDamage = false;
    this.bossRig.setRootTransform(homeX, homeY, 0);
    for (const name of Object.keys(this.bossRig.parts)) {
      this.bossRig.setBoneRotation(name, 0);
    }
    this.bossRig.update(0, { direct: true });
  }

  /** @returns {boolean} */
  isAttacking() {
    return this.state === "fly";
  }

  /**
   * @param {number} dt
   * @param {DOMRect} stageRect
   */
  update(dt, stageRect) {
    this.timer -= dt;
    const playerRootX = this._playerRootX(stageRect);
    const flyTargetX = playerRootX + FLY_STOP_AHEAD;

    switch (this.state) {
      case "idle":
        this.canDealDamage = false;
        this._applyPose(POSE.idle, false);
        if (this.timer <= 0) {
          this.state = "fly";
          this.timer = FLY_DURATION;
          this._applyPose(POSE.spread, true);
        }
        break;

      case "fly": {
        this.canDealDamage = true;
        this._applyPose(POSE.spread, true);
        const cur = this.bossRig.rootExtra;
        const nextX = cur.x + (flyTargetX - cur.x) * Math.min(1, dt * FLY_SPEED);
        const clampedX = Math.max(flyTargetX, Math.min(this.homeX, nextX));
        this.bossRig.setRootTransform(clampedX, this.homeY, -6);
        const reached = Math.abs(clampedX - flyTargetX) < 28;
        if (this.timer <= 0 || reached) {
          this.state = "recover";
          this.timer = RECOVER_DURATION;
        }
        break;
      }

      case "recover":
        this.canDealDamage = false;
        this._applyPose(POSE.recover, false);
        {
          const cur = this.bossRig.rootExtra;
          const nextX = cur.x + (this.homeX - cur.x) * Math.min(1, dt * RECOVER_SPEED);
          this.bossRig.setRootTransform(nextX, this.homeY, 0);
        }
        if (this.timer <= 0) {
          this.state = "idle";
          this.timer = randomIdleWait();
          this.bossRig.setRootTransform(this.homeX, this.homeY, 0);
          this._applyPose(POSE.idle, false);
        }
        break;

      default:
        this.state = "idle";
        this.timer = randomIdleWait();
    }

    const animDirect = this.state === "fly";
    this.bossRig.update(dt, {
      direct: animDirect,
      alpha: animDirect ? 0.85 : 0.35,
      idle: false,
    });
  }
}
