const SRC_W = 1672;
const SRC_H = 941;
const BASE_FRAME_SCALE = 0.32;
const ASSET_VERSION = "psd-frame9-align-frame8-20260611";
const FRAME_DATA = [
  { src: "assets/ultimate_attack/frame-01.png", width: 712, height: 886, offset: { x: 423, y: 34 } },
  { src: "assets/ultimate_attack/frame-02.png", width: 1022, height: 897, offset: { x: 170, y: 23 } },
  { src: "assets/ultimate_attack/frame-03.png", width: 1636, height: 917, offset: { x: -280, y: 3 } },
  { src: "assets/ultimate_attack/frame-04.png", width: 2044, height: 927, offset: { x: -744, y: -7 } },
  { src: "assets/ultimate_attack/frame-05.png", width: 1689, height: 1251, offset: { x: -326, y: -331 } },
  { src: "assets/ultimate_attack/frame-06.png", width: 1506, height: 1292, offset: { x: 459, y: -372 } },
  { src: "assets/ultimate_attack/frame-07.png", width: 1726, height: 908, offset: { x: 418, y: 12 } },
  { src: "assets/ultimate_attack/frame-08.png", width: 1709, height: 901, offset: { x: 279, y: 19 } },
  { src: "assets/ultimate_attack/frame-09.png", width: 1710, height: 950, offset: { x: 279, y: 19 } },
  { src: "assets/ultimate_attack/frame-10.png", width: 697, height: 915, offset: { x: 451, y: 5 } },
].map((frame) => ({
  ...frame,
  src: `${frame.src}?v=${ASSET_VERSION}`,
}));

const FRAME_ANCHOR = { x: 835, y: 300 };
const IMPACT_FRAME_INDEX = 8;
const FRAME_POINTS = [
  {
    head: { x: 360, y: 240 },
    rightHand: { x: 575, y: 190 },
    leftHand: { x: 230, y: 125 },
    leftFoot: { x: 120, y: 850 },
    rightFoot: { x: 540, y: 845 },
  },
  {
    head: { x: 560, y: 265 },
    rightHand: { x: 760, y: 215 },
    leftHand: { x: 370, y: 110 },
    leftFoot: { x: 260, y: 860 },
    rightFoot: { x: 820, y: 850 },
  },
  {
    head: { x: 820, y: 275 },
    rightHand: { x: 1040, y: 180 },
    leftHand: { x: 650, y: 185 },
    leftFoot: { x: 690, y: 830 },
    rightFoot: { x: 1050, y: 835 },
  },
  {
    head: { x: 1260, y: 315 },
    rightHand: { x: 1460, y: 180 },
    leftHand: { x: 1120, y: 185 },
    leftFoot: { x: 1220, y: 810 },
    rightFoot: { x: 1540, y: 820 },
  },
  {
    head: { x: 1160, y: 500 },
    rightHand: { x: 1300, y: 640 },
    leftHand: { x: 1220, y: 605 },
    leftFoot: { x: 610, y: 1190 },
    rightFoot: { x: 1450, y: 1160 },
  },
  {
    head: { x: 430, y: 690 },
    rightHand: { x: 250, y: 770 },
    leftHand: { x: 360, y: 720 },
    leftFoot: { x: 120, y: 1240 },
    rightFoot: { x: 660, y: 1230 },
  },
  {
    head: { x: 470, y: 320 },
    rightHand: { x: 335, y: 400 },
    leftHand: { x: 520, y: 330 },
    leftFoot: { x: 320, y: 840 },
    rightFoot: { x: 720, y: 835 },
  },
  {
    head: { x: 520, y: 270 },
    rightHand: { x: 390, y: 340 },
    leftHand: { x: 550, y: 290 },
    leftFoot: { x: 330, y: 820 },
    rightFoot: { x: 700, y: 820 },
  },
  {
    head: { x: 530, y: 275 },
    rightHand: { x: 400, y: 335 },
    leftHand: { x: 560, y: 300 },
    leftFoot: { x: 335, y: 850 },
    rightFoot: { x: 710, y: 845 },
    hit: { x: 1515, y: 735 },
  },
  {
    head: { x: 490, y: 220 },
    rightHand: { x: 220, y: 210 },
    leftHand: { x: 360, y: 185 },
    leftFoot: { x: 160, y: 870 },
    rightFoot: { x: 600, y: 870 },
  },
];

const FINGER_TO_POINT = {
  middle: "head",
  index: "rightHand",
  ring: "leftHand",
  pinky: "leftFoot",
  thumb: "rightFoot",
};

export class UltimateFramePlayer {
  /**
   * @param {HTMLElement | null} layer
   * @param {HTMLImageElement | null} img
   */
  constructor(layer, img) {
    this.layer = layer;
    this.img = img;
    this.frames = [];
    this.frameIndex = 0;
    this.scale = 1;
    this.baseLeft = 0;
    this.baseTop = 0;
    this._visible = false;
    this._shownFrameIndex = -1;
    this._layoutKey = "";
    this._hitTimer = 0;
    this._mountFrames();
  }

  _mountFrames() {
    if (!this.layer) return;
    this.layer.innerHTML = "";

    for (const frameData of FRAME_DATA) {
      const img = new Image();
      img.src = frameData.src;
      img.alt = "";
      img.draggable = false;
      img.className = "ultimate-frame-img";
      img.style.width = `${frameData.width}px`;
      img.style.height = `${frameData.height}px`;
      img.style.visibility = "hidden";
      img.decode?.().catch(() => {});
      this.layer.appendChild(img);
      this.frames.push(img);
    }
  }

  hide() {
    if (!this._visible) return;
    this.layer?.classList.remove("active");
    if (this._shownFrameIndex >= 0) {
      this.frames[this._shownFrameIndex].style.visibility = "hidden";
    }
    this._visible = false;
    this._shownFrameIndex = -1;
    this._layoutKey = "";
  }

  /** @param {number} [durationSec] */
  flashHit(durationSec = 0.2) {
    if (!this._visible || this._shownFrameIndex < 0) return;
    const frame = this.frames[this._shownFrameIndex];
    if (!frame) return;
    frame.classList.remove("frame-hit");
    void frame.offsetWidth;
    frame.classList.add("frame-hit");
    clearTimeout(this._hitTimer);
    this._hitTimer = setTimeout(() => {
      frame.classList.remove("frame-hit");
    }, durationSec * 1000);
  }

  /**
   * @param {number} frameIndex
   * @param {{ x: number, y: number }} root
   * @param {DOMRect} stageRect
   */
  show(frameIndex, root, stageRect) {
    if (!this.layer || !stageRect || !this.frames.length) return;

    const idx = Math.max(0, Math.min(FRAME_DATA.length - 1, frameIndex));
    const data = FRAME_DATA[idx];
    const rootStage = {
      x: stageRect.width / 2 + (root?.x ?? 0),
      y: stageRect.height / 2 + (root?.y ?? 0),
    };
    const fitScale = Math.min(stageRect.width / SRC_W, stageRect.height / SRC_H);
    const scale = Math.min(BASE_FRAME_SCALE, fitScale * 0.95);
    const baseLeft = rootStage.x - FRAME_ANCHOR.x * scale;
    const baseTop = rootStage.y - FRAME_ANCHOR.y * scale;
    const tx = baseLeft + data.offset.x * scale;
    const ty = baseTop + data.offset.y * scale;
    const layoutKey = `${idx}|${tx}|${ty}|${scale}`;

    if (this._visible && layoutKey === this._layoutKey) return;

    const transform = `translate(${tx}px, ${ty}px) scale(${scale})`;

    if (this._shownFrameIndex !== idx) {
      if (this._shownFrameIndex >= 0) {
        this.frames[this._shownFrameIndex].style.visibility = "hidden";
      }
      const frame = this.frames[idx];
      frame.style.transform = transform;
      frame.style.visibility = "visible";
      this._shownFrameIndex = idx;
    } else {
      this.frames[idx].style.transform = transform;
    }

    this.frameIndex = idx;
    this.scale = scale;
    this.baseLeft = baseLeft;
    this.baseTop = baseTop;
    this._layoutKey = layoutKey;
    this._visible = true;
    this.layer.classList.add("active");
  }

  getPoint(frameIndex, key) {
    const idx = Math.max(0, Math.min(FRAME_POINTS.length - 1, frameIndex));
    const frame = FRAME_DATA[idx];
    const point = FRAME_POINTS[idx][key];
    if (!frame || !point) return null;
    return {
      x: this.baseLeft + (frame.offset.x + point.x) * this.scale,
      y: this.baseTop + (frame.offset.y + point.y) * this.scale,
    };
  }

  /**
   * @param {Array<{ x: number, y: number, finger?: string }>} fingerNodes
   * @param {number} frameIndex
   */
  buildStrings(fingerNodes, frameIndex = this.frameIndex) {
    const strings = [];
    for (const node of fingerNodes ?? []) {
      const key = FINGER_TO_POINT[node.finger ?? ""];
      const joint = key ? this.getPoint(frameIndex, key) : null;
      if (!joint) continue;
      const length = Math.max(1, Math.hypot(joint.x - node.x, joint.y - node.y));
      strings.push({
        id: `ultimate_${node.finger}`,
        finger: node,
        joint,
        length,
        slack: 0,
      });
    }
    return strings;
  }

  getHitPoint(frameIndex = IMPACT_FRAME_INDEX) {
    return this.getPoint(frameIndex, "hit");
  }

  /** 受击判定点：与画面上帧动画角色躯干对齐 */
  getBodyStage(frameIndex = this.frameIndex) {
    if (!this._visible) return null;
    const keys = ["head", "leftHand", "rightHand", "leftFoot", "rightFoot"];
    const points = keys
      .map((key) => this.getPoint(frameIndex, key))
      .filter(Boolean);
    if (!points.length) return null;
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
  }
}
