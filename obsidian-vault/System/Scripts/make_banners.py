"""Generates the three SVG banners used by the vault (After Hours, Dawn FM, Kissland)."""
import math
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "Assets"
W, H = 1600, 420

DEFS = """
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
  <feGaussianBlur stdDeviation="{b}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
  <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.06 0"/></filter>
<pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#000" opacity="0.35"/></pattern>
"""


def skyline(rng, base, hmin, hmax, color, lights, light_colors, xstep=(18, 60), tower=None):
    out, x = [], -10
    while x < W + 20:
        w = rng.randint(*xstep)
        h = rng.randint(hmin, hmax)
        if tower and abs(x - tower[0]) < 40:
            pass
        out.append(f'<rect x="{x}" y="{base-h}" width="{w}" height="{h+60}" fill="{color}"/>')
        if rng.random() < 0.25:  # antenna
            out.append(f'<rect x="{x+w//2}" y="{base-h-rng.randint(8,30)}" width="2" height="30" fill="{color}"/>')
        if lights:
            for wy in range(base - h + 8, base - 4, 9):
                for wx in range(x + 4, x + w - 4, 7):
                    if rng.random() < lights:
                        c = rng.choice(light_colors)
                        out.append(f'<rect x="{wx}" y="{wy}" width="3" height="4" fill="{c}" opacity="{rng.uniform(.5,1):.2f}"/>')
        x += w + rng.randint(0, 6)
    return "\n".join(out)


def svg(body, blur=6, bg=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
            f'<defs>{DEFS.format(b=blur)}{bg}</defs>{body}'
            f'<rect width="{W}" height="{H}" fill="url(#scan)"/><rect width="{W}" height="{H}" filter="url(#grain)"/></svg>')


def after_hours():
    rng = random.Random(1)
    bg = """<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1a0005"/><stop offset=".45" stop-color="#5e0010"/>
      <stop offset=".75" stop-color="#c3001f"/><stop offset="1" stop-color="#ff2a44"/></linearGradient>
      <radialGradient id="haze" cx=".5" cy=".95" r=".7"><stop offset="0" stop-color="#ff3b52" stop-opacity=".7"/>
      <stop offset="1" stop-color="#ff3b52" stop-opacity="0"/></radialGradient>"""
    body = [f'<rect width="{W}" height="{H}" fill="url(#sky)"/>',
            f'<rect width="{W}" height="{H}" fill="url(#haze)"/>']
    # distant strip + skyline
    body.append(skyline(rng, 360, 40, 150, "#2a0008", 0.05, ["#ff6b7d"]))
    body.append(skyline(rng, 400, 60, 230, "#0b0003", 0.12, ["#ff2a44", "#ffd1d8", "#ff8a3d"], (26, 70)))
    # neon sign (After Hours)
    body.append('<g filter="url(#glow)" font-family="Orbitron, Arial Black, sans-serif" font-weight="700">'
                '<text x="800" y="165" text-anchor="middle" font-size="96" letter-spacing="26" fill="none" '
                'stroke="#ff2a44" stroke-width="3">AFTER HOURS</text>'
                '<text x="800" y="215" text-anchor="middle" font-size="26" letter-spacing="30" fill="#ffc2cb" '
                'font-family="Zen Kaku Gothic New, Yu Gothic, sans-serif">深 夜 の 街 · アフターアワーズ</text></g>')
    # road + tail lights
    body.append('<rect x="0" y="398" width="1600" height="22" fill="#050001"/>')
    for i in range(14):
        x = 60 + i * 115 + rng.randint(-20, 20)
        body.append(f'<rect x="{x}" y="404" width="46" height="3" fill="#ff2a44" filter="url(#glow)" opacity=".9"/>')
    return svg("".join(body), 5, bg)


def dawn_fm():
    rng = random.Random(2)
    bg = """<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#03061a"/><stop offset=".5" stop-color="#0b1a4a"/>
      <stop offset=".8" stop-color="#16508a"/><stop offset="1" stop-color="#3ff2e0"/></linearGradient>
      <linearGradient id="wave" x1="0" x2="1"><stop offset="0" stop-color="#3a7bff"/><stop offset=".5" stop-color="#3ff2e0"/>
      <stop offset="1" stop-color="#ff4fa8"/></linearGradient>"""
    body = [f'<rect width="{W}" height="{H}" fill="url(#sky)"/>']
    for _ in range(90):
        body.append(f'<circle cx="{rng.randint(0,W)}" cy="{rng.randint(0,200)}" r="{rng.uniform(.5,1.6):.1f}" fill="#cfe9ff" opacity="{rng.uniform(.3,.9):.2f}"/>')
    body.append(skyline(rng, 330, 30, 120, "#081330", 0.08, ["#3ff2e0", "#9ad7ff"]))
    # radio dial
    body.append('<rect x="0" y="330" width="1600" height="90" fill="#040816"/>')
    ticks = []
    for i in range(0, 161):
        x = 40 + i * 9.75
        big = i % 10 == 0
        ticks.append(f'<rect x="{x:.1f}" y="{350 if big else 360}" width="1.5" height="{30 if big else 16}" fill="#3ff2e0" opacity="{.95 if big else .5}"/>')
        if big:
            ticks.append(f'<text x="{x:.1f}" y="402" fill="#7fd9ff" font-size="13" text-anchor="middle" font-family="Share Tech Mono, monospace">{88 + i // 10 * 1.25:.1f}</text>')
    body.append("".join(ticks))
    body.append('<rect x="1247" y="336" width="4" height="74" fill="#ff4fa8" filter="url(#glow)"/>')
    # signal wave
    pts = " ".join(f"{x},{220 + 38*math.sin(x/55) * math.sin(x/310):.1f}" for x in range(0, W + 10, 8))
    body.append(f'<polyline points="{pts}" fill="none" stroke="url(#wave)" stroke-width="3" filter="url(#glow)"/>')
    body.append('<g filter="url(#glow)"><text x="800" y="140" text-anchor="middle" font-size="92" letter-spacing="22" '
                'font-family="Orbitron, Arial Black, sans-serif" font-weight="700" fill="#3ff2e0">DAWN FM</text>'
                '<text x="800" y="182" text-anchor="middle" font-size="22" letter-spacing="10" fill="#bfefff" '
                'font-family="Share Tech Mono, monospace">103.5 · YOU ARE NOW LISTENING · 夜明け</text></g>')
    return svg("".join(body), 5, bg)


def kissland():
    rng = random.Random(3)
    bg = """<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#12002a"/><stop offset=".45" stop-color="#4a0f6e"/>
      <stop offset=".75" stop-color="#c2338f"/><stop offset="1" stop-color="#ff8fb8"/></linearGradient>
      <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe36b"/>
      <stop offset=".6" stop-color="#ff6fae"/><stop offset="1" stop-color="#ff2a8a"/></linearGradient>
      <clipPath id="sunclip"><rect x="0" y="0" width="1600" height="330"/></clipPath>"""
    body = [f'<rect width="{W}" height="{H}" fill="url(#sky)"/>']
    for _ in range(70):
        body.append(f'<circle cx="{rng.randint(0,W)}" cy="{rng.randint(0,170)}" r="{rng.uniform(.5,1.5):.1f}" fill="#fff" opacity="{rng.uniform(.3,.9):.2f}"/>')
    # city-pop striped sun
    body.append('<g clip-path="url(#sunclip)"><circle cx="1180" cy="280" r="150" fill="url(#sun)" filter="url(#glow)"/>')
    for i, y in enumerate(range(240, 440, 16)):
        body.append(f'<rect x="1000" y="{y}" width="360" height="{3 + i}" fill="#7a1a7e"/>')
    body.append("</g>")
    body.append(skyline(rng, 350, 40, 170, "#1c0630", 0.10, ["#ff4fa8", "#ffe36b", "#9e5cff", "#ffffff"]))
    # tokyo tower silhouette
    body.append('<g fill="#12021f"><polygon points="880,350 915,150 920,150 955,350"/>'
                '<rect x="892" y="270" width="52" height="8"/><rect x="904" y="210" width="28" height="6"/>'
                '<rect x="916.5" y="100" width="2" height="55"/></g>')
    body.append('<g stroke="#ff4fa8" stroke-width="1.5" fill="none" filter="url(#glow)">'
                '<polyline points="880,350 915,150 920,150 955,350"/></g>')
    # vertical neon kanji signs
    for x, word, colr in [(90, "東京", "#ff4fa8"), (1500, "愛", "#3ff2e0"), (700, "夜", "#ffe36b")]:
        body.append(f'<g filter="url(#glow)"><rect x="{x-24}" y="175" width="48" height="{len(word)*56+20}" fill="#12021f" '
                    f'stroke="{colr}" stroke-width="2" rx="4"/>')
        for i, ch in enumerate(word):
            body.append(f'<text x="{x}" y="{222+i*56}" text-anchor="middle" font-size="40" fill="{colr}" '
                        f'font-family="Zen Kaku Gothic New, Yu Gothic, sans-serif" font-weight="700">{ch}</text>')
        body.append("</g>")
    body.append('<g filter="url(#glow)"><text x="560" y="132" text-anchor="middle" font-size="86" letter-spacing="18" '
                'font-family="Orbitron, Arial Black, sans-serif" font-weight="700" fill="none" stroke="#ffb3da" '
                'stroke-width="2.5">KISSLAND</text><text x="560" y="175" text-anchor="middle" font-size="26" '
                'letter-spacing="24" fill="#ffd6ea" font-family="Zen Kaku Gothic New, Yu Gothic, sans-serif">キ ス ラ ン ド · シティポップ</text></g>')
    # reflective street
    body.append('<rect x="0" y="350" width="1600" height="70" fill="#0c0216"/>')
    for i in range(40):
        x = rng.randint(0, W)
        c = rng.choice(["#ff4fa8", "#9e5cff", "#ffe36b"])
        body.append(f'<rect x="{x}" y="{rng.randint(356,410)}" width="{rng.randint(10,60)}" height="2" fill="{c}" opacity=".45"/>')
    return svg("".join(body), 6, bg)


def terminal():
    rng = random.Random(4)
    lines = ["> BOOT SEQ ........ OK", "> MOUNT /vault/nights ........ OK", "> SYNC excel.bridge ........ READY",
             "> USER: XO    MODE: AFTER_HOURS", "> TEST PROTOCOL INITIATED_"]
    body = ['<rect width="1600" height="420" fill="#020805"/>',
            '<rect x="30" y="30" width="1540" height="360" fill="none" stroke="#1c7a45" stroke-width="2"/>']
    for i, t in enumerate(lines):
        body.append(f'<text x="70" y="{100+i*54}" font-size="34" fill="#3dff8e" font-family="Share Tech Mono, monospace" '
                    f'filter="url(#glow)">{t}</text>')
    for i in range(6):
        body.append(f'<rect x="{1100+i*70}" y="300" width="56" height="44" fill="none" stroke="#3dff8e" opacity=".8"/>'
                    f'<text x="{1128+i*70}" y="327" text-anchor="middle" font-size="12" fill="#3dff8e" '
                    f'font-family="Share Tech Mono, monospace">CORE {i+1}</text>')
    return svg("".join(body), 3)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in [("banner-after-hours", after_hours), ("banner-dawn-fm", dawn_fm), ("banner-kissland", kissland),
                     ("banner-terminal", terminal)]:
        (OUT / f"{name}.svg").write_text(fn(), encoding="utf-8")
        print("wrote", name)
