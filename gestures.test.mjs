import assert from "node:assert";
import { classify, fingersUp, oscillation, makeReader } from "./gestures.js";

// A geometrically plausible 21-landmark hand: wrist at the bottom, knuckles
// above it, fingers pointing up. An extended tip reaches past its joint; a
// curled one folds back down level with the knuckles.
function hand({ up = [], thumbOut = false, at = 0.5, pinch = false } = {}) {
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
  // Pinch: thumb tip meets index tip. Index must stay curled for this to look
  // like a real pinch rather than a splayed hand with a stray thumb.
  if (pinch) lm[4] = { x: lm[8].x + 0.004, y: lm[8].y + 0.004 };
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
assert.strictEqual(classify([rotate(palm, 45), rotate(palm, -45)], [shakeY, shakeY]), "67_cat",
  "67 survives hands tilted toward each other");

// --- foreshortening: fingers pointing away from the camera -----------------
// Palms to the sky (67) and a handshake-oriented palm (skuba) both aim the
// fingers away from the lens. Their tips then project almost onto their own
// joints, so a flat 2D distance reads them as curled — which used to make
// palms-up 67 look like two fists, i.e. dancing_cat. z recovers the depth.
function awayHand(extended) {
  const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.62, z: -0.05 }));
  lm[0] = { x: 0.5, y: 0.70, z: 0 };                                   // wrist
  const cols = { index: [8, 6, -0.06], middle: [12, 10, -0.02], ring: [16, 14, 0.02], pinky: [20, 18, 0.06] };
  for (const [name, [tip, pip, dx]] of Object.entries(cols)) {
    lm[pip] = { x: 0.5 + dx, y: 0.600, z: -0.10 };
    // Extended tips barely advance in the image but recede sharply in depth.
    lm[tip] = extended.includes(name)
      ? { x: 0.5 + dx, y: 0.605, z: -0.25 }
      : { x: 0.5 + dx, y: 0.660, z: -0.04 };
  }
  lm[5]  = { x: 0.44, y: 0.62, z: -0.05 };
  lm[9]  = { x: 0.50, y: 0.62, z: -0.05 };
  lm[17] = { x: 0.56, y: 0.62, z: -0.05 };
  lm[4]  = { x: 0.30, y: 0.66, z: -0.02 };
  return lm;
}

const awayPalm = awayHand(OPEN);
const flat = (lm) => lm.map(({ x, y }) => ({ x, y }));   // same hand, z discarded

assert.ok(OPEN.every((n) => fingersUp(awayPalm)[n]),
  "fingers pointing away from the camera must still read as extended");
assert.ok(!OPEN.every((n) => fingersUp(flat(awayPalm))[n]),
  "sanity: without z this same hand reads as curled — that was the bug");
assert.strictEqual(classify([awayPalm, awayPalm], [shakeY, shakeY]), "67_cat",
  "palms to the sky, bobbing vertically");
assert.strictEqual(classify([awayPalm, awayHand([])], [shakeX, still]), "skuba_cat",
  "handshake-oriented palm waved sideways, other hand still");

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

assert.strictEqual(classify([palm, palm], [shakeY, shakeY]), "67_cat");
assert.strictEqual(classify([palm, palm], [still, still]), null, "two idle palms are not 67");
assert.strictEqual(classify([point], [still]), "nerd_cat");
assert.strictEqual(classify([fist, fist], [shakeY, shakeY]), "dancing_cat");
assert.strictEqual(classify([fist, fist], [still, still]), null, "two idle fists are not dancing");
assert.strictEqual(classify([fist, fist], [shakeX, shakeX]), null, "fists must move vertically");

// skuba: both hands up, one open palm sweeping sideways, the other held still.
assert.strictEqual(classify([fist, palm], [still, shakeX]), "skuba_cat");
assert.strictEqual(classify([palm, fist], [shakeX, still]), "skuba_cat", "hand order is irrelevant");
assert.strictEqual(classify([palm, palm], [still, shakeX]), "skuba_cat",
  "the still hand's pose is not checked");
assert.strictEqual(classify([palm], [shakeX]), null, "one hand is not enough");
assert.strictEqual(classify([palm, fist], [shakeX, shakeY]), null,
  "the other hand must be still on both axes, not just sideways");
assert.strictEqual(classify([palm, palm], [shakeX, shakeX]), null,
  "both palms drifting sideways is neither a wave nor 67");

// --- reader: history tracking + debounce ------------------------------------
const handed = (...names) => names.map((n) => [{ categoryName: n }]);
const read = makeReader({ hold: 3 });

assert.strictEqual(read([point], handed("Right")), null);
assert.strictEqual(read([point], handed("Right")), null);
assert.strictEqual(read([point], handed("Right")), "nerd_cat");
assert.strictEqual(read([palm, palm], handed("Left", "Right")), "nerd_cat",
  "a single stray frame must not switch memes");

// Waving one palm across frames must build enough x-travel to read as skuba.
const sides = handed("Right", "Left");
const held = hand({ at: 0.85 });                   // the other hand, fed unmoving
const waveFrame = (r, i, hands = null) =>
  r(hands ?? [hand({ up: OPEN, thumbOut: true, at: i % 6 < 3 ? 0.30 : 0.50 }), held], sides);

const wave = makeReader({ hold: 2 });
let got = null;
for (let i = 0; i < 24; i++) got = waveFrame(wave, i);
assert.strictEqual(got, "skuba_cat", "reader must accumulate motion history itself");

// Dropouts. A hand that blinks out for a frame or two — what fast motion causes
// — must keep its history, or the oscillation window empties exactly when the
// hand is moving hardest. A hand that is gone for good must not leave motion
// behind for whatever hand appears next.
const waveFrames = (r, n) => { for (let i = 0; i < n; i++) waveFrame(r, i); };
const resume = [hand({ up: OPEN, thumbOut: true, at: 0.30 }), held];

const blink = makeReader({ hold: 1, linger: 0 });
waveFrames(blink, 24);
blink([], []);                                   // two dropped frames mid-wave
blink([], []);
assert.strictEqual(blink(resume, sides), "skuba_cat",
  "a brief dropout must not erase the motion history");

// Same resumed frame, but after a gap long enough to drop the history. Every
// other condition for skuba still holds, so only the cleared history can be
// what stops it — which is the point of the assertion.
const gone = makeReader({ hold: 1, linger: 0 });
waveFrames(gone, 24);
for (let i = 0; i < 12; i++) gone([], []);       // hand is gone for good
assert.strictEqual(gone([], []), null, "empty frame clears the label");
assert.strictEqual(gone(resume, sides), null, "stale history must not fire skuba");

// --- hand identity survives a flipping handedness label --------------------
// MediaPipe's Left/Right is a classifier output and it flips between frames on
// a blurred or edge-on hand. Keying motion histories on it swapped them, so the
// hand held still inherited the waving hand's travel and skuba never fired.
// Identity now comes from position, so the label may flip freely.
const flip = makeReader({ hold: 2 });
let flipped = null;
for (let i = 0; i < 24; i++) {
  const labels = i % 2 ? handed("Right", "Left") : handed("Left", "Right");
  flipped = flip([hand({ up: OPEN, thumbOut: true, at: i % 6 < 3 ? 0.30 : 0.50 }), held], labels);
}
assert.strictEqual(flipped, "skuba_cat", "a flipping handedness label must not swap histories");

// And the hand that never moved must still read as motionless.
const quiet = flip.debug.hands.find((h) => h.motion.x < 0.01);
assert.ok(quiet, "the still hand's history must not have absorbed the waving hand's travel");

// --- linger: the meme outlives the gesture ---------------------------------
const lin = makeReader({ hold: 1, linger: 3 });
assert.strictEqual(lin([point], handed("Right")), "nerd_cat");
for (let i = 1; i <= 3; i++)
  assert.strictEqual(lin([], []), "nerd_cat", `meme still up ${i} frame(s) after the gesture`);
assert.strictEqual(lin([], []), null, "cleared once linger runs out");

// A new gesture cuts in without waiting for the old one's linger to expire.
const swap = makeReader({ hold: 1, linger: 100 });
assert.strictEqual(swap([point], handed("Right")), "nerd_cat");
swap([], []);
assert.strictEqual(swap([fist, fist], handed("Left", "Right")), "nerd_cat", "fists alone are idle");
assert.strictEqual(swap([palm, palm], handed("Left", "Right")), "nerd_cat", "still palms are idle");

console.log("ok");
