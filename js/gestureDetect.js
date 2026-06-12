function findHandIndex(userHand, handedness) {
  const want = userHand === "left" ? "Right" : "Left";
  for (let i = 0; i < handedness.length; i++) {
    const label =
      handedness[i]?.[0]?.categoryName ?? handedness[i]?.categoryName ?? "";
    if (label === want) return i;
  }
  return userHand === "left" ? 0 : handedness.length > 1 ? 1 : -1;
}

/**
 * @param {import('@mediapipe/tasks-vision').HandLandmarkerResult | null | undefined} result
 */
export function detectPeaceSignFromResult(result) {
  const landmarks = result?.landmarks ?? [];
  if (!landmarks.length) return false;
  const idx = findHandIndex("left", result.handedness ?? []);
  if (idx < 0 || !landmarks[idx]) return false;
  return detectPeaceSign(landmarks[idx]);
}

/**
 * Detects peace sign: index + middle extended, ring + pinky folded.
 * @param {Array<{ x: number, y: number, z?: number }>} landmarks
 */
export function detectPeaceSign(landmarks) {
  if (!landmarks || landmarks.length < 21) return false;

  const wrist = landmarks[0];
  const tipDist = (idx) => {
    const p = landmarks[idx];
    return Math.hypot(p.x - wrist.x, p.y - wrist.y, (p.z ?? 0) - (wrist.z ?? 0));
  };
  const isExtended = (tipIdx, pipIdx) => tipDist(tipIdx) > tipDist(pipIdx) * 1.08;
  const isFolded = (tipIdx, pipIdx) => tipDist(tipIdx) < tipDist(pipIdx) * 1.02;

  return (
    isExtended(8, 6) &&
    isExtended(12, 10) &&
    isFolded(16, 14) &&
    isFolded(20, 18)
  );
}

/**
 * @param {import('@mediapipe/tasks-vision').HandLandmarkerResult | null | undefined} result
 */
export function detectOkSignFromResult(result) {
  const landmarks = result?.landmarks ?? [];
  if (!landmarks.length) return false;
  const idx = findHandIndex("left", result.handedness ?? []);
  if (idx < 0 || !landmarks[idx]) return false;
  return detectOkSign(landmarks[idx]);
}

/**
 * Detects OK sign: thumb + index tips closed, middle/ring/pinky extended.
 * @param {Array<{ x: number, y: number, z?: number }>} landmarks
 */
export function detectOkSign(landmarks) {
  if (!landmarks || landmarks.length < 21) return false;

  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const thumb = landmarks[4];
  const index = landmarks[8];
  if (!wrist || !middleMcp || !thumb || !index) return false;

  const tipDist = (idx) => {
    const p = landmarks[idx];
    return Math.hypot(p.x - wrist.x, p.y - wrist.y, (p.z ?? 0) - (wrist.z ?? 0));
  };
  const isExtended = (tipIdx, pipIdx) => tipDist(tipIdx) > tipDist(pipIdx) * 1.08;
  const palmSize = Math.hypot(
    middleMcp.x - wrist.x,
    middleMcp.y - wrist.y,
    (middleMcp.z ?? 0) - (wrist.z ?? 0)
  );
  const thumbIndexGap = Math.hypot(
    thumb.x - index.x,
    thumb.y - index.y,
    (thumb.z ?? 0) - (index.z ?? 0)
  );

  return (
    thumbIndexGap < palmSize * 0.42 &&
    tipDist(8) < tipDist(6) * 1.2 &&
    isExtended(12, 10) &&
    isExtended(16, 14) &&
    isExtended(20, 18)
  );
}
