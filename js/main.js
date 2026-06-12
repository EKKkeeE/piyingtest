import { PuppetRig } from "./puppetRig.js";
import { FingerMarionette } from "./fingerMarionette.js";
import { StringLines } from "./stringLines.js";
import { LayoutCache } from "./layoutCache.js";
import { createHandDetector } from "./handDetect.js";
import { CurtainAnimation } from "./curtainAnimation.js";
import { BgmPlayer } from "./bgm.js";
import { StaffGlow } from "./staffGlow.js";
import { StaffComboAttack } from "./staffComboAttack.js";
import { AttackFramePlayer } from "./attackFramePlayer.js";
import { UltimateAttack } from "./ultimateAttack.js";
import { UltimateFramePlayer } from "./ultimateFramePlayer.js";
import { EnemySoldier } from "./enemySoldier.js";
import {
  detectOkSignFromResult,
  detectPeaceSignFromResult,
} from "./gestureDetect.js";
const DEBUG =
  new URLSearchParams(location.search).has("debug") ||
  new URLSearchParams(location.search).has("d");
const USE_GPU = !new URLSearchParams(location.search).has("cpu");

/** @type {import('@mediapipe/tasks-vision').HandLandmarker | null} */
let handLandmarker = null;
/** @type {import('./puppetRig.js').PuppetRig | null} */
let playerRig = null;
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
  video: /** @type {HTMLVideoElement} */ (document.getElementById("camera")),
  debugCanvas: /** @type {HTMLCanvasElement} */ (
    document.getElementById("debug-canvas")
  ),
  stringCanvas: /** @type {HTMLCanvasElement} */ (
    document.getElementById("string-canvas")
  ),
  stageInteraction: document.getElementById("stage-interaction"),
  enemyLayer: document.getElementById("enemy-layer"),
  goldenPills: document.getElementById("golden-pills"),
  puppetMountPlayer: document.getElementById("puppet-mount-player"),
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
};

/** @type {CurtainAnimation | null} */
let curtainAnim = null;
/** @type {BgmPlayer | null} */
let bgm = null;
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
/** @type {EnemySoldier[]} */
let enemySoldiers = [];
let enemySpawnCount = 0;
let enemySpawnTimer = 0;
const ENEMY_SPAWN_INTERVAL_SEC = 7;
const ENEMY_MAX_SPAWNS = 4;
const PLAYER_MAX_HP = 200;
const PLAYER_DAMAGE_PER_HIT = 10;
const PLAYER_IFRAME_SEC = 0.8;
const ATTACKS_PER_GOLDEN_PILL = 4;
const MAX_GOLDEN_PILLS = 3;
let playerHp = PLAYER_MAX_HP;
let playerIFrame = 0;
let goldenPills = 0;
let goldenAttackCount = 0;
let goldenPillSlots = [];

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
  goldenPillSlots.forEach((slot, index) => {
    slot.classList.toggle("pill-filled", index < goldenPills);
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

function damagePlayer(amount) {
  if (playerHp <= 0 || playerIFrame > 0) return false;
  playerHp = Math.max(0, playerHp - amount);
  playerIFrame = PLAYER_IFRAME_SEC;
  playerRig?.flashHit();
  updatePlayerHp();
  return true;
}

function gainGoldenPill() {
  if (goldenPills >= MAX_GOLDEN_PILLS) return;
  goldenPills += 1;
  updateGoldenPills(goldenPills - 1);
}

function recordNormalAttackHit() {
  if (goldenPills >= MAX_GOLDEN_PILLS) return;
  goldenAttackCount += 1;
  if (goldenAttackCount >= ATTACKS_PER_GOLDEN_PILL) {
    goldenAttackCount = 0;
    gainGoldenPill();
  }
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
  const attempts = [
    { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    { facingMode: "user", width: { ideal: 480 }, height: { ideal: 360 } },
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
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: USE_GPU ? "GPU" : "CPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
  });
}

function applyPose(pose) {
  if (!playerRig) return;
  playerRig.setRootTransform(pose.root.x, pose.root.y, pose.root.rotation);

  for (const [name, rot] of Object.entries(pose.bones)) {
    if (!playerRig.parts?.[name]) continue;
    playerRig.setBoneRotation(name, rot);
  }
}

function initSpawnPositions() {
  const playerX = 0;
  playerRig?.setRootTransform(playerX, 0, 0);
  if (fingerCtrl) {
    fingerCtrl.root = { x: playerX, y: 0, rotation: 0 };
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

function applyPlayerAttackDamage(hitPoints, damage) {
  const points = Array.isArray(hitPoints) ? hitPoints.filter(Boolean) : [hitPoints].filter(Boolean);
  let hitAny = false;
  for (const enemy of activeEnemies()) {
    if (points.some((point) => enemy.containsStagePoint(point))) {
      enemy.takeDamage(damage);
      hitAny = true;
    }
  }
  return hitAny;
}

function applyUltimateAttackDamage(hitPoint) {
  for (const enemy of activeEnemies()) {
    enemy.takeDamage(enemy.containsStagePoint(hitPoint) ? 40 : 20);
  }
}

function spawnEnemy() {
  if (!els.enemyLayer || enemySpawnCount >= ENEMY_MAX_SPAWNS) return;
  const stageRect =
    layoutCache?.stageRect ??
    els.stageInteraction?.getBoundingClientRect?.() ??
    null;
  if (!stageRect?.width || !stageRect?.height) return;
  const enemy = new EnemySoldier(els.enemyLayer);
  enemy.spawn(stageRect);
  enemySoldiers.push(enemy);
  enemySpawnCount += 1;
}

function ensureEnemySpawned() {
  if (enemySpawnCount > 0) return;
  spawnEnemy();
}

function updateEnemy(dt) {
  playerIFrame = Math.max(0, playerIFrame - dt);
  if (enemySpawnCount < ENEMY_MAX_SPAWNS) {
    enemySpawnTimer += dt;
    if (enemySpawnTimer >= ENEMY_SPAWN_INTERVAL_SEC) {
      enemySpawnTimer = 0;
      spawnEnemy();
    }
  }
  for (const enemy of enemySoldiers) {
    enemy.update(dt);
  }
}

function applyEnemyAttackDamage(stageRect) {
  if (!stageRect || !playerRig || playerHp <= 0 || playerIFrame > 0) return;
  const playerTorso =
    playerRig.getJointStage("torso", "root", stageRect) ??
    playerRig.getRootStage(stageRect);
  if (!playerTorso) return;
  for (const enemy of activeEnemies()) {
    if (enemy.tryHitPlayerStagePoint?.(playerTorso)) {
      damagePlayer(PLAYER_DAMAGE_PER_HIT);
      return;
    }
  }
}

function loop(ts) {
  if (!running) return;
  animId = requestAnimationFrame(loop);

  const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0.016;
  lastTs = ts;

  if (handLandmarker && handDetector && fingerCtrl && playerRig && layoutCache) {
    const handResult = handDetector.tick(handLandmarker, ts);

    if (!lastPose) {
      lastPose = fingerCtrl.getInitialPose();
      applyPose(lastPose);
    }

    if (!handResult) {
      clearUltimateEarthquake();
      playerRig.update(dt, {
        idle: !lastPose.hasHand,
        direct: false,
        alpha: lastPose.hasHand ? 0.55 : 0.15,
      });
      return;
    }

    layoutCache.refresh(true);
    fingerCtrl.updateFromHand(handResult, layoutCache);
    if (DEBUG) drawDebugHands(handResult);

    const pose = fingerCtrl.step(dt, playerRig, layoutCache);
    const stageRect = layoutCache.stageRect;
    const cachedHand = handDetector.getCached();
    const okSign = detectOkSignFromResult(cachedHand);
    const ultimate = ultimateAttack?.step(dt, {
      okSign: okSign && goldenPills > 0,
      root: pose.root,
    });
    if (ultimate?.justStarted) {
      consumeGoldenPill();
    }
    const ultimateActive = !!ultimate?.active;
    const isPeaceSign = ultimateActive
      ? false
      : detectPeaceSignFromResult(cachedHand);
    const combo = ultimateActive
      ? { active: false }
      : staffCombo?.step(dt, {
          peaceSign: isPeaceSign,
          pose,
        });

    lastPose = pose;
    applyPose(pose);

    playerRig.update(dt, {
      idle: !pose.hasHand,
      direct: true,
      alpha: pose.hasHand ? 0.55 : 0.15,
    });

    const comboActive = !!combo?.active;
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
      attackFramePlayer?.show(combo.frameIndex ?? 0, pose.root, stageRect);
      if (combo?.justImpacted) {
        const landedHit = applyPlayerAttackDamage(
          attackFramePlayer?.getHitPoints(combo.frameIndex ?? 0),
          10
        );
        if (landedHit) {
          recordNormalAttackHit();
        }
      }
    } else {
      attackFramePlayer?.hide();
    }

    const strings = ultimateActive
      ? ultimateFramePlayer?.buildStrings(
          lastPose.fingerNodes ?? [],
          ultimate?.frameIndex ?? 0
        ) ?? []
      : comboActive
      ? attackFramePlayer?.buildStrings(
          lastPose.fingerNodes ?? [],
          combo?.frameIndex ?? 0
        ) ?? []
      : fingerCtrl.buildStringsFromDom(playerRig, layoutCache);

    stringLines?.draw({
      fingerNodes: lastPose.fingerNodes ?? [],
      strings: strings.length ? strings : lastPose.strings ?? [],
      handSkeleton: lastPose.handSkeleton ?? { landmarks: [], connections: [] },
    });

    if (stageRect) {
      ensureEnemySpawned();
      updateEnemy(dt);
      applyEnemyAttackDamage(stageRect);

      staffGlow?.draw(dt, {
        active: false,
        playerRig,
        stageRect,
      });

    }
  } else {
    playerRig?.update(dt, { idle: true, alpha: 0.1 });
  }
}

async function initPuppet() {
  const playerRigData = await loadRig("assets/wukong/rig.json");

  els.puppetMountPlayer.innerHTML = "";

  playerRig = new PuppetRig(els.puppetMountPlayer, playerRigData);
  fingerCtrl = new FingerMarionette(playerRigData);
  layoutCache = new LayoutCache(
    els.stageInteraction,
    () => playerRig,
    els.puppetMountPlayer
  );
  layoutCache.refresh(true);

  initSpawnPositions();

  lastPose = fingerCtrl.getInitialPose();
  applyPose(lastPose);
  playerRig.update(0, { direct: true });
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

    handDetector = createHandDetector(els.video);

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
    enemySoldiers = [];
    enemySpawnCount = 0;
    enemySpawnTimer = 0;
    if (els.enemyLayer) {
      els.enemyLayer.innerHTML = "";
    }

    await initPuppet();
    await initHandLandmarker();

    els.startOverlay.classList.add("hidden");

    running = true;
    lastTs = 0;
    cancelAnimationFrame(animId);
    animId = requestAnimationFrame(loop);

    if (!curtainAnim && els.stageCurtain) {
      curtainAnim = new CurtainAnimation(els.stageCurtain);
    }
    if (!bgm) bgm = new BgmPlayer();
    bgm.scheduleStart(3000);
    await curtainAnim?.play();
    ensureEnemySpawned();
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

if (els.stageCurtain) {
  curtainAnim = new CurtainAnimation(els.stageCurtain);
  curtainAnim.preload().catch(() => {});
}

window.addEventListener("pagehide", () => {
  running = false;
  cancelAnimationFrame(animId);
  clearUltimateEarthquake();
  bgm?.stop();
  stopCamera();
});

window.addEventListener("resize", () => {
  stringLines?.resize();
  staffGlow?.resize();
  layoutCache?.refresh(true);
  curtainAnim?.resize();
  initSpawnPositions();
  if (DEBUG && els.video.videoWidth) {
    els.debugCanvas.width = els.video.videoWidth;
    els.debugCanvas.height = els.video.videoHeight;
  }
});
