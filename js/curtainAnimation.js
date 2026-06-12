const FRAME_COUNT = 6;
const FRAME_MS = 180;

/**
 * 开场幕布拉幕动画：Canvas 绘制预解码帧序列，避免 CSS background 切换闪烁。
 */
export class CurtainAnimation {
  /** @param {HTMLElement} mount */
  constructor(mount) {
    this.mount = mount;
    this.audio = new Audio("assets/audio/opening.mp3");
    this.audio.preload = "auto";
    /** @type {HTMLCanvasElement} */
    this.canvas = document.createElement("canvas");
    this.canvas.className = "curtain-canvas";
    this.canvas.hidden = true;
    this.ctx = this.canvas.getContext("2d");
    this.mount.appendChild(this.canvas);
    /** @type {HTMLImageElement[]} */
    this.frames = [];
    this.loaded = false;
    this.playing = false;
    this.lastFrameIndex = -1;
    this._sequenceToken = 0;
  }

  _cancelSequence() {
    this._sequenceToken += 1;
    this.playing = false;
  }

  resize() {
    const w = this.mount.clientWidth;
    const h = this.mount.clientHeight;
    if (w <= 0 || h <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.lastFrameIndex >= 0 && this.frames[this.lastFrameIndex]) {
      this.drawFrame(this.frames[this.lastFrameIndex]);
    }
  }

  /** @param {HTMLImageElement} img */
  drawFrame(img) {
    if (!this.ctx || !img?.naturalWidth || !img?.naturalHeight) return;
    const w = this.mount.clientWidth;
    const h = this.mount.clientHeight;
    if (w <= 0 || h <= 0) return;

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (w - dw) / 2;
    const dy = 0;

    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(img, dx, dy, dw, dh);
  }

  async preload() {
    if (this.loaded) return;
    const tasks = [];
    for (let i = 1; i <= FRAME_COUNT; i += 1) {
      const img = new Image();
      img.decoding = "async";
      img.src = `assets/bg/curtain/frame-${String(i).padStart(2, "0")}.png`;
      tasks.push(
        (async () => {
          await new Promise((resolve, reject) => {
            img.onload = () => resolve(undefined);
            img.onerror = () => reject(new Error(`无法加载幕布帧 ${i}`));
          });
          if (img.decode) {
            await img.decode().catch(() => {});
          }
        })()
      );
      this.frames.push(img);
    }
    await Promise.all(tasks);
    this.loaded = true;
  }

  /** 等待布局完成，避免开场时 mount 尺寸为 0 导致 Canvas 无法绘制 */
  async _waitLayout() {
    for (let i = 0; i < 8; i += 1) {
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
      if (this.mount.clientWidth > 0 && this.mount.clientHeight > 0) return;
    }
  }

  /**
   * 用 setTimeout 推进帧序，避免主循环占用 rAF 时落幕动画卡住。
   * @param {(elapsed: number) => number} frameIndexForElapsed
   * @param {{ playAudio?: boolean }} [opts]
   * @returns {Promise<number>}
   */
  _runFrameSequence(frameIndexForElapsed, opts = {}) {
    const totalMs = this.frames.length * FRAME_MS;
    const start = performance.now();
    const token = this._sequenceToken + 1;
    this._sequenceToken = token;

    if (opts.playAudio) {
      this.audio.currentTime = 0;
      this.audio.play().catch(() => {});
    }

    return new Promise((resolve) => {
      const step = () => {
        if (token !== this._sequenceToken) {
          resolve(token);
          return;
        }
        const elapsed = performance.now() - start;
        const index = frameIndexForElapsed(elapsed);
        if (
          index >= 0 &&
          index < this.frames.length &&
          index !== this.lastFrameIndex &&
          this.frames[index]
        ) {
          this.lastFrameIndex = index;
          this.drawFrame(this.frames[index]);
        }
        if (elapsed < totalMs) {
          setTimeout(step, 16);
          return;
        }
        const finalIndex = frameIndexForElapsed(totalMs);
        if (
          finalIndex >= 0 &&
          finalIndex < this.frames.length &&
          this.frames[finalIndex]
        ) {
          this.lastFrameIndex = finalIndex;
          this.drawFrame(this.frames[finalIndex]);
        }
        resolve(token);
      };
      step();
    });
  }

  _beginPlayback() {
    this.mount.hidden = false;
    this.mount.setAttribute("aria-hidden", "false");
    this.mount.classList.remove("curtain-done", "curtain-closed");
    this.mount.classList.add("curtain-playing");
    this.canvas.hidden = false;
  }

  /** @returns {Promise<void>} */
  play() {
    if (this.playing) return Promise.resolve();
    return this._play();
  }

  async _play() {
    await this.preload();

    this.playing = true;
    try {
      this._beginPlayback();
      this.lastFrameIndex = -1;

      await this._waitLayout();
      this.resize();
      if (this.frames[0]) {
        this.lastFrameIndex = 0;
        this.drawFrame(this.frames[0]);
      }

      const token = await this._runFrameSequence(
        (elapsed) =>
          Math.min(Math.floor(elapsed / FRAME_MS), this.frames.length - 1),
        { playAudio: true }
      );
      if (token !== this._sequenceToken) return;

      this.mount.classList.remove("curtain-playing");
      this.mount.classList.add("curtain-done");
      if (this.frames.length) {
        this.lastFrameIndex = this.frames.length - 1;
        this.drawFrame(this.frames[this.frames.length - 1]);
      }
    } finally {
      this.playing = false;
    }
  }

  /** 落幕：与开场相反的帧序（最后一帧 → 第一帧） */
  playClose() {
    if (this.playing) {
      return new Promise((resolve) => {
        const wait = () => {
          if (!this.playing) {
            this._playClose().then(resolve);
          } else {
            requestAnimationFrame(wait);
          }
        };
        wait();
      });
    }
    return this._playClose();
  }

  async _playClose() {
    await this.preload();

    this.playing = true;
    try {
      this._beginPlayback();
      this.lastFrameIndex = -1;

      await this._waitLayout();
      this.resize();
      const firstClose = this.frames[this.frames.length - 1];
      if (firstClose) {
        this.lastFrameIndex = this.frames.length - 1;
        this.drawFrame(firstClose);
      }

      const token = await this._runFrameSequence((elapsed) => {
        const forwardIndex = Math.min(
          Math.floor(elapsed / FRAME_MS),
          this.frames.length - 1
        );
        return this.frames.length - 1 - forwardIndex;
      }, { playAudio: true });
      if (token !== this._sequenceToken) return;

      this.mount.classList.remove("curtain-playing");
      this.mount.classList.add("curtain-closed");
      if (this.frames[0]) {
        this.lastFrameIndex = 0;
        this.drawFrame(this.frames[0]);
      }
    } finally {
      this.playing = false;
    }
  }

  /** 再来一局时恢复开场结束后的展开帷幕装饰帧 */
  snapOpen() {
    if (!this.loaded || !this.frames.length) return;
    this._cancelSequence();
    const last = this.frames[this.frames.length - 1];
    this.mount.hidden = false;
    this.mount.setAttribute("aria-hidden", "false");
    this.mount.classList.remove("curtain-closed", "curtain-playing");
    this.canvas.hidden = false;
    this.resize();
    this.lastFrameIndex = this.frames.length - 1;
    this.drawFrame(last);
    this.mount.classList.add("curtain-done");
  }
}
