import { clamp, degToRad, radToDeg } from "./utils.js";

/**
 * 孔在装配空间的位置（绕枢轴旋转）
 */
export function holeAt(pivot, holeOffset, angleDeg) {
  const rad = degToRad(angleDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: pivot.x + holeOffset.x * cos - holeOffset.y * sin,
    y: pivot.y + holeOffset.x * sin + holeOffset.y * cos,
  };
}

function shortestAngleDelta(a, b) {
  let d = ((a - b + 180) % 360) - 180;
  if (d < -180) d += 360;
  return d;
}

/**
 * 已知孔世界坐标，反解旋转角（与 CSS rotate 一致）
 */
export function angleFromHoleWorld(pivot, holeOffset, targetH) {
  const lx = targetH.x - pivot.x;
  const ly = targetH.y - pivot.y;
  const cross = holeOffset.x * ly - holeOffset.y * lx;
  const dot = holeOffset.x * lx + holeOffset.y * ly;
  return radToDeg(Math.atan2(cross, dot));
}

/**
 * 固定长度提线：|孔 - 指尖| = stringLen，求关节角
 * @param {{ x: number, y: number }} pivot
 * @param {{ x: number, y: number }} finger 装配空间指尖
 * @param {{ x: number, y: number }} holeOffset
 * @param {number} stringLen 固定线长（装配空间，不随动作改变）
 * @param {number} minRot
 * @param {number} maxRot
 * @param {number} [prevAngle]
 */
export function solveFixedStringAngle(
  pivot,
  finger,
  holeOffset,
  stringLen,
  minRot,
  maxRot,
  prevAngle = 0
) {
  const EPS = 0.8;
  const hang = solveGravityHangAngle(holeOffset, minRot, maxRot);
  let bestFeasible = null;
  let bestInfeasible = null;

  // 2D 同平面单边约束：
  // - 绳不可伸长：|finger-hole| <= stringLen
  // - 绳只能拉不能推：满足约束时，关节仅受重力，取最低势能姿态
  // - 若所有角都违约（手把线拉得过紧），取最小超长量的姿态
  for (let a = minRot; a <= maxRot; a += 0.5) {
    const h = holeAt(pivot, holeOffset, a);
    const dist = Math.hypot(h.x - finger.x, h.y - finger.y);
    const continuity = Math.abs(shortestAngleDelta(a, prevAngle));

    if (dist <= stringLen + EPS) {
      const gravityPenalty = Math.abs(shortestAngleDelta(a, hang));
      const score = gravityPenalty * 1.0 + continuity * 0.15;
      if (!bestFeasible || score < bestFeasible.score) {
        bestFeasible = { a, score };
      }
      continue;
    }

    const overstretch = dist - stringLen;
    const gravityPenalty = Math.abs(shortestAngleDelta(a, hang));
    const score = overstretch * 14 + gravityPenalty * 0.12 + continuity * 0.08;
    if (!bestInfeasible || score < bestInfeasible.score) {
      bestInfeasible = { a, score };
    }
  }

  if (bestFeasible) return clamp(bestFeasible.a, minRot, maxRot);
  if (bestInfeasible) return clamp(bestInfeasible.a, minRot, maxRot);
  return clamp(hang, minRot, maxRot);
}

/**
 * 二连杆提线：|末端孔 - 指尖| <= stringLen，同时求 parent/child 关节角。
 * 用于「小臂/小腿提线带动大臂/大腿」。
 * @param {{ x: number, y: number }} finger
 * @param {number} stringLen
 * @param {{ minRot: number, maxRot: number, hangAngle: number, prevAngle: number }} parent
 * @param {{ minRot: number, maxRot: number, hangAngle: number, prevAngle: number }} child
 * @param {(parentDeg: number, childDeg: number) => { x: number, y: number } | null} endAt
 */
export function solveChainStringAngles(
  finger,
  stringLen,
  parent,
  child,
  endAt
) {
  const EPS = 0.8;
  let bestFeasible = null;
  let bestInfeasible = null;

  for (let pa = parent.minRot; pa <= parent.maxRot; pa += 0.5) {
    for (let ca = child.minRot; ca <= child.maxRot; ca += 0.5) {
      const end = endAt(pa, ca);
      if (!end) continue;
      const dist = Math.hypot(end.x - finger.x, end.y - finger.y);
      const cont =
        Math.abs(shortestAngleDelta(pa, parent.prevAngle)) +
        Math.abs(shortestAngleDelta(ca, child.prevAngle));
      const grav =
        Math.abs(shortestAngleDelta(pa, parent.hangAngle)) +
        Math.abs(shortestAngleDelta(ca, child.hangAngle));

      if (dist <= stringLen + EPS) {
        const score = grav * 1.0 + cont * 0.12;
        if (!bestFeasible || score < bestFeasible.score) {
          bestFeasible = { parent: pa, child: ca, score };
        }
      } else {
        const overstretch = dist - stringLen;
        const score = overstretch * 14 + grav * 0.1 + cont * 0.06;
        if (!bestInfeasible || score < bestInfeasible.score) {
          bestInfeasible = { parent: pa, child: ca, score };
        }
      }
    }
  }

  const pick = bestFeasible ?? bestInfeasible;
  if (pick) {
    return {
      parent: clamp(pick.parent, parent.minRot, parent.maxRot),
      child: clamp(pick.child, child.minRot, child.maxRot),
    };
  }
  return {
    parent: clamp(parent.hangAngle, parent.minRot, parent.maxRot),
    child: clamp(child.hangAngle, child.minRot, child.maxRot),
  };
}

/** 默认固定线长（装配坐标；偏短才容易“拉紧”并跟手） */
export function defaultStringLength(binding, holeOffset) {
  if (binding.stringLength != null) return binding.stringLength;
  const r = Math.hypot(holeOffset.x, holeOffset.y);
  if (binding.part === "torso") return r * 0.72 + 95;
  if (binding.part === "arm_l" || binding.part === "arm_r") {
    return r * 1.12 + 72;
  }
  return r * 1.18 + 78;
}

export function solveGravityHangAngle(holeOffset, minRot, maxRot) {
  const { x: vx, y: vy } = holeOffset;
  let best = minRot;
  let bestY = -Infinity;
  for (let a = minRot; a <= maxRot; a += 1) {
    const rad = degToRad(a);
    const hy = vx * Math.sin(rad) + vy * Math.cos(rad);
    if (hy > bestY) {
      bestY = hy;
      best = a;
    }
  }
  return best;
}
