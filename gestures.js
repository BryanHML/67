// Landmark indices (MediaPipe hands): tip, then the joint below it (PIP).
const FINGERS = {
  index:  [8, 6],
  middle: [12, 10],
  ring:   [16, 14],
  pinky:  [20, 18],
};

const PALM = 9;          // middle-finger knuckle — steadier than the wrist for tracking
const HISTORY = 20;      // ~1/3 second of positions
const MISSING = 10;      // frames a hand may vanish for before its history is dropped
const MATCH = 0.25;      // furthest a hand may jump between frames and still be the same hand
export const SHAKE = 0.05;  // min travel, as a fraction of the frame, to count as a shake

// 3D. MediaPipe's z is depth relative to the wrist, on roughly the same scale as
// x. Including it is what keeps a foreshortened finger — one pointing away from
// the camera, as in palms-to-the-sky — from projecting onto its own joint and
// reading as curled. Falls back to flat 2D when landmarks carry no z.
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

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

  // Both hands up: one open palm sweeping sideways, the other held still on
  // both axes. The still hand's pose is not checked — it is whatever your hand
  // does at your nose. Requiring it to be still is what separates this from 67
  // (two open palms, both bobbing) and from a one-handed wave.
  const waving = states.findIndex((f, i) => open(f) && shaking(i, "x"));
  if (hands.length === 2 && waving !== -1 &&
      !motion.some((m, i) => i !== waving && (shaking(i, "x") || shaking(i, "y"))))
    return "skuba_cat";

  if (hands.length === 2 && states.every(open) && (shaking(0, "y") || shaking(1, "y")))
    return "67_cat";                                       // palms to the sky, bobbing

  // `some`, not states[0]: MediaPipe orders hands arbitrarily, so checking only
  // the first one made this fire or not depending on which hand it happened to
  // list first whenever a second hand was in frame.
  if (states.some((f) => f.index && !f.middle && !f.ring && !f.pinky))
    return "nerd_cat";                                   // pushing glasses up
  return null;                                           // fist / anything else
}

// Feed it every frame; it keeps the position history each motion gesture needs
// and only commits a label once it holds for `hold` frames, so the meme doesn't
// strobe while a finger sits on a threshold.
export function makeReader({ hold = 5, linger = 45, history = HISTORY } = {}) {
  let tracks = [];
  let candidate = null, count = 0, committed = null, idle = 0;

  return function read(hands = [], handedness = []) {
    const taken = new Set();
    const motion = hands.map((lm) => {
      const pt = { x: lm[PALM].x, y: lm[PALM].y };
      // Identity by position, not by MediaPipe's Left/Right label. That label is
      // a classifier output and it flips between frames on a blurred or edge-on
      // hand; keying histories on it swapped them, so a hand held still
      // inherited the moving hand's travel and stopped counting as still.
      // Nearest unclaimed track from last frame wins; a jump beyond MATCH means
      // this is a different hand, not the same one moved, so it starts fresh.
      let best = -1, bestDist = MATCH;
      tracks.forEach((t, j) => {
        if (taken.has(j)) return;
        const last = t.points[t.points.length - 1];
        const d = Math.hypot(pt.x - last.x, pt.y - last.y);
        if (d < bestDist) { bestDist = d; best = j; }
      });
      if (best < 0) { tracks.push({ points: [], missed: 0 }); best = tracks.length - 1; }
      taken.add(best);

      const t = tracks[best];
      t.missed = 0;
      t.points.push(pt);
      if (t.points.length > history) t.points.shift();
      return { x: oscillation(t.points, "x"), y: oscillation(t.points, "y") };
    });

    // Fast motion blurs frames and MediaPipe drops the hand for one or two of
    // them. Discarding the history on the first miss emptied the oscillation
    // window exactly when the hand was moving hardest, so the gesture only
    // worked slowly. Hold across a short gap; drop after MISSING frames, before
    // stale positions can read as fresh motion.
    tracks.forEach((t, j) => { if (!taken.has(j)) t.missed++; });
    tracks = tracks.filter((t) => t.missed <= MISSING);

    const label = classify(hands, motion);
    if (label === candidate) count++;
    else { candidate = label; count = 1; }
    if (count >= hold && candidate) committed = candidate;

    // Hold the last meme for `linger` frames after the gesture stops, so it
    // doesn't vanish the instant you relax your hands. Any matching frame
    // resets the countdown; a different gesture replaces this one as soon as it
    // has held for `hold` frames, without waiting for the linger to run out.
    idle = label ? 0 : idle + 1;
    if (idle > linger) committed = null;

    // Snapshot for the on-screen debug readout. Hung off the function so the
    // return value stays a plain label and callers can ignore it entirely.
    read.debug = {
      raw: label, held: count, need: hold, committed,
      hands: hands.map((lm, i) => ({
        side: handedness[i]?.[0]?.categoryName ?? `hand${i}`,
        fingers: fingersUp(lm),
        motion: motion[i],
      })),
    };
    return committed;
  };
}
