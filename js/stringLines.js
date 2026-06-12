/**
 * 在皮影背景场景上绘制五指结点与提线（2D 平面内近似悬链线下垂）
 */
function quadPoint(p0, c, p1, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y,
  };
}

function quadLength(p0, c, p1, steps = 18) {
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const cur = quadPoint(p0, c, p1, t);
    len += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    prev = cur;
  }
  return len;
}

function solveSagByLength(p0, p1, targetLen) {
  const chord = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (targetLen <= chord + 0.4) {
    return {
      cx: (p0.x + p1.x) / 2,
      cy: (p0.y + p1.y) / 2,
      curved: false,
    };
  }

  const cx = (p0.x + p1.x) / 2;
  const floorY = Math.max(p0.y, p1.y);
  let lo = 0;
  let hi = Math.min(Math.max(24, targetLen), 520);
  let bestSag = hi;

  for (let i = 0; i < 18; i++) {
    const sag = (lo + hi) / 2;
    const cy = floorY + sag;
    const len = quadLength(p0, { x: cx, y: cy }, p1, 16);
    if (len >= targetLen) {
      bestSag = sag;
      hi = sag;
    } else {
      lo = sag;
    }
  }

  return { cx, cy: floorY + bestSag, curved: true };
}

export class StringLines {
  constructor(canvas, stageLayer) {
    this.canvas = canvas;
    this.stageLayer = stageLayer;
    this.ctx = canvas.getContext("2d");
  }

  resize() {
    const rect = this.stageLayer.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._w = rect.width;
    this._h = rect.height;
  }

  draw(payload) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this._w, this._h);

    const strings = payload.strings ?? [];
    const fingerNodes = payload.fingerNodes ?? [];
    const handSkeleton = payload.handSkeleton ?? { landmarks: [], connections: [] };

    this._drawHandSkeleton(ctx, handSkeleton);

    for (const s of strings) {
      if (!s.finger || !s.joint) continue;
      const dx = s.joint.x - s.finger.x;
      const dy = s.joint.y - s.finger.y;
      const chord = Math.hypot(dx, dy) || 1;
      const taut = (s.slack ?? 0) <= 0.5;
      const targetLen = taut
        ? chord
        : Math.max(chord, s.length ?? chord);
      const solved = taut
        ? { curved: false }
        : solveSagByLength(s.finger, s.joint, targetLen);

      ctx.beginPath();
      ctx.moveTo(s.finger.x, s.finger.y);
      if (solved.curved) {
        ctx.quadraticCurveTo(solved.cx, solved.cy, s.joint.x, s.joint.y);
      } else {
        ctx.lineTo(s.joint.x, s.joint.y);
      }
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    for (const n of fingerNodes) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 215, 70, 0.95)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    for (const s of strings) {
      if (!s.joint) continue;
      ctx.beginPath();
      ctx.arc(s.joint.x, s.joint.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.32)";
      ctx.fill();
    }
  }

  clear() {
    this.ctx?.clearRect(0, 0, this._w, this._h);
  }

  _drawHandSkeleton(ctx, handSkeleton) {
    const landmarks = handSkeleton.landmarks ?? [];
    const connections = handSkeleton.connections ?? [];
    if (!landmarks.length) return;

    const byIndex = new Map(landmarks.map((lm) => [lm.index, lm]));

    ctx.strokeStyle = "rgba(232, 197, 71, 0.42)";
    ctx.lineWidth = 1.2;
    for (const [a, b] of connections) {
      const p0 = byIndex.get(a);
      const p1 = byIndex.get(b);
      if (!p0 || !p1) continue;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    for (const lm of landmarks) {
      if (lm.isTip) continue;
      ctx.beginPath();
      ctx.arc(lm.x, lm.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(232, 197, 71, 0.55)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}
