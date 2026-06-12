import {
  clamp,
  gravityHangDeg,
  smooth,
  smoothAngle,
  smoothPoint,
} from "./utils.js";
import { landmarkToStage } from "./stageCoords.js";
import {
  angleFromHoleWorld,
  defaultStringLength,
  holeAt,
  solveChainStringAngles,
  solveFixedStringAngle,
  solveGravityHangAngle,
} from "./stringHangSolver.js";

/** 提线拴在子段时，父段（大臂/大腿）随子段联动 */
const CHAIN_PARENT = {
  lower_arm_l: "upper_arm_l",
  lower_arm_r: "upper_arm_r",
  shin_l: "thigh_l",
  shin_r: "thigh_r",
};

const FINGER_ZONE = { xMin: 0.04, xMax: 0.96, yMin: 0.08, yMax: 0.92 };
const LINE_HEAD_ID = "line_head";
/** 中指尖舞台坐标低通（手部检测 ~12fps，显示 ~60fps） */
const HEAD_FINGER_SMOOTH = 0.32;

/**
 * 头部提线下垂长度（舞台像素）。
 * rig 里 stringLength 是装配坐标，再 ×scale(≈0.32) 后改数几乎看不出；
 * 头部请用 stringLengthStage，直接控制「中指→头孔」的可见距离。
 */
function headStringDropPx(layout, binding) {
  if (binding?.stringLengthStage != null) return binding.stringLengthStage;
  if (binding?.stringLength != null) return binding.stringLength * layout.scale;
  return 140;
}

/** 提线长度：优先舞台像素 stringLengthStage，否则装配 stringLength×scale */
function bindingStringLengthPx(layout, binding, limb, isHead = false) {
  if (isHead) return headStringDropPx(layout, binding);
  if (binding?.stringLengthStage != null) return binding.stringLengthStage;
  if (binding?.stringLength != null) return binding.stringLength * layout.scale;
  return (limb?.stringLength ?? 0) * layout.scale;
}

/** 装配空间线长（二连杆求解、松紧度） */
function bindingStringLengthAsm(layout, binding, limb) {
  const px = bindingStringLengthPx(layout, binding, limb, false);
  return px > 0 ? px / layout.scale : limb?.stringLength ?? 0;
}
/** rootExtra 跟随目标，抑制识别抖动 */
const HEAD_ROOT_SMOOTH = 0.42;
/** 无提线时按舞台重力下垂的部件（父→子顺序） */
const GRAVITY_CHAIN = [
  "upper_arm_l",
  "upper_arm_r",
  "thigh_l",
  "thigh_r",
  "lower_arm_l",
  "lower_arm_r",
  "shin_l",
  "shin_r",
];
const GRAVITY_PART_SPECS = [
  { name: "upper_arm_l", pivot: "shoulder", distal: "elbow", min: -78, max: 78 },
  { name: "upper_arm_r", pivot: "shoulder", distal: "elbow", min: -78, max: 78 },
  { name: "lower_arm_l", pivot: "elbow", distal: "wrist", min: -78, max: 78 },
  { name: "lower_arm_r", pivot: "elbow", distal: "wrist", min: -55, max: 65 },
  { name: "thigh_l", pivot: "hip", distal: "knee", min: -72, max: 72 },
  { name: "thigh_r", pivot: "hip", distal: "knee", min: -72, max: 72 },
  { name: "shin_l", pivot: "knee", distal: "ankle", min: -65, max: 65 },
  { name: "shin_r", pivot: "knee", distal: "ankle", min: -65, max: 65 },
];
const STILL_MOVE_PX = 16;
const STILL_HOLD_MS = 160;
const ACTIVE_MOVE_PX = 22;

export const FINGERTIPS = {
  thumb: 4,
  index: 8,
  middle: 12,
  ring: 16,
  pinky: 20,
};

const TIP_NAMES = ["thumb", "index", "middle", "ring", "pinky"];
const TIP_INDICES = [4, 8, 12, 16, 20];
const DEFAULT_RESPONSE_GAIN = { tight: 1.45, slack: 1.45 };
const BINDING_RESPONSE_GAIN = {
  line_head: { tight: 1.85, slack: 0.95 },
  line_wrist_r: { tight: 2.0, slack: 1.05 },
  line_wrist_l: { tight: 1.75, slack: 1.05 },
  line_leg_l: { tight: 2.1, slack: 0.9 },
  line_leg_r: { tight: 2.1, slack: 0.9 },
};
/** 绳子偏松时仍向指尖靠拢的力度（与 tightness 叠加） */
const REACH_BLEND = {
  line_head: 0.42,
  line_wrist_r: 0.48,
  line_wrist_l: 0.45,
  line_leg_l: 0.46,
  line_leg_r: 0.46,
};
function shortestAngleDelta(a, b) {
  let d = ((a - b + 180) % 360) - 180;
  if (d < -180) d += 360;
  return d;
}

/** MediaPipe 手部骨架连线（21 结点） */
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
];

/**
 * 提线木偶：几何悬吊求解 + 层级骨骼孔对孔
 */
export class FingerMarionette {
  constructor(rigData) {
    this.bindings = rigData.fingerBindings ?? [];
    this.mirrorX = true;
    this.lastFingerNodes = [];
    this.lastHandSkeleton = { landmarks: [], connections: HAND_CONNECTIONS };
    this.lastStrings = [];
    this.hasAnyFinger = false;
    this.physicsActive = false;
    /** @type {Map<string, { angle: number, holeOffset: object, minRot: number, maxRot: number, restAngle: number, tightness: number, slackness: number, tightnessEff: number, slacknessEff: number }>} */
    this.limbs = new Map();
    this._fingerAssembly = new Map();
    this.root = { x: 0, y: 0, rotation: 0 };
    this.handStill = false;
    this._stillMs = 0;
    this._prevFingerStage = new Map();
    /** @type {Map<string, number>} */
    this._prevPalmStage = null;
    /** @type {{ x: number, y: number } | null} */
    this._palmStage = null;
    /** @type {{ x: number, y: number } | null} */
    this._smoothHeadFinger = null;
    this._initLimbs(rigData);
    this._initGravityLimbs(rigData);
  }

  _initGravityLimbs(rigData) {
    const p = rigData.parts ?? {};
    for (const spec of GRAVITY_PART_SPECS) {
      if (this.limbs.has(spec.name)) continue;
      const part = p[spec.name];
      const pivot = part?.joints?.[spec.pivot];
      const distal = part?.joints?.[spec.distal];
      if (!part || !pivot || !distal) continue;

      const holeOffset = {
        x: distal[0] - pivot[0],
        y: distal[1] - pivot[1],
      };
      const hang = solveGravityHangAngle(holeOffset, spec.min, spec.max);
      this.limbs.set(spec.name, {
        angle: hang,
        restAngle: hang,
        holeOffset,
        pivotKey: spec.pivot,
        distalKey: spec.distal,
        stringLength: 0,
        tightness: 0,
        slackness: 0,
        tightnessEff: 0,
        slacknessEff: 0,
        minRot: spec.min,
        maxRot: spec.max,
      });
    }
  }

  _controlledParts() {
    const out = new Set();
    if (!this.physicsActive) return out;
    for (const binding of this.bindings) {
      if (!this._fingerAssembly.has(binding.id)) continue;
      out.add(binding.part);
      const parent = CHAIN_PARENT[binding.part];
      if (parent) out.add(parent);
    }
    return out;
  }

  /**
   * 小臂/小腿提线：联合求解父段 + 子段转角，使末端孔在固定线长内尽量靠重力下垂。
   */
  _solveChainBinding(
    rig,
    layout,
    binding,
    fingerAsm,
    parentName,
    parentLimb,
    childLimb
  ) {
    const childName = binding.part;
    const jointKey = binding.joint;
    const prevP = rig.displayRotations[parentName] ?? parentLimb.angle;
    const prevC = rig.displayRotations[childName] ?? childLimb.angle;
    const hangP = solveGravityHangAngle(
      parentLimb.holeOffset,
      parentLimb.minRot,
      parentLimb.maxRot
    );
    const hangC = solveGravityHangAngle(
      childLimb.holeOffset,
      childLimb.minRot,
      childLimb.maxRot
    );

    const endAt = (pa, ca) => {
      rig.displayRotations[parentName] = pa;
      rig.displayRotations[childName] = ca;
      return rig.getJointAssemblyByKey(childName, jointKey);
    };

    const solved = solveChainStringAngles(
      fingerAsm,
      bindingStringLengthAsm(layout, binding, childLimb),
      {
        minRot: parentLimb.minRot,
        maxRot: parentLimb.maxRot,
        hangAngle: hangP,
        prevAngle: prevP,
      },
      {
        minRot: childLimb.minRot,
        maxRot: childLimb.maxRot,
        hangAngle: hangC,
        prevAngle: prevC,
      },
      endAt
    );

    rig.displayRotations[parentName] = prevP;
    rig.displayRotations[childName] = prevC;
    return solved;
  }

  /** 舞台竖直向下：远端关节 y 最大 */
  _solvePartHangStage(rig, layout, partName, limb) {
    const distalKey = limb.distalKey;
    if (!distalKey) {
      return solveGravityHangAngle(
        limb.holeOffset,
        limb.minRot,
        limb.maxRot
      );
    }
    const prev = rig.displayRotations[partName] ?? limb.angle;
    const rootX = this.root.x;
    const rootY = this.root.y;
    let best = prev;
    let bestY = -Infinity;
    const yEps = 0.35;
    for (let a = limb.minRot; a <= limb.maxRot; a += 0.5) {
      rig.displayRotations[partName] = a;
      const pt = rig.getJointAssemblyByKey(partName, distalKey);
      if (!pt) continue;
      const st = layout.assemblyToStage(pt, rootX, rootY);
      if (st.y > bestY + yEps) {
        bestY = st.y;
        best = a;
      } else if (Math.abs(st.y - bestY) <= yEps) {
        if (
          Math.abs(shortestAngleDelta(a, prev)) <
          Math.abs(shortestAngleDelta(best, prev))
        ) {
          best = a;
        }
      }
    }
    rig.displayRotations[partName] = prev;
    return clamp(best, limb.minRot, limb.maxRot);
  }

  _applyGravityChain(rig, layout, bonesOut, active) {
    const controlled = this._controlledParts();
    const alpha = active ? 0.22 : 0.14;
    const maxDelta = active ? 14 : 10;

    for (const partName of GRAVITY_CHAIN) {
      if (controlled.has(partName)) continue;
      const limb = this.limbs.get(partName);
      if (!limb) continue;
      const hang = this._solvePartHangStage(rig, layout, partName, limb);
      limb.angle = smoothAngle(limb.angle, hang, alpha, maxDelta);
      bonesOut[partName] = limb.angle;
      rig.displayRotations[partName] = limb.angle;
    }
  }

  _initLimbs(rigData) {
    const p = rigData.parts ?? {};
    const rest = this._restAngles(p);

    for (const binding of this.bindings) {
      const part = p[binding.part];
      if (!part) continue;
      const pivotKey = binding.rotateJoint ?? part.rotateJoint;
      const holeKey = binding.joint;
      const pivot = part.joints[pivotKey];
      const hole = part.joints[holeKey];
      if (!pivot || !hole) continue;

      let holeOffset = { x: hole[0] - pivot[0], y: hole[1] - pivot[1] };
      const hangKey = binding.hangJoint;
      if (hangKey && part.joints[hangKey]) {
        const hangPt = part.joints[hangKey];
        holeOffset = {
          x: hangPt[0] - pivot[0],
          y: hangPt[1] - pivot[1],
        };
      }
      const restAngle = rest[binding.part] ?? 0;

      const hangAngle = solveGravityHangAngle(
        holeOffset,
        binding.minRot ?? -88,
        binding.maxRot ?? 88
      );

      const rigScale = rigData.scale ?? 0.32;
      const stringLength =
        binding.stringLengthStage != null
          ? binding.stringLengthStage / rigScale
          : defaultStringLength(binding, holeOffset);
      const nominal = this._nominalStringLength(binding.part, holeOffset);
      const tightness = Math.max(0, Math.min(1, (nominal - stringLength) / nominal));
      const slackness = Math.max(0, Math.min(1, (stringLength - nominal) / nominal));
      const gain = BINDING_RESPONSE_GAIN[binding.id] ?? DEFAULT_RESPONSE_GAIN;
      // 小幅参数改动在人眼上不明显；用 sqrt + 增益放大“可感知度”。
      const tightnessEff = Math.min(1, Math.sqrt(tightness) * gain.tight);
      const slacknessEff = Math.min(1, Math.sqrt(slackness) * gain.slack);

      const initAngle = hangAngle;

      this.limbs.set(binding.part, {
        angle: initAngle,
        restAngle,
        holeOffset,
        stringLength,
        tightness,
        slackness,
        tightnessEff,
        slacknessEff,
        minRot: binding.minRot ?? -88,
        maxRot: binding.maxRot ?? 88,
      });
    }
  }

  _nominalStringLength(part, holeOffset) {
    const r = Math.hypot(holeOffset.x, holeOffset.y);
    if (part === "torso") return r * 0.72 + 95;
    if (part === "arm_l" || part === "arm_r") return r * 1.12 + 72;
    return r * 1.18 + 78;
  }

  _restAngles(p) {
    const out = {
      arm_l: 0,
      arm_r: 0,
      leg_l: 0,
      leg_r: 0,
      torso: 0,
    };
    if (p.arm_l?.joints?.shoulder && p.arm_l?.joints?.elbow) {
      const [sx, sy] = p.arm_l.joints.shoulder;
      const [ex, ey] = p.arm_l.joints.elbow;
      out.arm_l = gravityHangDeg(sx, sy, ex, ey, 88);
    }
    if (p.arm_r?.joints?.shoulder && p.arm_r?.joints?.elbow) {
      const [sx, sy] = p.arm_r.joints.shoulder;
      const [ex, ey] = p.arm_r.joints.elbow;
      out.arm_r = gravityHangDeg(sx, sy, ex, ey, 92) + 6;
    }
    if (p.leg_l?.joints?.hip && p.leg_l?.joints?.knee) {
      const [hx, hy] = p.leg_l.joints.hip;
      const [kx, ky] = p.leg_l.joints.knee;
      out.leg_l = gravityHangDeg(hx, hy, kx, ky, 90);
    }
    if (p.leg_r?.joints?.hip && p.leg_r?.joints?.knee) {
      const [hx, hy] = p.leg_r.joints.hip;
      const [kx, ky] = p.leg_r.joints.knee;
      out.leg_r = gravityHangDeg(hx, hy, kx, ky, 90);
    }
    return out;
  }

  _findHandIndex(userHand, handedness) {
    const want = userHand === "left" ? "Right" : "Left";
    for (let i = 0; i < handedness.length; i++) {
      const label =
        handedness[i]?.[0]?.categoryName ?? handedness[i]?.categoryName ?? "";
      if (label === want) return i;
    }
    return userHand === "left" ? 0 : handedness.length > 1 ? 1 : -1;
  }

  collectFingerNodes(result, stageRect) {
    const nodes = [];
    const handedness = result.handedness ?? [];
    const landmarks = result.landmarks ?? [];
    const controlIdx = this._findHandIndex("left", handedness);
    if (controlIdx < 0 || !landmarks[controlIdx]) return nodes;

    const handLm = landmarks[controlIdx];
    const activeFingers = new Set(this.bindings.map((b) => b.finger));
    for (let ti = 0; ti < TIP_INDICES.length; ti++) {
      const fingerName = TIP_NAMES[ti];
      if (!activeFingers.has(fingerName)) continue;
      const tip = handLm[TIP_INDICES[ti]];
      if (!tip) continue;
      const pt = landmarkToStage(stageRect, tip, this.mirrorX, FINGER_ZONE);
      nodes.push({ x: pt.x, y: pt.y, finger: fingerName, hand: "left" });
    }
    return nodes;
  }

  collectHandSkeleton(result, stageRect) {
    const handedness = result.handedness ?? [];
    const landmarks = result.landmarks ?? [];
    const controlIdx = this._findHandIndex("left", handedness);
    if (controlIdx < 0 || !landmarks[controlIdx]) {
      return { landmarks: [], connections: HAND_CONNECTIONS };
    }

    const handLm = landmarks[controlIdx];
    const out = [];
    for (let i = 0; i < handLm.length; i++) {
      const lm = handLm[i];
      if (!lm) continue;
      const pt = landmarkToStage(stageRect, lm, this.mirrorX, FINGER_ZONE);
      out.push({
        index: i,
        x: pt.x,
        y: pt.y,
        isTip: TIP_INDICES.includes(i),
      });
    }
    return { landmarks: out, connections: HAND_CONNECTIONS };
  }

  updateFromHand(result, layout) {
    const stageRect = layout.stageRect;
    const fingerNodes = this.collectFingerNodes(result, stageRect);
    this.hasAnyFinger = fingerNodes.length > 0;
    this.physicsActive = this.hasAnyFinger;

    const handedness = result.handedness ?? [];
    const landmarks = result.landmarks ?? [];
    this._fingerAssembly.clear();

    let maxFingerMove = 0;
    let palmMove = 999;

    const controlIdx = this._findHandIndex("left", handedness);
    if (controlIdx >= 0 && landmarks[controlIdx]) {
      const handLm = landmarks[controlIdx];
      const palm = this._palmLandmark(handLm);
      const palmLm = palm ?? handLm[9] ?? handLm[0];
      if (palmLm) {
        const palmStage = landmarkToStage(
          stageRect,
          palmLm,
          this.mirrorX,
          FINGER_ZONE
        );
        if (this._prevPalmStage) {
          palmMove = Math.hypot(
            palmStage.x - this._prevPalmStage.x,
            palmStage.y - this._prevPalmStage.y
          );
        }
        this._prevPalmStage = { x: palmStage.x, y: palmStage.y };
        this._palmStage = { x: palmStage.x, y: palmStage.y };
      }
    } else {
      this._palmStage = null;
    }

    for (const binding of this.bindings) {
      const hi = this._findHandIndex(binding.hand, handedness);
      if (hi < 0 || !landmarks[hi]) continue;

      const tip = landmarks[hi][FINGERTIPS[binding.finger] ?? 8];
      if (!tip) continue;

      let fingerStage = landmarkToStage(
        stageRect,
        tip,
        this.mirrorX,
        FINGER_ZONE
      );
      if (binding.id === LINE_HEAD_ID) {
        if (!this._smoothHeadFinger) {
          this._smoothHeadFinger = { x: fingerStage.x, y: fingerStage.y };
        } else {
          this._smoothHeadFinger = smoothPoint(
            this._smoothHeadFinger,
            fingerStage,
            HEAD_FINGER_SMOOTH
          );
        }
        fingerStage = this._smoothHeadFinger;
      }
      const prev = this._prevFingerStage.get(binding.id);
      const movePx = prev
        ? Math.hypot(fingerStage.x - prev.x, fingerStage.y - prev.y)
        : 0;
      maxFingerMove = Math.max(maxFingerMove, movePx);

      this._prevFingerStage.set(binding.id, {
        x: fingerStage.x,
        y: fingerStage.y,
      });
      this._fingerAssembly.set(binding.id, { fingerStage, movePx });
    }

    const moved =
      maxFingerMove > STILL_MOVE_PX || palmMove > STILL_MOVE_PX;
    if (moved) {
      this._stillMs = 0;
      this.handStill = false;
    } else if (this.hasAnyFinger) {
      this._stillMs += 90;
      this.handStill = this._stillMs >= STILL_HOLD_MS;
    }

    if (this.hasAnyFinger) {
      this.lastFingerNodes = fingerNodes;
      this.lastHandSkeleton = this.collectHandSkeleton(result, stageRect);
    } else {
      this._prevFingerStage.clear();
      this._prevPalmStage = null;
      this._palmStage = null;
      this._smoothHeadFinger = null;
      this._stillMs = 0;
      this.handStill = false;
    }
  }

  _palmLandmark(handLm) {
    const wrist = handLm[0];
    const mid = handLm[9];
    if (!wrist || !mid) return wrist ?? mid ?? null;
    return {
      x: wrist.x * 0.35 + mid.x * 0.65,
      y: wrist.y * 0.35 + mid.y * 0.65,
    };
  }

  /**
   * rootAnchor 在头孔：挂载层中心 + rootExtra = 头孔；勿读 0×0 wrapper（会反馈抖动）。
   * @param {number} dropStagePx 中指→头孔，舞台像素（见 stringLengthStage）
   */
  _placeRootFromFinger(layout, fingerStage, dropStagePx) {
    const targetX = fingerStage.x - layout.mountCx;
    const targetY = fingerStage.y + dropStagePx - layout.mountCy;
    this.root.x = smooth(this.root.x, targetX, HEAD_ROOT_SMOOTH);
    this.root.y = smooth(this.root.y, targetY, HEAD_ROOT_SMOOTH);
  }

  /** 舞台竖直方向：髋在头下方；优先接近上一帧角度，避免来回翻 */
  _solveTorsoHangStage(layout, torsoPart, limb, binding) {
    const head = torsoPart.joints?.head;
    const hangKey = binding.hangJoint ?? "root";
    const mass = torsoPart.joints?.[hangKey];
    if (!head || !mass) {
      return solveGravityHangAngle(limb.holeOffset, limb.minRot, limb.maxRot);
    }
    const pivot = { x: head[0], y: head[1] };
    const off = { x: mass[0] - head[0], y: mass[1] - head[1] };
    const rootX = this.root.x;
    const rootY = this.root.y;
    let best = limb.angle;
    let bestY = -Infinity;
    const yEps = 0.35;
    for (let a = limb.minRot; a <= limb.maxRot; a += 0.5) {
      const asm = holeAt(pivot, off, a);
      const st = layout.assemblyToStage(asm, rootX, rootY);
      if (st.y > bestY + yEps) {
        bestY = st.y;
        best = a;
      } else if (Math.abs(st.y - bestY) <= yEps) {
        if (Math.abs(shortestAngleDelta(a, limb.angle)) <
            Math.abs(shortestAngleDelta(best, limb.angle))) {
          best = a;
        }
      }
    }
    return clamp(best, limb.minRot, limb.maxRot);
  }

  step(dt, rig, layout) {
    const bonesOut = {};
    const headBinding = this.bindings.find((b) => b.id === LINE_HEAD_ID);
    const headFinger = this._fingerAssembly.get(LINE_HEAD_ID);
    const torsoLimb = this.limbs.get("torso");
    const torsoPart = rig.parts?.torso;

    for (const binding of this.bindings) {
      if (binding.id === LINE_HEAD_ID) continue;
      const limb = this.limbs.get(binding.part);
      const fingerData = this._fingerAssembly.get(binding.id);
      if (!limb) continue;
      const parentName = CHAIN_PARENT[binding.part];
      const parentLimb = parentName ? this.limbs.get(parentName) : null;
      bonesOut[binding.part] = limb.angle;
      if (parentName && parentLimb) {
        bonesOut[parentName] = parentLimb.angle;
      }

      if (fingerData && this.physicsActive) {
        const fingerAsm = layout.stageToAssembly(fingerData.fingerStage);
        const settle =
          fingerData.movePx > ACTIVE_MOVE_PX ? 0.48 : 0.3;

        if (parentName && parentLimb) {
          const { parent, child } = this._solveChainBinding(
            rig,
            layout,
            binding,
            fingerAsm,
            parentName,
            parentLimb,
            limb
          );
          parentLimb.angle = smoothAngle(
            parentLimb.angle,
            parent,
            settle,
            62
          );
          limb.angle = smoothAngle(limb.angle, child, settle, 62);
          bonesOut[parentName] = parentLimb.angle;
          bonesOut[binding.part] = limb.angle;
          continue;
        }

        const pivotKey =
          binding.rotateJoint ?? rig.parts[binding.part]?.rotateJoint;
        const pivot = rig.getJointAssemblyByKey(binding.part, pivotKey);
        if (pivot) {
          const hang = solveGravityHangAngle(
            limb.holeOffset,
            limb.minRot,
            limb.maxRot
          );
          let target = solveFixedStringAngle(
            pivot,
            fingerAsm,
            limb.holeOffset,
            limb.stringLength,
            limb.minRot,
            limb.maxRot,
            limb.angle
          );
          const direct = angleFromHoleWorld(
            pivot,
            limb.holeOffset,
            fingerAsm
          );
          const reachBase =
            REACH_BLEND[binding.id] ?? (binding.part === "torso" ? 0.38 : 0.42);
          const reachBoost =
            fingerData.movePx > ACTIVE_MOVE_PX ? 0.14 : 0;
          const reachBlend = Math.min(0.62, reachBase + reachBoost);
          if (limb.tightnessEff > 0) {
            const pullBlend = Math.min(
              0.78,
              reachBlend +
                limb.tightnessEff * (binding.part === "torso" ? 0.42 : 0.28)
            );
            target = target + (direct - target) * pullBlend;
          } else {
            target = target + (direct - target) * reachBlend;
          }
          if (limb.slacknessEff > 0) {
            const relaxBlend = Math.min(0.38, limb.slacknessEff * 0.5);
            target = target + (hang - target) * relaxBlend;
          }
          limb.angle = smoothAngle(limb.angle, target, settle, 62);
          bonesOut[binding.part] = limb.angle;
        }
      } else if (!this.physicsActive) {
        if (parentName && parentLimb) {
          const hangP = solveGravityHangAngle(
            parentLimb.holeOffset,
            parentLimb.minRot,
            parentLimb.maxRot
          );
          const idleP =
            Math.abs(parentLimb.restAngle) > 0.5
              ? parentLimb.restAngle
              : hangP;
          parentLimb.angle = smoothAngle(parentLimb.angle, idleP, 0.12, 20);
          bonesOut[parentName] = parentLimb.angle;
        }
        const hang = solveGravityHangAngle(
          limb.holeOffset,
          limb.minRot,
          limb.maxRot
        );
        const idleTarget =
          Math.abs(limb.restAngle) > 0.5 ? limb.restAngle : hang;
        limb.angle = smoothAngle(limb.angle, idleTarget, 0.12, 20);
        bonesOut[binding.part] = limb.angle;
      }
    }

    if (headFinger && torsoLimb && torsoPart && headBinding && this.physicsActive) {
      this._placeRootFromFinger(
        layout,
        headFinger.fingerStage,
        headStringDropPx(layout, headBinding)
      );
      const hang = this._solveTorsoHangStage(
        layout,
        torsoPart,
        torsoLimb,
        headBinding
      );
      torsoLimb.angle = smoothAngle(torsoLimb.angle, hang, 0.16, 6);
      bonesOut.torso = torsoLimb.angle;
      rig.displayRotations.torso = torsoLimb.angle;
    } else if (torsoLimb && torsoPart) {
      const hang = this._solveTorsoHangStage(
        layout,
        torsoPart,
        torsoLimb,
        headBinding ?? { hangJoint: "root" }
      );
      torsoLimb.angle = smoothAngle(torsoLimb.angle, hang, 0.12, 10);
      bonesOut.torso = torsoLimb.angle;
      rig.displayRotations.torso = torsoLimb.angle;
    }

    this._applyGravityChain(rig, layout, bonesOut, this.physicsActive);

    rig.syncDisplayRotations(bonesOut);

    const debugSingleLine = this.bindings.length === 1;
    return {
      hasHand: this.physicsActive,
      root: { x: this.root.x, y: this.root.y, rotation: 0 },
      bones: bonesOut,
      strings: this.lastStrings,
      fingerNodes: this.lastFingerNodes,
      handSkeleton: debugSingleLine
        ? { landmarks: [], connections: [] }
        : this.lastHandSkeleton,
    };
  }

  /**
   * 在 rig.update 之后调用：提线终点对齐 DOM 上的真实孔位
   * @param {import('./puppetRig.js').PuppetRig} rig
   * @param {import('./layoutCache.js').LayoutCache} layout
   */
  buildStringsFromDom(rig, layout) {
    const strings = [];

    for (const binding of this.bindings) {
      const fingerData = this._fingerAssembly.get(binding.id);
      if (!fingerData) continue;
      const limb = this.limbs.get(binding.part);
      const isHead = binding.id === LINE_HEAD_ID;
      const stringLengthPx = bindingStringLengthPx(
        layout,
        binding,
        limb,
        isHead
      );

      const jointAsm = rig.getJointAssemblyByKey(binding.part, binding.joint);
      const jointStage = jointAsm ? layout.assemblyToStage(jointAsm) : null;
      if (!jointStage) continue;

      const dx = jointStage.x - fingerData.fingerStage.x;
      const dy = jointStage.y - fingerData.fingerStage.y;
      const chord = Math.hypot(dx, dy);
      const slackPx = isHead ? 0 : Math.max(0, stringLengthPx - chord);

      strings.push({
        id: binding.id,
        finger: fingerData.fingerStage,
        joint: jointStage,
        label: binding.label,
        length: isHead ? chord : stringLengthPx,
        slack: slackPx,
      });
    }

    if (strings.length) this.lastStrings = strings;
    return strings;
  }

  getInitialPose() {
    const bones = {};
    for (const [name, limb] of this.limbs) bones[name] = limb.angle;
    return {
      hasHand: false,
      root: { ...this.root, rotation: 0 },
      bones,
      strings: [],
      fingerNodes: [],
      handSkeleton: { landmarks: [], connections: HAND_CONNECTIONS },
    };
  }

  getHoldPose() {
    const bones = {};
    for (const [name, limb] of this.limbs) bones[name] = limb.angle;
    return {
      hasHand: false,
      root: { ...this.root, rotation: 0 },
      bones,
      strings: [...this.lastStrings],
      fingerNodes: [...this.lastFingerNodes],
      handSkeleton: {
        landmarks: [...(this.lastHandSkeleton?.landmarks ?? [])],
        connections: HAND_CONNECTIONS,
      },
    };
  }
}
