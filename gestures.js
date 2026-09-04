// Landmark indices (MediaPipe hands): tip, then the joint below it (PIP).
const FINGERS = {
  index:  [8, 6],
  middle: [12, 10],
  ring:   [16, 14],
  pinky:  [20, 18],
};

const PALM = 9;          // middle-finger knuckle — steadier than the wrist for tracking
const HISTORY = 20;      // ~1/3 second of positions
const SHAKE = 0.05;      // min travel, as a fraction of the frame, to count as a shake

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// A finger is extended when its tip reaches further from the wrist than its
// middle joint does — curling folds the tip back toward the palm. Measuring
// from the wrist rather than comparing y keeps this true at any hand rotation,
// which matters because a hand tilts constantly while it waves.
// The 1.05 margin is a deadband, so a half-curled finger doesn't flip-flop.
export function fingersUp(lm) {
  const wrist = lm[0];
  const up = {};
  for (const [name, [tip, pip]] of Object.entries(FINGERS))
    up[name] = dist(lm[tip], wrist) > dist(lm[pip], wrist) * 1.05;
  // Thumb bends sideways across the palm, so measure it against the far knuckle.
  up.thumb = dist(lm[4], lm[17]) > dist(lm[5], lm[17]) * 0.9;
  return up;
}

// How far a hand travelled back and forth along one axis, or 0 if it merely
// drifted. Requires two direction changes so a single sweep doesn't count.
export function oscillation(track, axis) {
  if (track.length < 8) return 0;
  const v = track.map(p => p[axis]);
  let reversals = 0, dir = 0;
  for (let i = 1; i < v.length; i++) {
    const step = v[i] - v[i - 1];
    if (Math.abs(step) < 0.004) continue;      // ignore camera jitter
    const d = Math.sign(step);
    if (dir && d !== dir) reversals++;
    dir = d;
  }
  return reversals >= 2 ? Math.max(...v) - Math.min(...v) : 0;
}

// hands: array of 21-landmark arrays. motion: {x, y} travel per hand, same order.
export function classify(hands, motion = []) {
  if (!hands || hands.length === 0) return null;

  const states = hands.map(fingersUp);
  const open = (f) => f.index && f.middle && f.ring && f.pinky;
  const fist = (f) => !f.index && !f.middle && !f.ring && !f.pinky;
  const shaking = (i, axis) => (motion[i]?.[axis] ?? 0) >= SHAKE;

  // Motion gestures are checked first: a moving hand still matches its static
  // pose, so the poses below would otherwise shadow these.
  if (hands.length === 2 && states.every(fist) && (shaking(0, "y") || shaking(1, "y")))
    return "dancing_cat";                                  // two fists pumping up and down

  // One open palm sweeping sideways while the other hand stays put (holding your
  // nose). Requiring the other hand to be still is what stops a wobbly 67 — two
  // palms up, both drifting — from being read as a wave.
  const waving = states.findIndex((f, i) => open(f) && shaking(i, "x"));
  if (waving !== -1 && !states.some((_, i) => i !== waving && shaking(i, "x")))
    return "skuba_cat";

  if (hands.length === 2 && states.every(open)) return "67_cat";

  const f = states[0];
  if (f.index && !f.middle && !f.ring && !f.pinky) return "nerd_cat";  // pushing glasses up
  return null;                                                         // fist / anything else
}

// Feed it every frame; it keeps the position history each motion gesture needs
// and only commits a label once it holds for `hold` frames, so the meme doesn't
// strobe while a finger sits on a threshold.
export function makeReader({ hold = 5, history = HISTORY } = {}) {
  const tracks = new Map();
  let candidate = null, count = 0, committed = null;

  return function read(hands = [], handedness = []) {
    const seen = new Set();
    const motion = hands.map((lm, i) => {
      // Key by handedness so a history stays attached to the same physical hand
      // even when MediaPipe reorders the results between frames.
      const key = handedness[i]?.[0]?.categoryName ?? `hand${i}`;
      seen.add(key);
      const track = tracks.get(key) ?? [];
      track.push({ x: lm[PALM].x, y: lm[PALM].y });
      if (track.length > history) track.shift();
      tracks.set(key, track);
      return { x: oscillation(track, "x"), y: oscillation(track, "y") };
    });
    // Drop histories for hands that left the frame; stale ones read as motion.
    for (const key of [...tracks.keys()]) if (!seen.has(key)) tracks.delete(key);

    const label = classify(hands, motion);
    if (label === candidate) count++;
    else { candidate = label; count = 1; }
    if (count >= hold) committed = candidate;
    return committed;
  };
}
