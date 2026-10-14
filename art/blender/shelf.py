"""
棚の枠と本(Shelf)。原点は SHELF.center の床、局所 +z が棚の正面(ワールドでは −x、部屋の内側)。
引き出し・シザーリンク・模型(LinkageToy)と模型の台は手続き生成のまま。

  - 側板(面取り・木目・釘の頭)、天板と笠木、裏板(縦板張り)、棚板 4 枚(前縁を面取り)、台輪
  - 本:Shelf.tsx の buildBooks と同じシード・同じ並び(段・幅・高さ・傾き・色)。背に帯と題箋、天は紙の色
  - 本立て(真鍮)、天板の上の小物(木箱・丸めた図面・油差し)
  - 最下段の棚板(y = 0.44)の上は空けておく(図鑑の機械を並べる場所)
"""

import math

import kit
from kit import Model, seeded

FILE = "shelf.glb"

W = 1.5
D = 0.42
H = 2.05
BOARDS = [0.44, 0.88, 1.32, 1.76]

PREVIEWS = [
    ("front", (0.6, 1.3, 2.6), (0.0, 1.05, 0.0), 35),
    ("top", (1.2, 2.6, 1.2), (0.0, 1.9, 0.0), 35),
]

BOOK_COLORS = ["#7a3b2e", "#2f4f6f", "#6b6b3a", "#8a5a2b", "#3e5a4a", "#9a7b4f", "#5a3a5a", "#b0a080"]


def book_layout():
    """Shelf.tsx の buildBooks と同じ乱数の使い方で本を並べる"""
    rnd = seeded(77)
    rows = [
        (BOARDS[1], -W * 0.14, W / 2 - 0.05),
        (BOARDS[2], -W / 2 + 0.05, W * 0.06),
        (BOARDS[3], -W / 2 + 0.05, W / 2 - 0.05),
    ]
    items = []
    for base, frm, to in rows:
        x = frm
        while x < to - 0.03:
            w = 0.022 + rnd() * 0.03
            h = 0.18 + rnd() * 0.17
            if rnd() < 0.07:
                x += 0.05
                continue
            d = 0.15 + rnd() * 0.08
            tilt = 0.16 if rnd() < 0.08 else 0.0
            c = BOOK_COLORS[math.floor(rnd() * len(BOOK_COLORS))]
            # 最上段は天板に刺さらないように低くする(手続き生成では天板を突き抜けていた)
            h = min(h, H - 0.03 - (base + 0.0125) - 0.02 - (w * 0.6 if tilt else 0))
            items.append(dict(x=x + w / 2, y=base + 0.0125 + h / 2, w=w, h=h, d=d, tilt=tilt, c=c,
                              row=base))
            x += w + 0.003
    return items


def build() -> Model:
    m = Model("shelf")
    rnd = seeded(13)
    t = 0.03

    # 側板(外側の面に木目、前の縁を面取り)
    for s in (-1, 1):
        c = kit.jitter("wood", rnd, 0.08)
        m.box((t, H, D), (s * (W / 2 - t / 2), H / 2, 0), c, bevel=0.006, edges="+z",
              grain=("+x" if s > 0 else "-x", 5, 0.12), vary=0.06,
              faces={"-x" if s > 0 else "+x": kit.shade(c, 0.85)})
        # 釘の頭(棚板・天板・台輪の高さに 2 本ずつ)
        fx = s * (W / 2 + 0.0004)
        for y in BOARDS + [H - t / 2, 0.03]:
            for z in (-D * 0.3, D * 0.3):
                pts = [(fx, y - 0.004, z - 0.004), (fx, y - 0.004, z + 0.004),
                       (fx, y + 0.004, z + 0.004), (fx, y + 0.004, z - 0.004)]
                if s > 0:
                    pts.reverse()
                m.poly(pts, "#2a2420", mat="steel")
    # 天板(少し張り出す)と前の笠木
    m.box((W + 0.03, t, D + 0.03), (0, H - t / 2, 0.015), "wood", bevel=0.006,
          grain=("+y", 6, 0.12), vary=0.05)
    m.box((W + 0.01, 0.045, 0.025), (0, H - t - 0.022, D / 2 + 0.005), "woodDark", bevel=0.005,
          edges="+z", skip="-z")
    # 裏板:縦板張り(暗め)。板と板の間は細い溝
    nb = 6
    bw = (W - 2 * t) / nb
    for i in range(nb):
        x = -W / 2 + t + bw * (i + 0.5)
        c = kit.jitter("woodDark", rnd, 0.14)
        m.box((bw - 0.004, H - 0.06, 0.012), (x, H / 2 + 0.01, -D / 2 + 0.006), c, bevel=0.003,
              edges="+z", skip="-z", vary=0.12, faces={"+z": c})
    m.box((W - 2 * t, H - 0.06, 0.004), (0, H / 2 + 0.01, -D / 2 + 0.001), "woodDeep", skip="-z")
    # 棚板(手続き生成:幅 W−2t、厚み 0.025、奥行き D−0.02、z +0.01)
    for y in BOARDS:
        c = kit.jitter("woodLight", rnd, 0.1)
        m.box((W - 2 * t, 0.025, D - 0.02), (0, y, 0.01), c, bevel=0.005, edges="+z",
              grain=("+y", 5, 0.12), vary=0.06)
    # 台輪(床に置く台。手続き生成は 0.06 の高さ)
    m.box((W, 0.06, D), (0, 0.03, 0), "woodDeep", bevel=0.006, edges="+y", skip="-y",
          faces={"+z": kit.shade("woodDeep", 1.1)})

    # --- 本 ---
    pages = "paper"
    for b in book_layout():
        cover = kit.jitter(b["c"], rnd, 0.08)
        z = -D / 2 + 0.02 + b["d"] / 2
        frame = kit.xform((b["x"], b["y"], z), (0, 0, b["tilt"]))
        w, h, d = b["w"], b["h"], b["d"]
        # 表紙(底と裏は見えないので省く)。天は紙の色の小口
        m.box((w, h, d), (0, 0, 0), cover, matrix=frame, skip="-y,-z",
              faces={"+y": kit.mix(cover, pages, 0.7), "+z": kit.shade(cover, 1.05)}, vary=0.08)
        fz = d / 2 + 0.0006
        # 背の帯(2 本)と題箋
        if rnd() < 0.65:
            band = kit.mix("brass", cover, 0.35) if sum(kit.col(cover)) < 1.2 else kit.shade(cover, 0.6)
            for yy in (h * 0.36, h * 0.28, -h * 0.36):
                m.poly([kit.Vector(p) for p in (
                    frame @ kit.Vector((-w / 2, yy - 0.004, fz)),
                    frame @ kit.Vector((w / 2, yy - 0.004, fz)),
                    frame @ kit.Vector((w / 2, yy + 0.004, fz)),
                    frame @ kit.Vector((-w / 2, yy + 0.004, fz)),
                )], band, mat="wood")
        if rnd() < 0.45 and w > 0.026:
            lab = kit.mix(pages, cover, 0.15)
            yy = h * 0.08
            m.poly([
                frame @ kit.Vector((-w * 0.32, yy - 0.025, fz)),
                frame @ kit.Vector((w * 0.32, yy - 0.025, fz)),
                frame @ kit.Vector((w * 0.32, yy + 0.025, fz)),
                frame @ kit.Vector((-w * 0.32, yy + 0.025, fz)),
            ], lab, mat="paper")

    # 本立て(真鍮の L 字):2 段目の左端と 3 段目の右端
    rows = {}
    for b in book_layout():
        rows.setdefault(b["row"], []).append(b)
    for base, side in ((BOARDS[1], -1), (BOARDS[2], 1)):
        bs = rows[base]
        edge = min(b["x"] - b["w"] / 2 for b in bs) if side < 0 else max(b["x"] + b["w"] / 2 for b in bs)
        x = edge + side * 0.004
        y0 = base + 0.0125
        m.box((0.003, 0.15, 0.1), (x, y0 + 0.075, -D / 2 + 0.09), "brass", mat="brass",
              bevel=0.0012, edge=kit.shade("brass", 1.3))
        m.box((0.07, 0.003, 0.1), (x + side * 0.035, y0 + 0.0015, -D / 2 + 0.09),
              kit.shade("brass", 0.9), mat="brass", skip="-y")

    # --- 天板の上の小物 ---
    top = H
    # 木箱(板の継ぎ目つき)
    cx, cz = -0.42, -0.04
    m.box((0.3, 0.16, 0.22), (cx, top + 0.08, cz), kit.jitter("woodLight", rnd, 0.1), bevel=0.006,
          skip="-y", vary=0.1, grain=("+z", 3, 0.2))
    for y in (top + 0.054, top + 0.108):
        m.box((0.302, 0.003, 0.222), (cx, y, cz), kit.shade("woodDark", 0.8), skip="-y,+y")
    # 丸めた図面(3 本、紙)。端は少し暗い
    for i, (dx, dz, ry) in enumerate(((0.18, 0.06, 0.08), (0.24, -0.03, -0.05), (0.21, 0.015, 0.02))):
        r = 0.022 + i * 0.003
        y = top + r + (0.035 if i == 2 else 0)
        m.cyl(r, r, 0.5 - i * 0.06, (dx, y, dz), kit.jitter("paper", rnd, 0.06), seg=8,
              rot=(0, ry, math.pi / 2), mat="paper", cap=kit.shade("paper", 0.8))
    # 油差し(真鍮の胴と細い口)
    ox, oz = 0.6, 0.02
    m.cyl(0.035, 0.05, 0.06, (ox, top + 0.03, oz), "brass", seg=10, mat="brass", bevel=0.004,
          edge=kit.shade("brass", 1.3))
    m.cyl(0.006, 0.02, 0.05, (ox, top + 0.085, oz), kit.shade("brass", 0.9), seg=8, mat="brass")
    m.bar((ox, top + 0.1, oz), (ox - 0.11, top + 0.16, oz + 0.02), 0.006, 0.006,
          kit.shade("brass", 0.85), mat="brass")
    return m
