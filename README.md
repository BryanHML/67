# 67

Webcam meme cam. Throw a hand gesture, get the matching cat.

Try it on my [demo site](https://bryanhml.github.io/67/) or run it entirely in the browser — MediaPipe Hands via WASM. Your camera feed never leaves your device, so there's nothing to host but static files.

Three of the four are *motion* gestures — held still they do nothing, because
the app watches a hand travel back and forth, not just its finger pose. They are
told apart by axis: 67 and dancing move vertically (open hands vs fists), skuba
moves horizontally.

## The gestures

### ☝️ nerd cat — index finger up

The only one that needs no movement. Index up, everything else curled.

![nerd cat gesture](demo/nerd_cat.gif)

### 🙌 67 cat — both palms to the sky, bobbing

Palms up, bobbing vertically.

![67 cat gesture](demo/67_cat.gif)

### 🤛🤜 dancing cat — two fists pumping

Both fists, pumping up and down.

![dancing cat gesture](demo/dancing_cat.gif)

### 🤝 skuba cat — one hand still, wave the other

Both hands up. Hold one still and wave the other palm side to side.

![skuba cat gesture](demo/skuba_cat.gif)

## Run it

### Method 1: Demo Site 

https://bryanhml.github.io/67/

### Method 2: Local: 

In the first terminal, serve the folder:

```bash
python3 -m http.server 8067
```

Then, in a second terminal:

```bash
open http://localhost:8067
```

It has to be served — opening `index.html` straight off disk fails, because
module scripts are CORS-blocked from a `file://` origin. And it has to be
`localhost`, not the `http://0.0.0.0:8067` the server prints and not your LAN
IP: browsers only hand out a camera on a secure origin, meaning `https://`,
`localhost`, or `127.0.0.1`.

First load pulls about 19 MB of MediaPipe from a CDN — the WASM runtime and the
hand model — so it needs a connection the first time. After that it's cached.

To try it on your phone, deploy it (below); that needs real HTTPS.


## Controls

`?` opens the gesture list, `d` toggles the tracking overlay — the hand skeleton
plus a per-hand readout of which fingers are extended, how far each hand has
travelled on each axis, and how many hands MediaPipe found. Both have buttons in
the top-right too. The readout is hidden on phones.

## Changing gestures

All the logic is `classify()` in [gestures.js](gestures.js) — a lookup from
which fingers are extended to a meme name. Add a case there, drop an MP4 in
`memes/`, and add an entry to `GESTURES` in `index.html`:

```js
{ id: "new_cat", name: "new cat", how: "what to do with your hand",
  up: ["index"],   // extended fingers, or "open" for all of them
  move: "↕" }      // "" for a held pose; ↕ or ↔ for a motion gesture
```

`id` is both the `classify()` return value and the filename. That one entry
drives the instructions panel, the reminder strip along the bottom, the start
screen, and the clip that plays — there is nowhere else to register it. `move`
also picks the tile colour: yellow for hold, coral for move.

```
node gestures.test.mjs
```
