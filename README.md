# 67

Webcam meme cam. Throw a hand gesture, get the matching cat.

Runs entirely in the browser — MediaPipe Hands via WASM. Your camera feed never
leaves your device, so there's nothing to host but static files.

| Gesture | Meme |
|---|---|
| ☝️ index finger up | nerd cat |
| 🙌 both palms to the sky, bobbing up and down | 67 cat |
| 🤛🤜 two fists pumping up and down | dancing cat |
| 🤝 both hands up: one held still, the other's palm waved side to side | skuba cat |

All but nerd cat are *motion* gestures — held still they do nothing, because the
app watches a hand travel back and forth, not just its finger pose. They are
told apart by axis: 67 and dancing move vertically (open hands vs fists), skuba
moves horizontally.

## Run it

```
python3 -m http.server 8067
```

Then open **http://localhost:8067** — not the `http://0.0.0.0:8067` the server
prints, and not your LAN IP. Browsers only hand out a camera on a secure origin:
`https://`, `localhost`, or `127.0.0.1`.

To try it on your phone, deploy it (below) — you need real HTTPS for that.

## Deploy

Push the repo and point any static host at the root (Cloudflare Pages, GitHub
Pages, Vercel). No build step, no server.

## Changing gestures

All the logic is `classify()` in [gestures.js](gestures.js) — a lookup from
which fingers are extended to a meme name. Add a case, drop a GIF in `memes/`,
add it to `MEMES` in `index.html`.

```
node gestures.test.mjs
```
