/** 手部检测：低分辨率画布 + 限帧，减轻 MediaPipe 压力 */

export const DETECT_WIDTH = 320;
export const DETECT_HEIGHT = 240;
export const DETECT_FPS = 25;
/** 目标检测帧率（不必跟显示器 60fps） */
export const DETECT_INTERVAL_MS = 1000 / DETECT_FPS;

/**
 * @param {HTMLVideoElement} video
 */
export function createHandDetector(video) {
  const canvas = document.createElement("canvas");
  canvas.width = DETECT_WIDTH;
  canvas.height = DETECT_HEIGHT;
  const ctx = canvas.getContext("2d", {
    alpha: false,
    desynchronized: true,
  });

  let lastDetectAt = 0;
  /** @type {import('@mediapipe/tasks-vision').HandLandmarkerResult | null} */
  let cachedResult = null;

  return {
    canvas,
    getCached: () => cachedResult,
    /**
     * @param {import('@mediapipe/tasks-vision').HandLandmarker} landmarker
     * @param {number} now
     */
    tick(landmarker, now) {
      if (now - lastDetectAt < DETECT_INTERVAL_MS) {
        return null;
      }
      if (video.readyState < 2 || !video.videoWidth) {
        return null;
      }

      lastDetectAt = now;
      ctx.drawImage(video, 0, 0, DETECT_WIDTH, DETECT_HEIGHT);
      cachedResult = landmarker.detectForVideo(canvas, now);
      return cachedResult;
    },
    reset() {
      cachedResult = null;
      lastDetectAt = 0;
    },
  };
}
