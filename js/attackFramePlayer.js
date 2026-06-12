const SRC_W = 1536;
const SRC_H = 1024;
const BASE_FRAME_SCALE = 0.32;
// 保留原序列 0、2、3、4、5 号帧
const FRAME_PATHS = [
  "assets/combo_attack/frame-01.png",
  "assets/combo_attack/frame-03.png",
  "assets/combo_attack/frame-04.png",
  "assets/combo_attack/frame-05.png",
  "assets/combo_attack/frame-06.png",
];

// Source-image coordinates. These points are the puppet holes/handles used by
// the temporary full-frame attack animation.
const FRAME_POINTS = [
  {
    anchor: { x: 735, y: 320 },
    head: { x: 735, y: 310 },
    rightHand: { x: 925, y: 405 },
    leftHand: { x: 580, y: 460 },
    leftFoot: { x: 275, y: 855 },
    rightFoot: { x: 760, y: 835 },
    hit: { x: 1325, y: 380 },
    tip: { x: 1490, y: 345 },
  },
  {
    anchor: { x: 730, y: 310 },
    head: { x: 730, y: 305 },
    rightHand: { x: 415, y: 275 },
    leftHand: { x: 510, y: 315 },
    leftFoot: { x: 280, y: 865 },
    rightFoot: { x: 830, y: 835 },
    hit: { x: 115, y: 85 },
    tip: { x: 30, y: 35 },
  },
  {
    anchor: { x: 735, y: 305 },
    head: { x: 735, y: 300 },
    rightHand: { x: 865, y: 485 },
    leftHand: { x: 360, y: 390 },
    leftFoot: { x: 315, y: 850 },
    rightFoot: { x: 815, y: 820 },
    hit: { x: 1240, y: 565 },
    tip: { x: 1485, y: 650 },
  },
  {
    anchor: { x: 720, y: 315 },
    head: { x: 720, y: 310 },
    rightHand: { x: 1010, y: 420 },
    leftHand: { x: 565, y: 500 },
    leftFoot: { x: 245, y: 870 },
    rightFoot: { x: 805, y: 820 },
    hit: { x: 1410, y: 385 },
    tip: { x: 1515, y: 360 },
  },
  {
    anchor: { x: 685, y: 315 },
    head: { x: 685, y: 310 },
    rightHand: { x: 1000, y: 400 },
    leftHand: { x: 735, y: 440 },
    leftFoot: { x: 235, y: 820 },
    rightFoot: { x: 735, y: 790 },
    hit: { x: 1450, y: 355 },
    tip: { x: 1520, y: 335 },
  },
];

const FINGER_TO_POINT = {
  middle: "head",
  index: "rightHand",
  ring: "leftHand",
  pinky: "leftFoot",
  thumb: "rightFoot",
};

export class AttackFramePlayer {
  /**
   * @param {HTMLElement | null} layer
   * @param {HTMLImageElement | null} img
   */
  constructor(layer, img) {
    this.layer = layer;
    this.img = img;
    this.frames = [];
    this.frameIndex = 0;
    this.rect = null;
    this.scale = 1;
    this.left = 0;
    this.top = 0;
    this._mountFrames();
  }

  _mountFrames() {
    if (!this.layer) return;
    this.img?.remove();
    this.img = null;

    for (const src of FRAME_PATHS) {
      const img = new Image();
      img.src = src;
      img.alt = "";
      img.draggable = false;
      img.className = "combo-frame-img";
      img.style.display = "none";
      this.layer.appendChild(img);
      this.frames.push(img);
    }
  }

  hide() {
    this.layer?.classList.remove("active");
    for (const frame of this.frames) {
      frame.style.display = "none";
    }
  }

  /**
   * @param {number} frameIndex
   * @param {{ x: number, y: number }} root
   * @param {DOMRect} stageRect
   */
  show(frameIndex, root, stageRect) {
    if (!this.layer || !stageRect || !this.frames.length) return;

    this.frameIndex = Math.max(0, Math.min(FRAME_PATHS.length - 1, frameIndex));
    const points = FRAME_POINTS[this.frameIndex];
    const rootStage = {
      x: stageRect.width / 2 + (root?.x ?? 0),
      y: stageRect.height / 2 + (root?.y ?? 0),
    };
    const fitScale = Math.min(stageRect.width / SRC_W, stageRect.height / SRC_H);
    // Match the normal puppet rig scale instead of fitting the whole source
    // image to the stage; the source frames include a lot of transparent canvas.
    const scale = Math.min(BASE_FRAME_SCALE, fitScale * 0.92);
    const left = rootStage.x - points.anchor.x * scale;
    const top = rootStage.y - points.anchor.y * scale;

    this.scale = scale;
    this.left = left;
    this.top = top;
    this.rect = stageRect;

    for (let i = 0; i < this.frames.length; i++) {
      const frame = this.frames[i];
      frame.style.width = `${SRC_W * scale}px`;
      frame.style.height = `${SRC_H * scale}px`;
      frame.style.transform = `translate(${left}px, ${top}px)`;
      frame.style.display = i === this.frameIndex ? "block" : "none";
    }
    this.layer.classList.add("active");
  }

  getPoint(frameIndex, key) {
    const idx = Math.max(0, Math.min(FRAME_POINTS.length - 1, frameIndex));
    const point = FRAME_POINTS[idx][key];
    if (!point) return null;
    return {
      x: this.left + point.x * this.scale,
      y: this.top + point.y * this.scale,
    };
  }

  getHitPoint(frameIndex = this.frameIndex) {
    return this.getPoint(frameIndex, "hit");
  }

  getHitPoints(frameIndex = this.frameIndex) {
    return [this.getPoint(frameIndex, "hit"), this.getPoint(frameIndex, "tip")].filter(Boolean);
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
        id: `attack_${node.finger}`,
        finger: node,
        joint,
        length,
        slack: 0,
      });
    }
    return strings;
  }
}
