const WINDUP_HOLD_SEC = 0.12;
const IMPACT_FRAME_INDEX = 8;
const FRAME_DURATIONS = [
  0.08,
  0.08,
  0.08,
  0.08,
  0.02,
  0.02,
  0.02,
  0.02,
  0.4,
  0.04,
];
const FRAME_COUNT = FRAME_DURATIONS.length;
const DURATION_SEC = FRAME_DURATIONS.reduce((sum, duration) => sum + duration, 0);

function frameIndexAt(elapsed) {
  let time = 0;
  for (let i = 0; i < FRAME_DURATIONS.length; i++) {
    time += FRAME_DURATIONS[i];
    if (elapsed < time) return i;
  }
  return FRAME_COUNT - 1;
}

export class UltimateAttack {
  constructor() {
    this.reset();
  }

  reset() {
    this.active = false;
    this.elapsed = 0;
    this.displayFrame = 0;
    this.okHold = 0;
    this.waitRelease = false;
    this.lockedRoot = null;
    this.impacted = false;
  }

  /**
   * @param {number} dt
   * @param {{ okSign: boolean, root?: { x: number, y: number, rotation?: number } }} opts
   */
  step(dt, opts) {
    const okSign = !!opts.okSign;

    if (!okSign) {
      this.okHold = 0;
      this.waitRelease = false;
    }

    if (this.active) {
      return this._stepActive(dt);
    }

    if (!okSign || this.waitRelease) {
      return { active: false, frameIndex: 0, progress: 0, justStarted: false };
    }

    this.okHold += dt;
    if (this.okHold >= WINDUP_HOLD_SEC) {
      this._start(opts.root);
      return {
        active: true,
        frameIndex: 0,
        progress: 0,
        justStarted: true,
        justImpacted: false,
        root: this.lockedRoot,
      };
    }

    return { active: false, frameIndex: 0, progress: 0, justStarted: false };
  }

  _start(root) {
    this.active = true;
    this.elapsed = 0;
    this.displayFrame = 0;
    this.waitRelease = true;
    this.impacted = false;
    this.lockedRoot = root
      ? { x: root.x ?? 0, y: root.y ?? 0, rotation: root.rotation ?? 0 }
      : { x: 0, y: 0, rotation: 0 };
  }

  _stepActive(dt) {
    this.elapsed += dt;
    const timeFrame = frameIndexAt(this.elapsed);
    if (timeFrame > this.displayFrame) {
      this.displayFrame = Math.min(this.displayFrame + 1, timeFrame);
    }
    const justImpacted =
      !this.impacted && this.displayFrame >= IMPACT_FRAME_INDEX;
    if (justImpacted) {
      this.impacted = true;
    }

    const progress = Math.min(1, this.elapsed / DURATION_SEC);
    if (this.elapsed >= DURATION_SEC && this.displayFrame >= FRAME_COUNT - 1) {
      this.active = false;
    }

    return {
      active: this.active,
      frameIndex: this.displayFrame,
      progress,
      justStarted: false,
      justImpacted,
      root: this.lockedRoot,
    };
  }
}
