import assert from "node:assert";
import { classify, fingersUp, oscillation, makeReader } from "./gestures.js";

// A geometrically plausible 21-landmark hand: wrist at the bottom, knuckles
// above it, fingers pointing up. An extended tip reaches past its joint; a
// curled one folds back down level with the knuckles.
function hand({ up = [], thumbOut = false, at = 0.5 } = {}) {
  const lm = Array.from({ length: 21 }, () => ({ x: at, y: 0.62 }));
  lm[0] = { x: at, y: 0.90 };                                    // wrist
  const cols = { index: [8, 6, -0.08], middle: [12, 10, -0.02], ring: [16, 14, 0.04], pinky: [20, 18, 0.08] };
  for (const [name, [tip, pip, dx]] of Object.entries(cols)) {
    lm[pip] = { x: at + dx, y: 0.50 };                           // middle joint
    lm[tip] = { x: at + dx, y: up.includes(name) ? 0.34 : 0.61 }; // extended, or curled back
  }
  lm[5]  = { x: at - 0.08, y: 0.62 };                            // index knuckle
  lm[9]  = { x: at,        y: 0.62 };                            // middle knuckle (tracked point)
  lm[17] = { x: at + 0.08, y: 0.62 };                            // pinky knuckle -> palm width 0.16
  lm[4]  = thumbOut ? { x: at - 0.22, y: 0.66 } : { x: at + 0.03, y: 0.60 };
  return lm;
}

// Rotate a hand about its wrist, as if it were tilted in front of the camera.
const rotate = (lm, deg) => {
  const a = (deg * Math.PI) / 180, w = lm[0];
  return lm.map((p) => ({
    x: w.x + (p.x - w.x) * Math.cos(a) - (p.y - w.y) * Math.sin(a),
    y: w.y + (p.x - w.x) * Math.sin(a) + (p.y - w.y) * Math.cos(a),
  }));
};

const OPEN = ["index", "middle", "ring", "pinky"];
const palm = hand({ up: OPEN, thumbOut: true });
const fist = hand();
const point = hand({ up: ["index"] });
const still = { x: 0, y: 0 };
const shakeX = { x: 0.12, y: 0 };
const shakeY = { x: 0, y: 0.12 };

// --- fingersUp is rotation-invariant ---------------------------------------
// The regression that matters: a tilted hand must read the same as an upright
// one. Comparing tip.y to joint.y used to fail here and misread a wave as a fist.
for (const deg of [0, 30, 60, 90, 135, 180, -45]) {
  const f = fingersUp(rotate(palm, deg));
  assert.ok(OPEN.every((n) => f[n]), `open palm must stay open at ${deg}°`);
  const g = fingersUp(rotate(fist, deg));
  assert.ok(OPEN.every((n) => !g[n]), `fist must stay closed at ${deg}°`);
}
assert.strictEqual(classify([rotate(point, 60)], [still]), "nerd_cat", "tilted point still points");
assert.strictEqual(classify([rotate(palm, 45), rotate(palm, -45)], [still, still]), "67_cat",
  "67 survives hands tilted toward each other");

// --- oscillation ------------------------------------------------------------
const zig = (axis, amp) => Array.from({ length: 20 }, (_, i) =>
  ({ x: 0.5, y: 0.5, [axis]: 0.5 + (i % 6 < 3 ? amp : -amp) }));

assert.strictEqual(oscillation([{ x: 0, y: 0 }], "x"), 0, "too few frames to judge");
const drift = Array.from({ length: 20 }, (_, i) => ({ x: 0.2 + i * 0.02, y: 0.5 }));
assert.strictEqual(oscillation(drift, "x"), 0, "one-way sweep is not a shake");
assert.ok(oscillation(zig("x", 0.06), "x") > 0.05, "back-and-forth is a shake");
assert.strictEqual(oscillation(zig("x", 0.06), "y"), 0, "shaking x must not read as y");

// --- classify ---------------------------------------------------------------
assert.strictEqual(classify([]), null, "no hands -> no meme");
assert.strictEqual(classify([fist], [still]), null, "resting fist -> no meme");
assert.strictEqual(classify([palm], [still]), null, "one still palm is not the 67 sign");

assert.strictEqual(classify([palm, palm], [still, still]), "67_cat");
assert.strictEqual(classify([point], [still]), "nerd_cat");
assert.strictEqual(classify([fist, fist], [shakeY, shakeY]), "dancing_cat");
assert.strictEqual(classify([fist, fist], [still, still]), null, "two idle fists are not dancing");
assert.strictEqual(classify([fist, fist], [shakeX, shakeX]), null, "fists must move vertically");

// skuba: nose-holding hand still, other palm sweeping. The held hand's pose is
// irrelevant — only that it isn't sweeping too.
assert.strictEqual(classify([fist, palm], [still, shakeX]), "skuba_cat");
assert.strictEqual(classify([palm], [shakeX]), "skuba_cat", "a lone waving palm counts");
assert.strictEqual(classify([palm, palm], [still, shakeX]), "skuba_cat", "waving beats static 67");
assert.strictEqual(classify([palm, palm], [shakeX, shakeX]), "67_cat",
  "both palms drifting is a wobbly 67, not a wave");

// --- reader: history tracking + debounce ------------------------------------
const handed = (...names) => names.map((n) => [{ categoryName: n }]);
const read = makeReader({ hold: 3 });

assert.strictEqual(read([point], handed("Right")), null);
assert.strictEqual(read([point], handed("Right")), null);
assert.strictEqual(read([point], handed("Right")), "nerd_cat");
assert.strictEqual(read([palm, palm], handed("Left", "Right")), "nerd_cat",
  "a single stray frame must not switch memes");

// Waving one palm across frames must build enough x-travel to read as skuba.
const wave = makeReader({ hold: 2 });
let got = null;
for (let i = 0; i < 24; i++)
  got = wave([hand({ up: OPEN, thumbOut: true, at: i % 6 < 3 ? 0.35 : 0.55 })], handed("Right"));
assert.strictEqual(got, "skuba_cat", "reader must accumulate motion history itself");

// A hand that leaves the frame must not leave motion behind for the next one.
const gone = makeReader({ hold: 1 });
for (let i = 0; i < 24; i++)
  gone([hand({ up: OPEN, thumbOut: true, at: i % 6 < 3 ? 0.35 : 0.55 })], handed("Right"));
assert.strictEqual(gone([], []), null, "empty frame clears the label");
assert.strictEqual(gone([palm], handed("Right")), null, "stale history must not fire skuba");

console.log("ok");
