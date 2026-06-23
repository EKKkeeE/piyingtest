/**
 * 在皮影背景场景上绘制五指结点与绷紧提线（指尖→孔位直线，与示意图一致）
 */

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
    const handSkeleton = payload.handSkeleton ?? { landmarks: [], connections: [] };

    this._drawHandSkeleton(ctx, handSkeleton);

    for (const s of strings) {
      const finger = s.fingerPt ?? s.finger;
      if (!finger || !s.joint) continue;

      ctx.beginPath();
      ctx.moveTo(finger.x, finger.y);
      ctx.lineTo(s.joint.x, s.joint.y);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(finger.x, finger.y, 6, 0, Math.PI * 2);
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
