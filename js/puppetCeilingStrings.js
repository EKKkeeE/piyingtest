const CEILING_Y = 8;

/** @type {ReadonlyArray<{ part: string, joint?: string, local?: [number, number] }>} */
const BOSS_STRING_SLOTS = [
  { part: "torso", joint: "head" },
  { part: "arm_l", joint: "wrist" },
  { part: "arm_r", joint: "wrist" },
  { part: "leg_l", local: [42, 506] },
  { part: "leg_r", local: [38, 510] },
];

/**
 * @param {import('./puppetRig.js').PuppetRig} bossRig
 * @param {DOMRect} stageRect
 * @param {{ part: string, joint?: string, local?: [number, number] }} slot
 */
function getBossStringPoint(bossRig, stageRect, slot) {
  if (slot.joint) {
    return bossRig.getJointStage(slot.part, slot.joint, stageRect);
  }
  if (slot.local) {
    return bossRig.getLocalPointStage(
      slot.part,
      slot.local[0],
      slot.local[1],
      stageRect
    );
  }
  return null;
}

/**
 * @param {import('./puppetRig.js').PuppetRig | null} bossRig
 * @param {DOMRect} stageRect
 */
export function buildBossCeilingStrings(bossRig, stageRect) {
  if (!bossRig || !stageRect) return [];
  const strings = [];
  for (const slot of BOSS_STRING_SLOTS) {
    const joint = getBossStringPoint(bossRig, stageRect, slot);
    if (!joint) continue;
    strings.push({
      anchor: { x: joint.x, y: CEILING_Y },
      joint,
    });
  }
  return strings;
}

/**
 * @param {import('./enemySoldier.js').EnemySoldier[]} enemies
 */
export function buildEnemyCeilingStrings(enemies) {
  const strings = [];
  for (const enemy of enemies) {
    if (!enemy?.isAlive?.()) continue;
    const joints = enemy.getCeilingStringJoints?.() ?? [];
    for (const joint of joints) {
      strings.push({
        anchor: { x: joint.x, y: CEILING_Y },
        joint,
      });
    }
  }
  return strings;
}

/**
 * @param {{
 *   bossRig: import('./puppetRig.js').PuppetRig | null,
 *   enemies: import('./enemySoldier.js').EnemySoldier[],
 *   stageRect: DOMRect | null | undefined,
 *   bossPhase: string,
 * }} ctx
 */
export function buildAllCeilingStrings(ctx) {
  const { bossRig, enemies, stageRect, bossPhase } = ctx;
  if (!stageRect) return [];

  const strings = buildEnemyCeilingStrings(enemies);
  if (
    bossRig &&
    (bossPhase === "boss" || bossPhase === "bossIntro")
  ) {
    strings.push(...buildBossCeilingStrings(bossRig, stageRect));
  }
  return strings;
}
