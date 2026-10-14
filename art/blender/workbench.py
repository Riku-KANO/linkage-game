"""
作業台の本体と小物(Workbench)。Workbench.tsx の ModelSlot は親の変換がない(ワールド座標)ので、
部品はワールド座標で置き、GLB の節点を BENCH.center へ平行移動する(頂点は作業台の中心からの相対)。
製図用紙・ドラフター・卓上ライトは手続き生成のまま。

  - 天板 3 枚(上の角を面取り、木目、ビスの頭)、脚・幕板・下の貫、すのこの下棚
  - 下棚の木箱 2 つ(すき間のある板張り。片方に丸棒)
  - 天板の小物:目盛りの入った定規、六角の鉛筆 3 本、消しゴム、マグカップ、マスキングテープ 4 枚、
    万力(右手前)、真鍮の歯車、ねじの入ったガラス瓶、筆立て
  - 見本機が歩く範囲(x 0.3〜0.8、z −0.92 付近)と紙の上は空けておく
"""

import math

import kit
from kit import Model, seeded

FILE = "workbench.glb"

CENTER = (0.0, 0.0, -0.9)  # BENCH.center
WIDTH = 2.3
DEPTH = 1.0
TOP = 0.92
PAPER = dict(cx=-0.45, cz=-0.9, w=0.841, h=0.594)

PREVIEWS = [
    ("home", (0.55, 2.45, 4.3), (0.15, 1.05, -1.0), 60),
    ("top", (0.2, 2.2, -0.3), (0.2, 0.92, -0.95), 35),
    ("vise", (1.4, 1.25, 0.0), (0.9, 0.95, -0.5), 35),
]


def build() -> Model:
    m = Model("workbench", origin=CENTER)
    rnd = seeded(3)
    cx, _, cz = CENTER
    hw, hd = WIDTH / 2, DEPTH / 2

    m.section("body")
    # --- 本体 ---
    boards = 3
    d = DEPTH / boards
    for i in range(boards):
        c = kit.jitter("woodLight", rnd, 0.1)
        z = cz - hd + d * (i + 0.5)
        # 下の面も作る(影の計算は裏の面で行うので、底がないと日の光が抜ける)
        m.box((WIDTH, 0.06, d - 0.004), (cx, TOP - 0.03, z), c, bevel=0.006, edges="+y",
              grain=("+y", 9, 0.06), vary=0.07, faces={"+x": kit.shade(c, 0.85), "-x": kit.shade(c, 0.85)})
        # ビスの頭(脚の上で板ごとに 2 本ずつ、少しずらす)
        for sx in (-1, 1):
            for dz in (-d * 0.25, d * 0.25):
                x = cx + sx * (hw - 0.1) + (rnd() - 0.5) * 0.02
                zz = z + dz + (rnd() - 0.5) * 0.02
                y = TOP + 0.0004
                e = 0.0032
                m.poly([(x - e, y, zz + e), (x + e, y, zz + e), (x + e, y, zz - e), (x - e, y, zz - e)],
                       kit.mix(c, "#4a4f55", 0.6), mat="steel", facing=(0, 1, 0))
    leg_h = TOP - 0.06
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box((0.08, leg_h, 0.08), (cx + sx * (hw - 0.1), leg_h / 2, cz + sz * (hd - 0.08)), "wood",
                  bevel=0.008, edges="y", skip="+y,-y", vary=0.08)
        # 横の幕板と下の貫
        m.box((0.04, 0.1, DEPTH - 0.16), (cx + sx * (hw - 0.1), TOP - 0.11, cz), "wood", bevel=0.004,
              vary=0.06)
        m.box((0.045, 0.05, DEPTH - 0.16), (cx + sx * (hw - 0.1), 0.16, cz), "woodDark", skip="-y")
    for sz in (-1, 1):
        m.box((WIDTH - 0.2, 0.1, 0.04), (cx, TOP - 0.11, cz + sz * (hd - 0.08)), "wood", bevel=0.004,
              vary=0.06)
        m.box((WIDTH - 0.2, 0.04, 0.03), (cx, 0.165, cz + sz * (hd - 0.08)), "woodDark",
              skip="-y")
    # すのこの下棚(手続き生成:2.06 × 0.8、y = 0.2)
    ns = 5
    sw = (DEPTH - 0.2) / ns
    for i in range(ns):
        c = kit.jitter("woodDark", rnd, 0.14)
        m.box((WIDTH - 0.24, 0.03, sw - 0.004), (cx, 0.2, cz - (DEPTH - 0.2) / 2 + sw * (i + 0.5)), c,
              bevel=0.004, edges="+y", vary=0.1)

    m.section("crates")
    # --- 下棚の木箱 ---
    def crate(size, pos, slats, c0):
        sx_, sy_, sz_ = size
        px, py, pz = pos
        post = 0.025
        dark = kit.shade(c0, 0.35)
        # 中の暗がり(すき間から見える)
        m.box((sx_ - 0.02, sy_ - 0.01, sz_ - 0.02), (px, py + 0.005, pz), dark, skip="+y", flip=True)
        for ix in (-1, 1):
            for iz in (-1, 1):
                m.box((post, sy_, post), (px + ix * (sx_ / 2 - post / 2), py, pz + iz * (sz_ / 2 - post / 2)),
                      kit.shade(c0, 0.85), skip="-y")
        sh = (sy_ - 0.01) / slats
        for k in range(slats):
            y = py - sy_ / 2 + sh * (k + 0.5) + 0.005
            for iz in (-1, 1):
                c = kit.jitter(c0, rnd, 0.16)
                m.box((sx_, sh - 0.014, 0.012), (px, y, pz + iz * (sz_ / 2 - 0.006)), c,
                      skip="-z" if iz > 0 else "+z", vary=0.12)
            for ix in (-1, 1):
                c = kit.jitter(c0, rnd, 0.16)
                m.box((0.012, sh - 0.014, sz_ - 0.024), (px + ix * (sx_ / 2 - 0.006), y, pz), c,
                      skip="-x" if ix > 0 else "+x", vary=0.12)

    crate((0.42, 0.26, 0.34), (cx - 0.6, 0.345, cz + 0.05), 3, "woodLight")
    crate((0.3, 0.18, 0.3), (cx + 0.55, 0.305, cz - 0.05), 2, kit.jitter("wood", rnd, 0.1))
    # 丸棒(木箱から斜めに突き出る)
    for i in range(4):
        a = (i - 1.5) * 0.08
        m.cyl(0.012, 0.012, 0.44, (cx - 0.66 + i * 0.04, 0.42, cz + 0.02 + (i % 2) * 0.05),
              kit.jitter("#c9a073", rnd, 0.1), seg=6, rot=(0.25 + a, 0, -0.35 - a), cap="#e2c79c")
    # 小さい木箱の上の端材
    m.box((0.22, 0.03, 0.08), (cx + 0.53, 0.41, cz - 0.07), "woodLight", bevel=0.004, rot=(0, 0.3, 0),
          grain=("+y", 3, 0.2))

    # --- 天板の小物 ---
    y = TOP
    m.section("ruler")
    # 定規(手続き生成:0.5 × 0.004 × 0.035、(−0.15, −0.47)、回転 0.12)と目盛り
    ruler = kit.xform((-0.15, y + 0.002, -0.47), (0, 0.12, 0))
    m.box((0.5, 0.004, 0.035), (0, 0, 0), "#e8d9a8", matrix=ruler, skip="-y", bevel=0.0015,
          edges="+y", vary=0.06)
    for k in range(51):
        ln = 0.014 if k % 10 == 0 else 0.01 if k % 5 == 0 else 0.006
        x = -0.245 + k * 0.0098
        z = 0.0175 - 0.002 - ln / 2
        m.poly([ruler @ kit.Vector(p) for p in ((x - 0.0006, 0.0021, z + ln / 2), (x + 0.0006, 0.0021, z + ln / 2),
                                                 (x + 0.0006, 0.0021, z - ln / 2), (x - 0.0006, 0.0021, z - ln / 2))],
               "#3b2f25")
    m.section("pencils")
    # 鉛筆(六角の軸・削った木・芯)
    for i, c in enumerate(("#c94f3a", "#3d6a9a", "#e0b23c")):
        frame = kit.xform((-0.02 + i * 0.03, y + 0.0045, -0.55 + i * 0.012), (0, 0.3 + i * 0.2, math.pi / 2))
        m.cyl(0.0045, 0.0045, 0.14, (0, -0.015, 0), c, seg=6, matrix=frame, cap="#e8c99a",
              phase=math.pi / 6)
        m.cyl(0.0012, 0.0045, 0.022, (0, 0.066, 0), "#e8c99a", seg=6, matrix=frame, caps="none",
              phase=math.pi / 6)
        m.cyl(0.0003, 0.0013, 0.006, (0, 0.08, 0), "#2b2b2b", seg=6, matrix=frame, caps="none",
              phase=math.pi / 6)
    # 消しゴム
    m.box((0.05, 0.015, 0.025), (-0.08, y + 0.0075, -0.62), "#d98e9a", rot=(0, 0.4, 0), bevel=0.003,
          skip="-y", faces={"+y": "#e3a4ae"})
    m.section("mug")
    # マグカップ(口は開いていて、中にコーヒー)と取っ手
    mx, mz = -0.05, -1.3
    mug = "#d8cdb8"
    m.cyl(0.045, 0.04, 0.1, (mx, y + 0.05, mz), mug, seg=10, caps="bottom", bevel=0.003,
          edge=kit.shade(mug, 1.1), vary=0.05)
    # 内壁(裏返した筒)
    m.cyl(0.042, 0.037, 0.096, (mx, y + 0.052, mz), kit.shade(mug, 0.8), seg=10, caps="none",
          flip=True)
    m.cyl(0.04, 0.04, 0.003, (mx, y + 0.085, mz), "#3a2416", seg=10, caps="top")
    m.box((0.035, 0.012, 0.012), (mx + 0.055, y + 0.075, mz), mug, bevel=0.003)
    m.box((0.035, 0.012, 0.012), (mx + 0.052, y + 0.025, mz), mug, bevel=0.003)
    m.box((0.012, 0.062, 0.012), (mx + 0.068, y + 0.05, mz), mug, bevel=0.003)
    m.section("tape")
    # マスキングテープ(用紙の四隅、手続き生成と同じ位置・向き)
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box((0.05, 0.002, 0.022),
                  (PAPER["cx"] + sx * (PAPER["w"] / 2 - 0.004), y + 0.0025, PAPER["cz"] + sz * (PAPER["h"] / 2 - 0.004)),
                  kit.jitter("#e9d98f", rnd, 0.08), rot=(0, sx * sz * 0.785, 0), mat="paper", skip="-y",
                  vary=0.08)

    m.section("vise")
    # 万力(右手前。手続き生成:胴 (0.95, −0.47)、口 z −0.38、ねじ z −0.33 まで)
    blue = "blue"
    bluew = kit.worn_paint(blue, "#9aa2aa", 0.5)
    vx = 0.95
    m.box((0.17, 0.012, 0.15), (vx, y + 0.006, -0.49), kit.shade(blue, 0.8), mat="steel", bevel=0.003,
          edge=bluew, skip="-y")
    for bx in (-0.065, 0.065):
        for bz in (-0.54, -0.44):
            m.cyl(0.007, 0.007, 0.006, (vx + bx, y + 0.015, bz), kit.shade("metal", 0.9), seg=6,
                  mat="steel", caps="top", cap=kit.shade("metal", 1.2))
    m.box((0.12, 0.06, 0.1), (vx, y + 0.042, -0.49), blue, mat="steel", bevel=0.008, edge=bluew,
          skip="-y", vary=0.08)
    m.box((0.16, 0.065, 0.03), (vx, y + 0.06, -0.425), blue, mat="steel", bevel=0.006, edge=bluew,
          vary=0.08)
    m.box((0.16, 0.07, 0.03), (vx, y + 0.06, -0.37), blue, mat="steel", bevel=0.006, edge=bluew,
          vary=0.08)
    # 口金(鋼の板と刻み)
    for jz, s in ((-0.4085, 1), (-0.3865, -1)):
        m.box((0.15, 0.028, 0.005), (vx, y + 0.08, jz), kit.shade("metal", 1.15), mat="steel",
              skip="-y")
        for k in range(5):
            yy = y + 0.07 + k * 0.005
            zz = jz + s * 0.0029
            pts = [(vx - 0.075, yy - 0.0008, zz), (vx + 0.075, yy - 0.0008, zz),
                   (vx + 0.075, yy + 0.0008, zz), (vx - 0.075, yy + 0.0008, zz)]
            m.poly(pts if s > 0 else list(reversed(pts)), kit.shade("metal", 0.55), mat="steel")
    # 滑り棒・ねじ・ハンドル
    for bx in (-0.045, 0.045):
        m.cyl(0.006, 0.006, 0.15, (vx + bx, y + 0.03, -0.43), kit.shade("metal", 1.1), seg=6,
              rot=(math.pi / 2, 0, 0), mat="steel")
    m.cyl(0.015, 0.015, 0.02, (vx, y + 0.055, -0.345), blue, seg=8, rot=(math.pi / 2, 0, 0), mat="steel",
          bevel=0.003, edge=bluew)
    m.cyl(0.008, 0.008, 0.11, (vx, y + 0.055, -0.29), kit.shade("metal", 1.05), seg=6,
          rot=(math.pi / 2, 0, 0), mat="steel")
    m.cyl(0.012, 0.012, 0.018, (vx, y + 0.055, -0.235), kit.shade("metal", 0.9), seg=8,
          rot=(math.pi / 2, 0, 0), mat="steel")
    m.cyl(0.005, 0.005, 0.17, (vx + 0.01, y + 0.055, -0.235), kit.shade("metal", 1.2), seg=6,
          rot=(0, 0, math.pi / 2), mat="steel")
    for bx in (-0.075, 0.095):
        m.ico((vx + bx, y + 0.055, -0.235), (0.01, 0.01, 0.01), kit.shade("metal", 0.9), mat="steel",
              subdiv=1)

    m.section("gear")
    # 真鍮の歯車(手続き生成:(0.62, −0.5)、半径 0.05、歯 12)
    teeth = 12
    prof = []
    for k in range(teeth):
        a0 = k / teeth * math.tau
        for da, r in ((-0.12, 0.05), (-0.07, 0.061), (0.07, 0.061), (0.12, 0.05)):
            a = a0 + da * 2
            prof.append((r * math.cos(a), r * math.sin(a)))
    m.prism(prof, 0.012, (0.62, y + 0.006, -0.5), "brass", rot=(-math.pi / 2, 0, 0), mat="brass",
            side=kit.shade("brass", 0.8), caps="front", vary=0.08)
    m.cyl(0.013, 0.013, 0.016, (0.62, y + 0.008, -0.5), kit.shade("brass", 0.75), seg=8, mat="brass",
          caps="top", cap=kit.shade("brass", 1.15))
    m.cyl(0.005, 0.005, 0.017, (0.62, y + 0.0085, -0.5), "#2a2420", seg=6, mat="steel", caps="top")
    for k in range(4):
        a = k / 4 * math.tau + 0.4
        hx, hz = 0.62 + 0.03 * math.cos(a), -0.5 + 0.03 * math.sin(a)
        m.cyl(0.008, 0.008, 0.0005, (hx, y + 0.0122, hz), kit.shade("brass", 0.35), seg=8, mat="brass",
              caps="top")

    m.section("jar")
    # ねじの入ったガラス瓶(右奥)と鉄のふた
    jx, jz = 0.72, -1.25
    m.cyl(0.04, 0.04, 0.11, (jx, y + 0.055, jz), "glass", seg=10, mat="glass", caps="bottom")
    m.cyl(0.043, 0.043, 0.016, (jx, y + 0.118, jz), kit.shade("metalDark", 1.2), seg=10, mat="steel",
          bevel=0.002, edge=kit.shade("metal", 1.1))
    m.cyl(0.036, 0.036, 0.05, (jx, y + 0.026, jz), kit.mix("metal", "brass", 0.35), seg=10, mat="steel",
          caps="top", vary=0.3)
    for k in range(7):
        a = rnd() * math.tau
        r = rnd() * 0.028
        m.cyl(0.004, 0.004, 0.003, (jx + r * math.cos(a), y + 0.0525, jz + r * math.sin(a)),
              "brass" if k % 2 else "metal", seg=6, mat="steel", caps="top",
              rot=((rnd() - 0.5) * 0.8, 0, (rnd() - 0.5) * 0.8))
    m.section("tin")
    # 筆立て(ブリキ缶)と筆・鉛筆
    tx, tz = 0.2, -1.3
    m.cyl(0.034, 0.034, 0.09, (tx, y + 0.045, tz), kit.shade("metal", 1.1), seg=10, mat="steel",
          caps="bottom", vary=0.15)
    for yy in (y + 0.012, y + 0.08):
        m.cyl(0.0355, 0.0355, 0.006, (tx, yy, tz), kit.shade("metal", 0.8), seg=10, mat="steel",
              caps="none")
    m.cyl(0.032, 0.032, 0.002, (tx, y + 0.07, tz), "#1e1a17", seg=10, mat="steel", caps="top")
    for k, (c, ax, az) in enumerate((("#3d6a9a", 0.18, 0.1), ("#c94f3a", -0.15, 0.05),
                                     ("#e8c99a", 0.02, -0.18))):
        frame = kit.xform((tx + ax * 0.06, y + 0.11, tz + az * 0.06), (az, 0, -ax))
        m.cyl(0.004, 0.0045, 0.13, (0, 0, 0), c, seg=6, matrix=frame)
        if k == 2:
            m.cyl(0.0008, 0.006, 0.02, (0, 0.074, 0), "#4a3a2c", seg=6, matrix=frame, caps="none")
    return m
