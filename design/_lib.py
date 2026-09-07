# Shared fragments so the five sticker-pop artboards stay identical where they should be.
INK, PAPER, PAPER2, YELLOW, VERM, CORAL, MUTED = "#16141a", "#fffdf7", "#f4f0e6", "#ffe14d", "#d63c14", "#ff7a4d", "#6b6675"

HEAD = """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
  <style>
    body { margin: 0; }
    a { color: #d63c14; } a:hover { color: #a82d0d; }
    .paper { background-color: #fffdf7; background-image: radial-gradient(#16141a08 1px, #0000 1px); background-size: 4px 4px; }
    .disp { font-family: 'Bricolage Grotesque', system-ui, sans-serif; }
  </style>
</helmet>
"""
TAIL = "</x-dc>\n</body>\n</html>\n"

def hand(up, stroke=INK, size=23):
    """Schematic hand. `up` lists extended fingers; curled ones stub just above the palm."""
    tips = {"index": ("M8 14V5", "M8 14v-2"), "middle": ("M11.5 14V3.5", "M11.5 14v-2"),
            "ring": ("M15 14V5", "M15 14v-2"), "pinky": ("M18 14V7", "M18 14v-2")}
    paths = "".join(f'<path d="{a if k in up else b}"/>' for k, (a, b) in tips.items())
    thumb = "M5.5 17 2.8 15" if "thumb" in up else "M5.5 17 3.5 15.8"
    return (f'<svg viewBox="0 0 26 26" width="{size}" height="{size}" fill="none" stroke="{stroke}" '
            f'stroke-width="2" stroke-linecap="round"><rect x="5.5" y="14" width="13" height="9.5" rx="3.5"/>'
            f'{paths}<path d="{thumb}"/></svg>')

OPEN = ["index", "middle", "ring", "pinky", "thumb"]
GESTURES = [
    ("nerd cat", "index finger up", ["index"], None),
    ("67 cat", "palms to the sky, bobbing", OPEN, "&#8597;"),
    ("dancing cat", "two fists pumping up and down", [], "&#8597;"),
    ("skuba cat", "one hand still, wave the other palm", OPEN, "&#8596;"),
]

def gesture_row(name, desc, up, motion):
    tile = CORAL if motion else YELLOW
    badge = ("" if not motion else
        f'<span style="font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em; color: {PAPER}; '
        f'background: {VERM}; border-radius: 999px; padding: 4px 10px; white-space: nowrap;">MOVE {motion}</span>')
    return (f'<div style="display: flex; align-items: center; gap: 14px; background: {PAPER2}; '
            f'border: 2px solid {INK}; border-radius: 14px; padding: 10px 14px;">'
            f'<span style="display: grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; '
            f'background: {tile}; border: 2px solid {INK}; flex-shrink: 0;">{hand(up)}</span>'
            f'<div style="flex-grow: 1;"><div class="disp" style="font-weight: 600; font-size: 15px;">{name}</div>'
            f'<div style="font-size: 12.5px; color: {MUTED};">{desc}</div></div>{badge}</div>')

def feed(skeleton_op=0.75):
    """Camera stand-in: a dim room with the real tracking skeleton over it."""
    return f"""  <div style="position: absolute; inset: 0; background: radial-gradient(120% 90% at 58% 42%, #2a2436 0%, #17151f 48%, #0e0d13 100%);"></div>
  <svg viewBox="0 0 1280 800" style="position: absolute; inset: 0; width: 1280px; height: 800px;" fill="none">
    <g stroke="{YELLOW}" stroke-width="3.5" stroke-linecap="round" opacity="{skeleton_op}">
      <path d="M400 610 L368 514 L354 450 L346 412"/><circle cx="346" cy="412" r="6" fill="{YELLOW}" stroke="none"/>
      <path d="M400 610 L400 506 L398 434 L396 392"/><circle cx="396" cy="392" r="6" fill="{YELLOW}" stroke="none"/>
      <path d="M400 610 L432 514 L444 452 L450 416"/><circle cx="450" cy="416" r="6" fill="{YELLOW}" stroke="none"/>
      <path d="M400 610 L460 532 L482 484 L496 458"/><circle cx="496" cy="458" r="6" fill="{YELLOW}" stroke="none"/>
      <path d="M400 610 L344 576 L302 554"/><circle cx="302" cy="554" r="6" fill="{YELLOW}" stroke="none"/>
      <path d="M368 514 L400 506 L432 514 L460 532"/>
    </g>
  </svg>
"""

def chip(text, bg=PAPER):
    return (f'<span style="background: {bg}; border: 2px solid {INK}; border-radius: 999px; '
            f'padding: 6px 14px; font-size: 12px; font-weight: 500; box-shadow: 2px 2px 0 {INK};">{text}</span>')

def hud(label="67", state=None):
    right = "".join(chip(t) for t in ["D tracking", "? gestures"])
    live = (f'<span style="font-size: 12px; font-weight: 600; color: {VERM};">{state}</span>' if state else "")
    return f"""  <div style="position: absolute; top: 0; left: 0; right: 0; padding: 22px 24px; display: flex; justify-content: space-between; align-items: center; gap: 16px;">
    <div style="display: flex; align-items: center; gap: 10px; background: {YELLOW}; border: 2px solid {INK}; border-radius: 999px; padding: 7px 17px; box-shadow: 2px 2px 0 {INK};">
      <span style="width: 8px; height: 8px; border-radius: 50%; background: {VERM};"></span>
      <span class="disp" style="font-weight: 800; font-size: 16px; letter-spacing: -0.01em;">{label}</span>{live}
    </div>
    <div style="display: flex; gap: 8px;">{right}</div>
  </div>
"""
