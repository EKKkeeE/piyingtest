const WINDUP_HOLD_SEC = 0.12;
const IMPACT_FRAME_INDEX = 2;
const DURATION_SEC = 0.6;
const FRAME_WEIGHTS = [1, 1, 1.5, 1, 1];
const weightSum = FRAME_WEIGHTS.reduce((acc, w) => acc + w, 0);
const FRAME_DURATIONS = FRAME_WEIGHTS.map((w) => (w / weightSum) * DURATION_SEC);
const FRAME_COUNT = FRAME_DURATIONS.length;

function frameIndexAt(elapsed) {
  let time = 0;
  for (let i = 0; i < FRAME_DURATIONS.length; i++) {
    time += FRAME_DURATIONS[i];
    if (elapsed < time) return i;
  }
  return FRAME_COUNT - 1;
}

export class StaffComboAttack {
  constructor() {
    this.reset();
  }

  reset() {
    this.active = false;
    this.elapsed = 0;
    this.displayFrame = 0;
    this.peaceHold = 0;
    this.impactPlayed = false;
  }

  /**
   * @param {number} dt
   * @param {{ peaceSign: boolean }} opts
   */
  step(dt, opts) {
    if (this.active) {
      return this._stepActive(dt, opts.peaceSign);
    }

    if (!opts.peaceSign) {
      this.peaceHold = 0;
      return { active: false, glowActive: false, justImpacted: false };
    }

    this.peaceHold += dt;
    if (this.peaceHold >= WINDUP_HOLD_SEC) {
      this._start();
      return this._stepActive(0, true);
    }

    return { active: false, glowActive: false, justImpacted: false };
  }

  _start() {
    this.active = true;
    this.elapsed = 0;
    this.displayFrame = 0;
    this.impactPlayed = false;
  }

  _stepActive(dt, peaceSign) {
    this.elapsed += dt;

    const timeFrame = frameIndexAt(this.elapsed);
    // 每帧至少展示一次，避免 dt 跳变时直接跳过中间帧
    if (timeFrame > this.displayFrame) {
      this.displayFrame = Math.min(this.displayFrame + 1, timeFrame);
    }

    const frameIndex = this.displayFrame;
    const progress = Math.min(1, this.elapsed / DURATION_SEC);
    const justImpacted =
      !this.impactPlayed && this.displayFrame >= IMPACT_FRAME_INDEX;

    if (justImpacted) this.impactPlayed = true;

    const allFramesShown = this.displayFrame >= FRAME_COUNT - 1;
    const timeUp = this.elapsed >= DURATION_SEC;
    if (timeUp && allFramesShown) {
      if (peaceSign) {
        this._start();
        return {
          active: true,
          frameIndex: 0,
          progress: 0,
          glowActive: true,
          justImpacted: false,
        };
      }
      this.active = false;
    } else if (timeUp) {
      this.displayFrame = Math.min(this.displayFrame + 1, FRAME_COUNT - 1);
    }

    return {
      active: this.active,
      frameIndex,
      progress,
      glowActive: true,
      justImpacted,
    };
  }
}
