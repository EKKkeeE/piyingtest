/** 多段骨骼悟空：食指提线控制的金箍棒前臂 */
export const STAFF_ATTACK_PART = "lower_arm_r";

/**
 * lower_arm_r 贴图局部坐标：金箍端点质心定角度，再沿该轴延伸至整根棒长
 * 贴图 344×729
 */
export const STAFF_POLYLINE = [
  { x: 332, y: -22 },
  { x: 284, y: 231 },
  { x: 237, y: 484 },
  { x: 188, y: 744 },
];

/**
 * @param {import('./puppetRig.js').PuppetRig} playerRig
 * @param {DOMRect} stageRect
 * @returns {Array<{ x: number, y: number }>}
 */
export function getStaffGlowPath(playerRig, stageRect) {
  return STAFF_POLYLINE.map((pt) =>
    playerRig.getLocalPointStage(STAFF_ATTACK_PART, pt.x, pt.y, stageRect)
  ).filter(Boolean);
}
