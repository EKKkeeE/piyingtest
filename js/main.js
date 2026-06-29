import { PuppetRig } from "./puppetRig.js";
import { FingerMarionette } from "./fingerMarionette.js";
import { StringLines } from "./stringLines.js";
import { buildAllCeilingStrings } from "./puppetCeilingStrings.js";
import { LayoutCache } from "./layoutCache.js";
import { createHandDetector, TARGET_DETECT_FPS } from "./handDetect.js";
import { CurtainAnimation } from "./curtainAnimation.js";
import { BgmPlayer } from "./bgm.js";
import { VictoryVoicePlayer } from "./victoryVoice.js";
import { StaffGlow } from "./staffGlow.js";
import { StaffComboAttack } from "./staffComboAttack.js";
import { AttackFramePlayer } from "./attackFramePlayer.js";
import { UltimateAttack } from "./ultimateAttack.js";
import { UltimateFramePlayer } from "./ultimateFramePlayer.js";
import { EnemySoldier } from "./enemySoldier.js";
import { EnemySwordQiManager } from "./enemySwordQi.js";
import { BossAI } from "./bossAI.js";
import { BossGhostFireManager } from "./bossGhostFire.js";
import { PeachPickupManager } from "./peachPickup.js";
import { ResultParticles } from "./resultParticles.js";
import {
  detectOkSignFromResult,
  detectPeaceSignFromResult,
} from "./gestureDetect.js";

const CAMERA_TARGET_FPS = 60;
/** 皮影模拟固定步长，与手部检测对齐，避免高刷屏 variable-dt 插值节奏错乱 */
const SIM_DT = 1 / TARGET_DETECT_FPS;
const MAX_SIM_STEPS = 3;
const DEBUG =
  new URLSearchParams(location.search).has("debug") ||
  new URLSearchParams(location.search).has("d");
/** 开发阶段：显示「直进 Boss」调试按钮，上线前设为 false 并删除相关代码 */
const DEV_BOSS_SKIP_BTN = true;
const USE_GPU = !new URLSearchParams(location.search).has("cpu");
/** MediaPipe 是否成功启用 GPU 推理 */
let gpuHandEnabled = false;

/** @type {import('@mediapipe/tasks-vision').HandLandmarker | null} */
let handLandmarker = null;
/** @type {import('./puppetRig.js').PuppetRig | null} */
let playerRig = null;
/** @type {import('./puppetRig.js').PuppetRig | null} */
let bossRig = null;
let fingerCtrl = null;
/** @type {StringLines | null} */
let stringLines = null;
/** @type {LayoutCache | null} */
let layoutCache = null;
/** @type {ReturnType<createHandDetector> | null} */
let handDetector = null;
let running = false;
let animId = 0;
let lastTs = 0;
let simAccum = 0;
/** @type {{ hasHand: boolean, bones: object, strings: Array } | null} */
let lastPose = null;
/** @type {MediaStream | null} */
let cameraStream = null;

const els = {
  app: document.getElementById("app"),
  startOverlay: document.getElementById("start-overlay"),
  startBtn: document.getElementById("start-btn"),
  errorBox: document.getElementById("error-box"),
  hud: document.getElementById("hud"),
  battleHud: document.getElementById("battle-hud"),
  playerHpFill: document.getElementById("player-hp-fill"),
  bossHpFill: document.getElementById("boss-hp-fill"),
  bossHudBlock: document.querySelector(".boss-hud-block"),
  resultOverlay: document.getElementById("result-overlay"),
  resultCard: document.querySelector(".result-card"),
  resultVictoryText: document.getElementById("result-victory-text"),
  resultDefeatText: document.getElementById("result-defeat-text"),
  resultTitle: document.getElementById("result-title"),
  resultParticlesCanvas: document.getElementById("result-particles"),
  restartBtn: document.getElementById("restart-btn"),
  video: /** @type {HTMLVideoElement} */ (document.getElementById("camera")),
  debugCanvas: /** @type {HTMLCanvasElement} */ (
    document.getElementById("debug-canvas")
  ),
  stringCanvas: /** @type {HTMLCanvasElement} */ (
    document.getElementById("string-canvas")
  ),
  stageInteraction: document.getElementById("stage-interaction"),
  enemyLayer: document.getElementById("enemy-layer"),
  bossIntroLayer: document.getElementById("boss-intro-layer"),
  goldenPills: document.getElementById("golden-pills"),
  puppetMountPlayer: document.getElementById("puppet-mount-player"),
  puppetMountBoss: document.getElementById("puppet-mount-boss"),
  comboFrameLayer: document.getElementById("combo-frame-layer"),
  comboFrameImg: /** @type {HTMLImageElement} */ (
    document.getElementById("combo-frame-img")
  ),
  ultimateFrameLayer: document.getElementById("ultimate-frame-layer"),
  ultimateFrameImg: /** @type {HTMLImageElement} */ (
    document.getElementById("ultimate-frame-img")
  ),
  stage: document.getElementById("stage"),
  stageCurtain: document.getElementById("stage-curtain"),
  devBossSkipBtn: document.getElementById("dev-boss-skip-btn"),
};

/** @type {CurtainAnimation | null} */
let curtainAnim = null;
/** @type {BgmPlayer | null} */
let bgm = null;
/** @type {VictoryVoicePlayer | null} */
let victoryVoice = null;
/** @type {StaffGlow | null} */
let staffGlow = null;
/** @type {StaffComboAttack | null} */
let staffCombo = null;
/** @type {AttackFramePlayer | null} */
let attackFramePlayer = null;
/** @type {UltimateAttack | null} */
let ultimateAttack = null;
/** @type {UltimateFramePlayer | null} */
let ultimateFramePlayer = null;
/** @type {ResultParticles | null} */
let resultParticles = null;
/** @type {EnemySoldier[]} */
let enemySoldiers = [];
let enemySpawnCount = 0;
let enemySpawnTimer = 0;
let enemyNextSpawnInterval = 0;
/** @type {EnemySwordQiManager | null} */
let enemySwordQi = null;
const ENEMY_SPAWN_INTERVAL_MIN_SEC = 3;
const ENEMY_SPAWN_INTERVAL_MAX_SEC = 5;
const ENEMY_MAX_SPAWNS = 10;
const ENEMY_MAX_ACTIVE = 3;
const PLAYER_MAX_HP = 200;
const BOSS_MAX_HP = 200;
const PLAYER_DAMAGE_PER_HIT = 10;
const PLAYER_IFRAME_SEC = 0.8;
const BOSS_HIT_RADIUS = 90;
const STAFF_HIT_THICKNESS = 56;
const BOSS_MELEE_DAMAGE = 18;
const BOSS_Y_OFFSET = 48;
const BOSS_INTRO_DURATION = 3;
const BOSS_DEATH_ANIMATION_MS = 1400;
const PLAYER_DEATH_ANIMATION_MS = 1400;
const ATTACKS_PER_GOLDEN_PILL = 4;
const MAX_GOLDEN_PILLS = 3;
let playerHp = PLAYER_MAX_HP;
let playerIFrame = 0;
let bossHp = BOSS_MAX_HP;
let bossIntroTimer = 0;
let bossPhase = "minions";
let bossDeathSequenceRunning = false;
let playerDeathSequenceRunning = false;
/** @type {BossAI | null} */
let bossAI = null;
/** @type {BossGhostFireManager | null} */
let bossGhostFires = null;
/** @type {PeachPickupManager | null} */
let peachPickups = null;
let goldenPills = 0;
let goldenAttackCount = 0;
let goldenPillSlots = [];
let comboHitResolved = false;
let lastComboCycleId = -1;

function showError(msg) {
  els.errorBox.textContent = msg;
  els.errorBox.hidden = false;
}

function hideError() {
  els.errorBox.hidden = true;
}

function clearUltimateEarthquake() {
  els.app?.classList.remove(
    "ultimate-earthquake-light",
    "ultimate-earthquake-heavy"
  );
}

function initGoldenPills() {
  goldenPillSlots = Array.from(
    els.goldenPills?.querySelectorAll(".pill-slot") ?? []
  );
  updateGoldenPills();
}

function updateGoldenPills(popIndex = -1) {
  els.goldenPills?.classList.toggle("pills-charged", goldenPills > 0);
  const progressSlot = goldenPills < MAX_GOLDEN_PILLS ? goldenPills : -1;
  const pillProgress =
    goldenPills < MAX_GOLDEN_PILLS
      ? goldenAttackCount / ATTACKS_PER_GOLDEN_PILL
      : 0;
  goldenPillSlots.forEach((slot, index) => {
    const filled = index < goldenPills;
    const progressing = index === progressSlot && pillProgress > 0;
    slot.classList.toggle("pill-filled", filled);
    slot.classList.toggle("pill-progressing", !filled && progressing);
    const clampedProgress = Math.max(
      0,
      Math.min(1, progressing ? pillProgress : 0)
    );
    slot.style.setProperty("--pill-progress", `${clampedProgress}`);
    slot.style.setProperty("--pill-progress-angle", `${clampedProgress}turn`);
    slot.style.setProperty("--pill-progress-width", `${clampedProgress * 100}%`);
    slot.classList.remove("pill-pop");
    if (index === popIndex) {
      void slot.offsetWidth;
      slot.classList.add("pill-pop");
    }
  });
}

function resetGoldenPills() {
  goldenPills = 0;
  goldenAttackCount = 0;
  updateGoldenPills();
}

function updatePlayerHp() {
  const pct = Math.max(0, Math.min(100, (playerHp / PLAYER_MAX_HP) * 100));
  if (els.playerHpFill) {
    els.playerHpFill.style.width = `${pct}%`;
  }
}

function resetPlayerHp() {
  playerHp = PLAYER_MAX_HP;
  playerIFrame = 0;
  updatePlayerHp();
}

function updateBossHp() {
  const pct = Math.max(0, Math.min(100, (bossHp / BOSS_MAX_HP) * 100));
  if (els.bossHpFill) {
    els.bossHpFill.style.width = `${pct}%`;
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value) {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(value) {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(from, to, t) {
  return from + (to - from) * t;
}

function updateBossIntroAnchor() {
  if (!els.bossIntroLayer) return;
  const stageWidth = getStageWidth();
  const xPct = 50 + (getBossHomeX() / Math.max(1, stageWidth)) * 100;
  els.bossIntroLayer.style.setProperty("--boss-intro-x", `${xPct}%`);
}

function clearBossIntroEffects() {
  bossIntroTimer = 0;
  els.app?.classList.remove("boss-intro-shudder");
  if (els.bossIntroLayer) {
    els.bossIntroLayer.hidden = true;
    els.bossIntroLayer.classList.remove("active");
  }
  els.puppetMountBoss?.classList.remove("boss-entering", "boss-melee-glow");
}

function updateDevBossSkipBtn() {
  if (!DEV_BOSS_SKIP_BTN || !els.devBossSkipBtn) return;
  const inBoss = bossPhase === "boss" || bossPhase === "bossIntro";
  const ended = bossPhase === "defeated";
  els.devBossSkipBtn.hidden = false;
  els.devBossSkipBtn.classList.toggle("active", inBoss);
  els.devBossSkipBtn.setAttribute("aria-pressed", inBoss ? "true" : "false");
  els.devBossSkipBtn.textContent = inBoss
    ? "Boss 环节中"
    : ended
      ? "Boss 已结束"
      : "调试：直进 Boss";
  els.devBossSkipBtn.disabled = inBoss || ended;
}

/** 开发用：跳过小怪与登场动画，直接进入 Boss 战 */
function skipToBossPhase() {
  if (!running || !bossRig) return;
  if (bossPhase === "boss" || bossPhase === "bossIntro" || bossPhase === "defeated") {
    return;
  }

  enemySwordQi?.clear();
  if (els.enemyLayer) {
    els.enemyLayer.innerHTML = "";
  }
  enemySoldiers = [];
  enemySpawnCount = ENEMY_MAX_SPAWNS;
  enemySpawnTimer = 0;

  clearBossIntroEffects();
  bossHp = BOSS_MAX_HP;
  bossIntroTimer = 0;
  bossDeathSequenceRunning = false;
  bossGhostFires?.clear();
  bossAI = null;
  updateBossHp();

  if (els.puppetMountBoss) {
    els.puppetMountBoss.hidden = false;
    els.puppetMountBoss.classList.remove("boss-defeated", "boss-entering", "boss-melee-glow");
  }
  bossRig.setRootTransform(getBossHomeX(), BOSS_Y_OFFSET, 0);
  for (const name of Object.keys(bossRig.parts)) {
    bossRig.setBoneRotation(name, 0);
  }
  bossRig.update(0, { direct: true });

  bossPhase = "boss";
  bossAI = createBossAI();
  bossAI.reset(getBossHomeX(), BOSS_Y_OFFSET);

  if (els.bossHudBlock) {
    els.bossHudBlock.hidden = false;
  }
  updateDevBossSkipBtn();
}

function resetBossBattle() {
  bossHp = BOSS_MAX_HP;
  bossIntroTimer = 0;
  bossPhase = "minions";
  bossDeathSequenceRunning = false;
  bossAI = null;
  bossGhostFires?.clear();
  updateBossHp();
  clearBossIntroEffects();
  if (els.bossHudBlock) {
    els.bossHudBlock.hidden = true;
  }
  if (els.puppetMountBoss) {
    els.puppetMountBoss.hidden = true;
    els.puppetMountBoss.classList.remove("boss-defeated", "boss-entering", "boss-melee-glow");
  }
  bossRig?.setRootTransform(getBossHomeX(), BOSS_Y_OFFSET, 0);
  bossRig?.update(0, { direct: true });
  updateDevBossSkipBtn();
}

function resetResultUI() {
  resultParticles?.stop();
  els.resultOverlay?.classList.remove("result-overlay--victory", "result-overlay--defeat");
  if (els.resultVictoryText) els.resultVictoryText.hidden = true;
  if (els.resultDefeatText) els.resultDefeatText.hidden = true;
  if (els.resultOverlay) els.resultOverlay.hidden = true;
}

function resetVictoryResultUI() {
  resetResultUI();
}

function showPlayerVictoryResult() {
  resetResultUI();
  if (els.resultVictoryText) els.resultVictoryText.hidden = false;
  if (els.resultDefeatText) els.resultDefeatText.hidden = true;
  if (els.restartBtn) els.restartBtn.textContent = "再试一次";
  if (els.resultOverlay) {
    els.resultOverlay.classList.add("result-overlay--victory");
    els.resultOverlay.hidden = false;
  }
  resultParticles?.start(/** @type {HTMLElement} */ (els.resultCard));
}

function showPlayerDefeatResult() {
  resetResultUI();
  if (els.resultVictoryText) els.resultVictoryText.hidden = true;
  if (els.resultDefeatText) els.resultDefeatText.hidden = false;
  if (els.resultTitle) els.resultTitle.textContent = "白骨精胜";
  if (els.restartBtn) els.restartBtn.textContent = "再试一次";
  if (els.resultOverlay) {
    els.resultOverlay.classList.add("result-overlay--defeat");
    els.resultOverlay.hidden = false;
  }
}

function healPlayer(amount) {
  if (
    playerHp <= 0 ||
    playerDeathSequenceRunning ||
    bossDeathSequenceRunning
  ) {
    return false;
  }
  const before = playerHp;
  playerHp = Math.min(PLAYER_MAX_HP, playerHp + amount);
  if (playerHp === before) return false;
  updatePlayerHp();
  return true;
}

function damagePlayer(amount) {
  if (
    playerHp <= 0 ||
    playerIFrame > 0 ||
    playerDeathSequenceRunning ||
    bossDeathSequenceRunning
  ) {
    return false;
  }
  playerHp = Math.max(0, playerHp - amount);
  playerIFrame = PLAYER_IFRAME_SEC;
  playerRig?.flashHit();
  updatePlayerHp();
  if (playerHp <= 0) {
    runPlayerDeathSequence();
  }
  return true;
}

async function runPlayerDeathSequence() {
  if (playerDeathSequenceRunning) return;
  playerDeathSequenceRunning = true;

  running = false;
  cancelAnimationFrame(animId);
  bgm?.stop();
  enemySwordQi?.clear();
  bossGhostFires?.clear();
  peachPickups?.clear();
  clearUltimateEarthquake();
  staffGlow?.clear?.();
  attackFramePlayer?.hide();
  ultimateFramePlayer?.hide();
  els.puppetMountPlayer?.classList.remove("combo-active", "ultimate-active");
  els.app?.classList.add("player-defeat-flash");
  els.puppetMountPlayer?.classList.remove("player-defeated");
  void els.puppetMountPlayer?.offsetWidth;
  els.puppetMountPlayer?.classList.add("player-defeated");

  await new Promise((resolve) =>
    setTimeout(resolve, PLAYER_DEATH_ANIMATION_MS)
  );

  els.app?.classList.remove("player-defeat-flash");
  showPlayerDefeatResult();
}

function damageBoss(amount) {
  if (!isBossAttackable()) return false;
  bossHp = Math.max(0, bossHp - amount);
  bossRig.flashHit(amount >= 40 ? 0.35 : 0.2);
  updateBossHp();
  if (bossHp <= 0) {
    bossPhase = "defeated";
    bossAI = null;
    updateDevBossSkipBtn();
    runBossDeathSequence();
  }
  return true;
}

async function runBossDeathSequence() {
  if (bossDeathSequenceRunning) return;
  bossDeathSequenceRunning = true;

  running = false;
  cancelAnimationFrame(animId);
  bgm?.stop();
  bossGhostFires?.clear();
  peachPickups?.clear();
  clearUltimateEarthquake();
  staffGlow?.clear?.();
  attackFramePlayer?.hide();
  ultimateFramePlayer?.hide();
  els.puppetMountPlayer?.classList.remove("combo-active", "ultimate-active");

  if (els.puppetMountBoss) {
    els.puppetMountBoss.classList.remove("boss-entering", "boss-melee-glow");
    els.puppetMountBoss.classList.add("boss-defeated");
  }

  await new Promise((resolve) =>
    setTimeout(resolve, BOSS_DEATH_ANIMATION_MS)
  );

  if (curtainAnim) {
    await curtainAnim.playClose();
  }
  victoryVoice?.play();
  showPlayerVictoryResult();
}

function gainGoldenPill() {
  if (goldenPills >= MAX_GOLDEN_PILLS) return;
  goldenPills += 1;
  updateGoldenPills(goldenPills - 1);
}

function recordNormalAttackHit(hitCount = 1) {
  if (goldenPills >= MAX_GOLDEN_PILLS || hitCount <= 0) return;
  goldenAttackCount += hitCount;
  while (
    goldenAttackCount >= ATTACKS_PER_GOLDEN_PILL &&
    goldenPills < MAX_GOLDEN_PILLS
  ) {
    goldenAttackCount -= ATTACKS_PER_GOLDEN_PILL;
    gainGoldenPill();
  }
  if (goldenPills >= MAX_GOLDEN_PILLS) {
    goldenAttackCount = 0;
  }
  updateGoldenPills();
}

function consumeGoldenPill() {
  if (goldenPills <= 0) return false;
  goldenPills -= 1;
  updateGoldenPills();
  return true;
}

function stopCamera() {
  if (cameraStream) {
    for (const track of cameraStream.getTracks()) {
      track.stop();
    }
    cameraStream = null;
  }
  els.video.srcObject = null;
}

async function openCamera(videoConstraints) {
  return navigator.mediaDevices.getUserMedia({
    video: videoConstraints ?? { facingMode: "user" },
    audio: false,
  });
}

async function acquireCameraStream() {
  stopCamera();
  const fps = { ideal: CAMERA_TARGET_FPS, min: 30 };
  const attempts = [
    {
      facingMode: "user",
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: fps,
    },
    {
      facingMode: "user",
      width: { ideal: 480 },
      height: { ideal: 360 },
      frameRate: fps,
    },
    { facingMode: "user", frameRate: fps },
    true,
  ];
  let lastErr = null;
  for (const video of attempts) {
    try {
      return await openCamera(video === true ? undefined : video);
    } catch (err) {
      lastErr = err;
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        throw err;
      }
    }
  }
  throw lastErr ?? new Error("无法打开摄像头");
}

function formatStartError(err) {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") {
      return "摄像头权限被拒绝。请在浏览器地址栏允许摄像头，或到系统设置中开启后刷新页面。";
    }
    if (err.name === "NotFoundError") {
      return "未检测到摄像头设备。请连接摄像头后重试。";
    }
    if (err.name === "NotReadableError" || err.name === "TrackStartError") {
      return (
        "摄像头被占用。请关闭正在使用摄像头的软件或网页标签后重试。" +
        "建议使用 Chrome/Edge 打开本页。"
      );
    }
  }
  const text = err instanceof Error ? err.message : String(err);
  if (/device in use|not readable|could not start/i.test(text)) {
    return "摄像头被占用。请关闭其他占用摄像头的程序后重试。";
  }
  if (location.protocol === "file:") {
    return "请通过本地服务访问，不要使用 file:// 直接打开。";
  }
  return `启动失败：${text}。请使用 Chrome 或 Edge 访问 http://localhost:3456。`;
}

async function loadRig(path) {
  const res = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`无法加载骨骼配置：${path}`);
  return res.json();
}

async function initHandLandmarker() {
  const { FilesetResolver, HandLandmarker } = await import(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm"
  );
  const wasmPath =
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  const delegates = USE_GPU ? ["GPU", "CPU"] : ["CPU"];
  let lastErr = null;

  for (const delegate of delegates) {
    try {
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate,
        },
        runningMode: "VIDEO",
        numHands: 1,
      });
      gpuHandEnabled = delegate === "GPU";
      console.info(
        `[hand] MediaPipe ${delegate} · ${TARGET_DETECT_FPS} fps · camera target ${CAMERA_TARGET_FPS} fps`
      );
      return;
    } catch (err) {
      lastErr = err;
      handLandmarker = null;
    }
  }

  throw lastErr ?? new Error("无法初始化手部识别");
}

function applyPose(pose) {
  if (!playerRig) return;
  playerRig.setRootTransform(pose.root.x, pose.root.y, pose.root.rotation);

  for (const [name, rot] of Object.entries(pose.bones)) {
    if (!playerRig.parts?.[name]) continue;
    playerRig.setBoneRotation(name, rot);
  }
}

function getStageWidth() {
  const rect =
    layoutCache?.stageRect ??
    els.stageInteraction?.getBoundingClientRect?.() ??
    null;
  return rect?.width || window.innerWidth || 1280;
}

function getBossHomeX() {
  return getStageWidth() * 0.28;
}

function createBossAI() {
  return new BossAI(bossRig, () => playerRig, spawnBossGhostFire, {
    mountEl: els.puppetMountBoss,
    getPlayerTorso: (stageRect) => getPlayerTorsoStage(stageRect),
    onMeleeHit: () => damagePlayer(BOSS_MELEE_DAMAGE),
  });
}

function initSpawnPositions() {
  const playerX = 0;
  playerRig?.setRootTransform(playerX, 0, 0);
  if (fingerCtrl) {
    fingerCtrl.root = { x: playerX, y: 0, rotation: 0 };
  }
  if (bossPhase !== "boss" && bossPhase !== "bossIntro") {
    bossRig?.setRootTransform(getBossHomeX(), BOSS_Y_OFFSET, 0);
  }
}

function drawDebugHands(result) {
  if (!DEBUG || !els.debugCanvas) return;
  const ctx = els.debugCanvas.getContext("2d");
  if (!ctx) return;
  const w = els.debugCanvas.width;
  const h = els.debugCanvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!result?.landmarks?.length) return;

  const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20],
  ];

  for (const lm of result.landmarks) {
    ctx.strokeStyle = "rgba(232, 197, 71, 0.5)";
    ctx.lineWidth = 1;
    for (const [a, b] of connections) {
      ctx.beginPath();
      ctx.moveTo((1 - lm[a].x) * w, lm[a].y * h);
      ctx.lineTo((1 - lm[b].x) * w, lm[b].y * h);
      ctx.stroke();
    }
  }
}

function activeEnemies() {
  return enemySoldiers.filter((enemy) => enemy?.isAlive?.());
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isBossAttackable() {
  return bossPhase === "boss" && bossHp > 0 && !!bossRig;
}

function bossStagePoint(stageRect) {
  if (!isBossAttackable() || !stageRect) return null;
  return (
    bossRig.getJointStage("torso", "root", stageRect) ??
    bossRig.getRootStage(stageRect)
  );
}

function bossContainsStagePoint(point, stageRect) {
  const bossPoint = bossStagePoint(stageRect);
  return !!point && !!bossPoint && dist(point, bossPoint) <= BOSS_HIT_RADIUS;
}

function distPointToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

function bossHitByStaff(from, to, stageRect) {
  const bossPoint = bossStagePoint(stageRect);
  if (!bossPoint || !from || !to) return false;
  return (
    distPointToSegment(bossPoint, from, to) <=
    BOSS_HIT_RADIUS + STAFF_HIT_THICKNESS
  );
}

function minionsCleared() {
  return (
    bossPhase === "minions" &&
    enemySpawnCount >= ENEMY_MAX_SPAWNS &&
    enemySoldiers.length >= ENEMY_MAX_SPAWNS &&
    activeEnemies().length === 0
  );
}

function applyBossIntroPose(progress) {
  if (!bossRig) return;
  const reveal = easeOutCubic(progress);
  const unfurl = easeInOutCubic((progress - 0.18) / 0.58);
  const settle = easeOutCubic((progress - 0.76) / 0.24);
  const homeX = getBossHomeX();
  const startX = homeX + getStageWidth() * 0.18;
  const rise = Math.sin(clamp01(progress) * Math.PI) * -34;
  const omenShake = progress > 0.72 ? Math.sin(progress * 80) * (1 - settle) * 4 : 0;
  const armL = lerp(lerp(52, -76, unfurl), 0, settle);
  const armR = lerp(lerp(-42, 48, unfurl), 0, settle);
  const legL = lerp(lerp(24, -6, unfurl), 0, settle);
  const legR = lerp(lerp(-18, 0, unfurl), 0, settle);

  bossRig.setRootTransform(
    lerp(startX, homeX, reveal),
    BOSS_Y_OFFSET + rise,
    lerp(-10, 0, settle) + omenShake
  );
  bossRig.setBoneRotation("torso", lerp(-18, 0, settle));
  bossRig.setBoneRotation("arm_l", armL + Math.sin(progress * 18) * 5 * (1 - settle));
  bossRig.setBoneRotation("arm_r", armR - Math.sin(progress * 16) * 4 * (1 - settle));
  bossRig.setBoneRotation("leg_l", legL);
  bossRig.setBoneRotation("leg_r", legR);
  bossRig.update(0, { direct: true });
}

function startBossIntro() {
  if (!bossRig || bossPhase !== "minions") return;
  bossPhase = "bossIntro";
  bossHp = BOSS_MAX_HP;
  bossAI = null;
  bossGhostFires?.clear();
  bossIntroTimer = BOSS_INTRO_DURATION;
  updateBossHp();
  if (els.bossHudBlock) {
    els.bossHudBlock.hidden = true;
  }
  updateBossIntroAnchor();
  if (els.bossIntroLayer) {
    els.bossIntroLayer.hidden = false;
    els.bossIntroLayer.classList.remove("active");
    void els.bossIntroLayer.offsetWidth;
    els.bossIntroLayer.classList.add("active");
  }
  els.app?.classList.add("boss-intro-shudder");
  if (els.puppetMountBoss) {
    els.puppetMountBoss.hidden = false;
    els.puppetMountBoss.classList.remove("boss-defeated", "boss-entering", "boss-melee-glow");
    void els.puppetMountBoss.offsetWidth;
    els.puppetMountBoss.classList.add("boss-entering");
  }
  applyBossIntroPose(0);
  updateDevBossSkipBtn();
}

let currentPlayerHitContext = {
  comboActive: false,
  ultimateActive: false,
  comboFrameIndex: 0,
  ultimateFrameIndex: 0,
};

function setPlayerHitContext(context = {}) {
  currentPlayerHitContext = { ...currentPlayerHitContext, ...context };
}

function getPlayerTorsoStage(stageRect) {
  if (!stageRect) return null;

  if (currentPlayerHitContext.ultimateActive && ultimateFramePlayer) {
    const framePoint = ultimateFramePlayer.getBodyStage(
      currentPlayerHitContext.ultimateFrameIndex
    );
    if (framePoint) return framePoint;
  }

  if (currentPlayerHitContext.comboActive && attackFramePlayer) {
    const framePoint = attackFramePlayer.getBodyStage(
      currentPlayerHitContext.comboFrameIndex
    );
    if (framePoint) return framePoint;
  }

  if (!playerRig) return null;
  return (
    playerRig.getJointStage("torso", "root", stageRect) ??
    playerRig.getRootStage(stageRect)
  );
}

const FRAME_BODY_POINT_KEYS = [
  "head",
  "leftHand",
  "rightHand",
  "leftFoot",
  "rightFoot",
  "hit",
  "tip",
];

function getPlayerBodyStagePoints(stageRect) {
  if (!stageRect) return [];

  if (currentPlayerHitContext.ultimateActive && ultimateFramePlayer) {
    return FRAME_BODY_POINT_KEYS.map((key) =>
      ultimateFramePlayer.getPoint(currentPlayerHitContext.ultimateFrameIndex, key)
    ).filter(Boolean);
  }

  if (currentPlayerHitContext.comboActive && attackFramePlayer) {
    return FRAME_BODY_POINT_KEYS.map((key) =>
      attackFramePlayer.getPoint(currentPlayerHitContext.comboFrameIndex, key)
    ).filter(Boolean);
  }

  if (!playerRig) return [];

  const points = [];
  for (const partName of Object.keys(playerRig.parts)) {
    const joints = playerRig.parts[partName]?.joints ?? {};
    for (const jointKey of Object.keys(joints)) {
      const point = playerRig.getJointStage(partName, jointKey, stageRect);
      if (point) points.push(point);
    }
  }
  return points;
}

function getBossGhostFireSpawns(stageRect) {
  if (!bossRig || !stageRect) return [];
  const slots = [
    { part: "arm_l", joint: "wrist", launchAngleOffset: 0.78 },
    { part: "arm_l", joint: "wrist", launchAngleOffset: 0.42 },
    { part: "arm_r", joint: "wrist", launchAngleOffset: -0.36 },
    { part: "arm_r", joint: "wrist", launchAngleOffset: -0.68 },
  ];

  const spawns = [];
  for (const slot of slots) {
    const point = bossRig.getJointStage(slot.part, slot.joint, stageRect);
    if (!point) continue;
    spawns.push({
      x: point.x,
      y: point.y,
      launchAngleOffset: slot.launchAngleOffset,
    });
  }
  return spawns;
}

function spawnBossGhostFire() {
  const stageRect = layoutCache?.stageRect;
  if (!stageRect || !bossRig || !bossGhostFires) return;
  // 攻击姿态先写入 DOM，再读取挂点，避免鬼火从错误位置飞出
  bossRig.update(0, { direct: true, idle: false });
  const spawns = getBossGhostFireSpawns(stageRect);
  if (!spawns.length) return;
  bossGhostFires.spawnBurst(spawns, getPlayerTorsoStage(stageRect));
}

function finishBossIntro() {
  if (!bossRig || bossPhase !== "bossIntro") return;
  bossPhase = "boss";
  clearBossIntroEffects();
  bossHp = BOSS_MAX_HP;
  updateBossHp();
  if (els.bossHudBlock) {
    els.bossHudBlock.hidden = false;
  }
  bossAI = createBossAI();
  bossAI.reset(getBossHomeX(), BOSS_Y_OFFSET);
  updateDevBossSkipBtn();
}

function updateBossBattle(dt, stageRect) {
  if (bossPhase === "minions" && minionsCleared()) {
    startBossIntro();
  }
  if (bossPhase === "bossIntro") {
    bossIntroTimer = Math.max(0, bossIntroTimer - dt);
    applyBossIntroPose(1 - bossIntroTimer / BOSS_INTRO_DURATION);
    if (bossIntroTimer <= 0) {
      finishBossIntro();
    }
    return;
  }
  if (bossPhase !== "boss" || !bossAI || !bossRig || !stageRect) return;

  bossAI.update(dt, stageRect);

  const playerTorso = getPlayerTorsoStage(stageRect);
  bossGhostFires?.update(dt, playerTorso, damagePlayer);
}

function restartBattle() {
  resetResultUI();
  playerDeathSequenceRunning = false;
  els.app?.classList.remove("player-defeat-flash");
  els.puppetMountPlayer?.classList.remove("player-defeated");
  setPlayerHitContext({
    comboActive: false,
    ultimateActive: false,
    comboFrameIndex: 0,
    ultimateFrameIndex: 0,
  });
  curtainAnim?.snapOpen();
  victoryVoice?.stop();
  clearUltimateEarthquake();
  attackFramePlayer?.hide();
  ultimateFramePlayer?.hide();
  staffGlow?.clear?.();
  staffCombo?.reset();
  ultimateAttack?.reset();
  comboHitResolved = false;
  lastComboCycleId = -1;
  resetGoldenPills();
  resetPlayerHp();
  resetEnemyBattle();
  resetBossBattle();
  initSpawnPositions();
  lastPose = fingerCtrl?.getInitialPose() ?? null;
  if (lastPose) {
    applyPose(lastPose);
    playerRig?.update(0, { direct: true });
  }
  bgm?.resumeAfterRestart?.();
  running = true;
  lastTs = 0;
  simAccum = 0;
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
  ensureEnemySpawned();
  updateDevBossSkipBtn();
}

function applyPlayerAttackDamage(staffSegments, damage) {
  const segments = Array.isArray(staffSegments) ? staffSegments : [staffSegments];
  const valid = segments.filter((seg) => seg?.from && seg?.to);
  if (!valid.length) return 0;

  let hitCount = 0;
  for (const enemy of activeEnemies()) {
    const hit = valid.some((seg) =>
      enemy.intersectsStaff(seg.from, seg.to, STAFF_HIT_THICKNESS)
    );
    if (hit && enemy.takeDamage(damage)) {
      hitCount += 1;
    }
  }
  if (isBossAttackable()) {
    const bossHit = valid.some((seg) =>
      bossHitByStaff(seg.from, seg.to, layoutCache?.stageRect)
    );
    if (bossHit && damageBoss(damage)) hitCount += 1;
  }
  return hitCount;
}

function applyUltimateAttackDamage(hitPoint) {
  for (const enemy of activeEnemies()) {
    enemy.takeDamage(enemy.containsStagePoint(hitPoint) ? 40 : 20);
  }
  if (isBossAttackable()) {
    damageBoss(bossContainsStagePoint(hitPoint, layoutCache?.stageRect) ? 40 : 20);
  }
}

function spawnEnemySwordQi(origin, target) {
  enemySwordQi?.spawn(origin, target);
}

function spawnEnemy() {
  if (
    !els.enemyLayer ||
    enemySpawnCount >= ENEMY_MAX_SPAWNS ||
    activeEnemies().length >= ENEMY_MAX_ACTIVE
  ) {
    return;
  }
  const stageRect =
    layoutCache?.stageRect ??
    els.stageInteraction?.getBoundingClientRect?.() ??
    null;
  if (!stageRect?.width || !stageRect?.height) return;
  const enemy = new EnemySoldier(els.enemyLayer, spawnEnemySwordQi);
  enemy.spawn(stageRect);
  enemySoldiers.push(enemy);
  enemySpawnCount += 1;
}

function randomEnemySpawnInterval() {
  return (
    ENEMY_SPAWN_INTERVAL_MIN_SEC +
    Math.random() *
      (ENEMY_SPAWN_INTERVAL_MAX_SEC - ENEMY_SPAWN_INTERVAL_MIN_SEC)
  );
}

function resetEnemyBattle() {
  enemySwordQi?.clear();
  peachPickups?.reset();
  enemySoldiers = [];
  enemySpawnCount = 0;
  enemySpawnTimer = 0;
  enemyNextSpawnInterval = randomEnemySpawnInterval();
  if (els.enemyLayer) {
    els.enemyLayer.innerHTML = "";
  }
}

function ensureEnemySpawned() {
  if (enemySpawnCount > 0) return;
  spawnEnemy();
}

function updateEnemy(dt, stageRect) {
  playerIFrame = Math.max(0, playerIFrame - dt);
  if (enemySpawnCount < ENEMY_MAX_SPAWNS) {
    enemySpawnTimer += dt;
    if (enemySpawnTimer >= enemyNextSpawnInterval) {
      enemySpawnTimer = 0;
      enemyNextSpawnInterval = randomEnemySpawnInterval();
      spawnEnemy();
    }
  }
  const playerTorso = getPlayerTorsoStage(stageRect);
  for (const enemy of enemySoldiers) {
    enemy.update(dt, playerTorso);
  }
  enemySwordQi?.update(dt, playerTorso, damagePlayer);
  peachPickups?.update(dt, stageRect, getPlayerBodyStagePoints(stageRect), {
    onHeal: healPlayer,
  });
}

function loop(ts) {
  if (!running) return;
  animId = requestAnimationFrame(loop);

  const frameDt = lastTs ? Math.min((ts - lastTs) / 1000, 0.1) : SIM_DT;
  lastTs = ts;

  if (handLandmarker && handDetector && fingerCtrl && playerRig && layoutCache) {
    const handTick = handDetector.tick(handLandmarker, ts);

    if (!lastPose) {
      lastPose = fingerCtrl.getInitialPose();
      applyPose(lastPose);
    }

    if (handTick?.fresh) {
      fingerCtrl.updateFromHand(handTick.result, layoutCache);
      if (DEBUG) drawDebugHands(handTick.result);
    }

    layoutCache.refresh();

    simAccum = Math.min(simAccum + frameDt, SIM_DT * MAX_SIM_STEPS);
    let steps = 0;
    while (simAccum >= SIM_DT && steps < MAX_SIM_STEPS) {
      simAccum -= SIM_DT;
      steps += 1;
      lastPose = fingerCtrl.step(SIM_DT, playerRig, layoutCache);
      applyPose(lastPose);
    }

    const pose = lastPose;

    const stageRect = layoutCache.stageRect;

    const cachedHand = handDetector.getCached();
    const okSign = detectOkSignFromResult(cachedHand);
    const ultimate = ultimateAttack?.step(frameDt, {
      okSign: okSign && goldenPills > 0,
      root: pose.root,
    });
    if (ultimate?.justStarted) {
      consumeGoldenPill();
      enemySwordQi?.clear();
      bossGhostFires?.clear();
      peachPickups?.clear();
    }
    const ultimateActive = !!ultimate?.active;
    const isPeaceSign = ultimateActive
      ? false
      : detectPeaceSignFromResult(cachedHand);
    const combo = ultimateActive
      ? { active: false }
      : staffCombo?.step(frameDt, {
          peaceSign: isPeaceSign,
          pose,
        });

    const comboActive = !!combo?.active;
    const frameAnimActive = comboActive || ultimateActive;

    if (frameAnimActive) {
      playerRig.update(SIM_DT, {
        idle: !pose?.hasHand,
        direct: true,
        alpha: pose?.hasHand ? 0.45 : 0.12,
        skipDom: true,
      });
    } else {
      playerRig.update(SIM_DT, {
        idle: !pose?.hasHand,
        direct: true,
        alpha: pose?.hasHand ? 0.45 : 0.12,
      });
    }
    els.puppetMountPlayer?.classList.toggle("combo-active", comboActive);
    els.puppetMountPlayer?.classList.toggle("ultimate-active", ultimateActive);
    els.app?.classList.toggle(
      "ultimate-earthquake-light",
      ultimateActive && (ultimate.frameIndex ?? 0) < 8
    );
    els.app?.classList.toggle(
      "ultimate-earthquake-heavy",
      ultimateActive && (ultimate.frameIndex ?? 0) >= 8
    );

    if (ultimateActive && stageRect) {
      ultimateFramePlayer?.show(
        ultimate.frameIndex ?? 0,
        ultimate.root ?? pose.root,
        stageRect
      );
      if (ultimate?.justImpacted) {
        applyUltimateAttackDamage(
          ultimateFramePlayer?.getHitPoint(ultimate.frameIndex ?? 8)
        );
      }
      attackFramePlayer?.hide();
    } else {
      ultimateFramePlayer?.hide();
      clearUltimateEarthquake();
    }

    if (comboActive && stageRect) {
      if ((combo.cycleId ?? 0) !== lastComboCycleId) {
        comboHitResolved = false;
        lastComboCycleId = combo.cycleId ?? 0;
      }
      attackFramePlayer?.show(combo.frameIndex ?? 0, pose.root, stageRect);
      if (!comboHitResolved) {
        const segments =
          attackFramePlayer?.getStaffSegments(combo.frameIndex ?? 0) ?? [];
        const hitCount = applyPlayerAttackDamage(segments, 10);
        if (hitCount > 0) {
          comboHitResolved = true;
          recordNormalAttackHit(hitCount);
        }
      }
    } else {
      comboHitResolved = false;
      lastComboCycleId = -1;
      attackFramePlayer?.hide();
    }

    setPlayerHitContext({
      comboActive,
      ultimateActive,
      comboFrameIndex: combo?.frameIndex ?? 0,
      ultimateFrameIndex: ultimate?.frameIndex ?? 0,
    });

    if (stageRect) {
      ensureEnemySpawned();
      updateEnemy(frameDt, stageRect);
      updateBossBattle(frameDt, stageRect);
    }

    const strings = ultimateActive
      ? ultimateFramePlayer?.buildStrings(
          pose.fingerNodes ?? [],
          ultimate?.frameIndex ?? 0
        ) ?? []
      : comboActive
      ? attackFramePlayer?.buildStrings(
          pose.fingerNodes ?? [],
          combo?.frameIndex ?? 0
        ) ?? []
      : fingerCtrl.buildStringsFromDom(playerRig, layoutCache);

    const handSkeleton = fingerCtrl.syncHandSkeletonWithStrings(
      pose.handSkeleton ?? { landmarks: [], connections: [] },
      strings
    );

    stringLines?.draw({
      fingerNodes: [],
      strings: strings.length ? strings : pose.strings ?? [],
      handSkeleton,
      ceilingStrings: buildAllCeilingStrings({
        bossRig,
        enemies: enemySoldiers,
        stageRect,
        bossPhase,
      }),
    });

    if (stageRect) {
      staffGlow?.draw(frameDt, {
        active: false,
        playerRig,
        stageRect,
      });
    }
  } else {
    simAccum = 0;
    playerRig?.update(SIM_DT, { idle: true, alpha: 0.1 });
  }
}

async function initPuppet() {
  const [playerRigData, bossRigData] = await Promise.all([
    loadRig("assets/wukong/rig.json"),
    loadRig("assets/baigujing/rig.json"),
  ]);

  els.puppetMountPlayer.innerHTML = "";
  if (els.puppetMountBoss) {
    els.puppetMountBoss.innerHTML = "";
  }

  playerRig = new PuppetRig(els.puppetMountPlayer, playerRigData);
  bossRig = els.puppetMountBoss
    ? new PuppetRig(els.puppetMountBoss, bossRigData)
    : null;
  fingerCtrl = new FingerMarionette(playerRigData);
  layoutCache = new LayoutCache(
    els.stageInteraction,
    () => playerRig,
    els.puppetMountPlayer
  );
  layoutCache.refresh(true);

  if (!bossGhostFires) {
    bossGhostFires = new BossGhostFireManager(els.enemyLayer);
  } else {
    bossGhostFires.clear();
  }
  if (!enemySwordQi) {
    enemySwordQi = new EnemySwordQiManager(els.enemyLayer);
  } else {
    enemySwordQi.clear();
  }
  if (!peachPickups) {
    peachPickups = new PeachPickupManager(els.enemyLayer);
  } else {
    peachPickups.reset();
  }

  initSpawnPositions();

  lastPose = fingerCtrl.getInitialPose();
  applyPose(lastPose);
  playerRig.update(0, { direct: true });
  resetBossBattle();
}

async function startExperience() {
  hideError();
  els.startBtn.disabled = true;
  els.startBtn.textContent = "正在加载...";

  try {
    const stream = await acquireCameraStream();
    cameraStream = stream;
    els.video.srcObject = stream;
    await els.video.play();

    await initHandLandmarker();
    handDetector = createHandDetector(els.video, {
      detectFps: TARGET_DETECT_FPS,
    });

    if (DEBUG) {
      els.debugCanvas.width = els.video.videoWidth || 640;
      els.debugCanvas.height = els.video.videoHeight || 480;
    }

    stringLines = new StringLines(els.stringCanvas, els.stageInteraction);
    stringLines.resize();

    if (!staffGlow) {
      staffGlow = new StaffGlow(
        document.getElementById("staff-glow-canvas"),
        els.stageInteraction
      );
    }
    staffGlow.resize();
    if (!staffCombo) staffCombo = new StaffComboAttack();
    staffCombo.reset();
    if (!attackFramePlayer) {
      attackFramePlayer = new AttackFramePlayer(
        els.comboFrameLayer,
        els.comboFrameImg
      );
    }
    attackFramePlayer.hide();
    if (!ultimateAttack) ultimateAttack = new UltimateAttack();
    ultimateAttack.reset();
    if (!ultimateFramePlayer) {
      ultimateFramePlayer = new UltimateFramePlayer(
        els.ultimateFrameLayer,
        els.ultimateFrameImg
      );
    }
    ultimateFramePlayer.hide();
    initGoldenPills();
    resetGoldenPills();
    resetPlayerHp();
    if (els.battleHud) {
      els.battleHud.hidden = false;
    }
    resetVictoryResultUI();
    resetEnemyBattle();

    await initPuppet();

    els.startOverlay.classList.add("hidden");

    running = true;
    lastTs = 0;
    simAccum = 0;
    cancelAnimationFrame(animId);
    animId = requestAnimationFrame(loop);

    if (!curtainAnim && els.stageCurtain) {
      curtainAnim = new CurtainAnimation(els.stageCurtain);
    }
    if (!bgm) bgm = new BgmPlayer();
    bgm.scheduleStart(3000);
    if (!victoryVoice) victoryVoice = new VictoryVoicePlayer();
    await curtainAnim?.play();
    ensureEnemySpawned();
    updateDevBossSkipBtn();
    if (DEBUG) {
      document.getElementById("camera-panel")?.classList.add("debug-on");
    }
  } catch (err) {
    console.error(err);
    stopCamera();
    running = false;
    showError(formatStartError(err));
    els.startBtn.disabled = false;
    els.startBtn.textContent = "重试";
  }
}

els.startBtn?.addEventListener("click", startExperience);
els.restartBtn?.addEventListener("click", restartBattle);
els.devBossSkipBtn?.addEventListener("click", skipToBossPhase);

if (els.stageCurtain) {
  curtainAnim = new CurtainAnimation(els.stageCurtain);
  curtainAnim.preload().catch(() => {});
}

if (els.resultParticlesCanvas) {
  resultParticles = new ResultParticles(
    /** @type {HTMLCanvasElement} */ (els.resultParticlesCanvas)
  );
}

window.addEventListener("pagehide", () => {
  running = false;
  cancelAnimationFrame(animId);
  clearUltimateEarthquake();
  bgm?.stop();
  victoryVoice?.stop();
  stopCamera();
});

window.addEventListener("resize", () => {
  stringLines?.resize();
  staffGlow?.resize();
  layoutCache?.refresh(true);
  curtainAnim?.resize();
  updateBossIntroAnchor();
  if (resultParticles?.running) {
    resultParticles.resize();
    resultParticles.setCard(/** @type {HTMLElement} */ (els.resultCard));
  }
  initSpawnPositions();
  if (bossAI) {
    bossAI.homeX = getBossHomeX();
  }
  if (DEBUG && els.video.videoWidth) {
    els.debugCanvas.width = els.video.videoWidth;
    els.debugCanvas.height = els.video.videoHeight;
  }
});
