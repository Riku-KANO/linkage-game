"""
工房の建物(Room)。ワールド座標(原点は部屋の床の中央、手前 +z は壁がない)。
窓枠と窓台(WindowHotspot、メニュー物体)と天井の裸電球(HangingBulb)は手続き生成のまま。

  - 床:継ぎ目をずらした床板(上の角を面取り)、すき間から見える暗い下地、石の基礎
  - 壁:漆喰(むらのある頂点色)、腰板(縦の羽目板・笠木・幅木)、外側は板張り(奥の壁は押縁つき)
  - 天井板、梁 3 本と方杖・鉄の当て板、壁の柱と桁、奥の角の柱
  - 左の壁の有孔ボードと工具(金づち・スパナ・ペンチ・ドライバー・のこぎり)
  - 外へ開いた窓の戸 2 枚(枠・ガラス・蝶番・つまみ)、窓台の植木鉢(サボテン)と油差し
  - 外から見える切妻のトタン屋根
"""

import math

import kit
from kit import Model, seeded, value_noise

FILE = "workshop-room.glb"

X0, X1 = -4.0, 4.0
ZB, ZF = -3.0, 4.8
H = 3.3
T = 0.2
Z_IN = ZB + T / 2
Z_OUT = ZB - T / 2
WX0, WX1, WY0, WY1 = -2.9, -0.7, 0.9, 2.5
WAIN = 0.85
BEAMS_Z = (-1.7, 0.6, 2.9)
ZMID = (ZF + ZB) / 2  # 側壁の中心 z(手続き生成と同じ 0.9)
DEPTH = ZF - ZB + T  # 側壁の長さ 8.0(z ∈ [−3.1, 4.9])

PREVIEWS = [
    ("home", (0.55, 2.45, 4.3), (0.15, 1.05, -1.0), 24),
    ("outside", (-3.0, 3.0, -16.0), (0.0, 1.6, 0.0), 35),
    ("pegboard", (-1.8, 1.6, -0.4), (-4.0, 1.5, -0.6), 30),
    ("window", (-1.8, 1.7, 0.2), (-1.8, 1.4, -3.5), 35),
]


def frange(a: float, b: float, step: float):
    """[a, b] を step 前後で等分した点(両端を含む)"""
    n = max(1, round((b - a) / step))
    return [a + (b - a) * i / n for i in range(n + 1)]


def merge_pts(*lists):
    return sorted(set(round(x, 6) for lst in lists for x in lst))


def build() -> Model:
    m = Model("room")
    rnd = seeded(7)
    noise = value_noise(19)

    m.section("floor")
    floor(m, rnd)
    m.section("walls")
    walls(m, rnd, noise)
    m.section("wainscot")
    wainscot(m, rnd)
    m.section("ceiling")
    ceiling(m, rnd)
    m.section("pegboard")
    pegboard(m, rnd)
    m.section("window")
    window(m, rnd)
    m.section("roof")
    roof(m, rnd)
    return m


# ---------------------------------------------------------------------------


def floor(m: Model, rnd):
    # 石の基礎(手続き生成の土台と同じ外形:x ±4.2、y −0.36〜−0.04、z −3.2〜4.8)
    m.box((X1 - X0 + 2 * T, 0.32, ZF - ZB + T), (0, -0.2, ZMID - T / 2), "#6b5e52", skip="+y,-y",
          vary=0.16, mat="wood")
    # 床板のすき間から見える暗い下地
    m.poly([(X0, -0.004, Z_IN), (X1, -0.004, Z_IN), (X1, -0.004, ZF), (X0, -0.004, ZF)],
           kit.shade("woodDeep", 0.6), facing=(0, 1, 0))
    pw = 0.19
    gap = 0.006
    c = 0.004  # 面取り
    dep = 0.003
    z = Z_IN
    row = 0
    while z < ZF - 0.02:
        w = min(pw, ZF - z) - gap
        z0, z1 = z, z + w
        # 板の継ぎ目(行ごとにずらす)
        x = X0
        first = True
        while x < X1 - 0.05:
            ln = (0.8 + rnd() * 2.0) if first else (2.6 + rnd() * 2.4)
            first = False
            x1 = min(X1, x + ln)
            if X1 - x1 < 0.5:
                x1 = X1
            col = kit.jitter("floor", rnd, 0.14)
            edgec = kit.worn_wood(kit.shade(col, 1.05))
            xa, xb = x + (0.002 if x > X0 else 0), x1 - (0.002 if x1 < X1 else 0)
            top = [(xa + c, 0, z0 + c), (xb - c, 0, z0 + c), (xb - c, 0, z1 - c), (xa + c, 0, z1 - c)]
            m.poly(top, col, vary=0.12, facing=(0, 1, 0))
            # 長手の面取り 2 枚(継ぎ目は 4mm のすき間で見せる)
            m.poly([(xa + c, -dep, z0), (xb - c, -dep, z0), top[1], top[0]], edgec, facing=(0, 1, -1))
            m.poly([top[3], top[2], (xb - c, -dep, z1), (xa + c, -dep, z1)], edgec, facing=(0, 1, 1))
            x = x1
        z += pw
        row += 1


# ---------------------------------------------------------------------------


def plaster_color(noise, rnd):
    base = kit.col("plaster")

    def f(p):
        n = noise(p.x / 0.9 + p.z / 0.9, p.y / 0.7) * 0.6 + noise(p.x / 0.25 + 30 - p.z / 0.25, p.y / 0.25) * 0.4
        k = 0.88 + 0.18 * n
        # 天井近くは少しすすけて暗い
        k *= 1 - max(0.0, p.y - 2.4) * 0.12
        return kit.shade(base, k)

    return f


def walls(m: Model, rnd, noise):
    pc = plaster_color(noise, rnd)
    # 奥の壁の内側(腰板より上)。窓の穴は抜く
    xs = merge_pts(frange(X0, X1, 0.5), [WX0, WX1])
    ys = merge_pts(frange(WAIN, H, 0.45), [WY0, WY1])

    def in_window(p):
        return WX0 < p.x < WX1 and WY0 < p.y < WY1

    m.panel((0, 0, Z_IN), (1, 0, 0), (0, 1, 0), xs, ys, pc, (0, 0, 1), skip_fn=in_window)
    # 窓の穴の内側(額縁)
    reveal = kit.shade("plaster", 0.82)
    m.poly([(WX0, WY0, Z_OUT), (WX0, WY0, Z_IN), (WX0, WY1, Z_IN), (WX0, WY1, Z_OUT)], reveal, facing=(1, 0, 0))
    m.poly([(WX1, WY0, Z_OUT), (WX1, WY0, Z_IN), (WX1, WY1, Z_IN), (WX1, WY1, Z_OUT)], reveal, facing=(-1, 0, 0))
    m.poly([(WX0, WY1, Z_OUT), (WX1, WY1, Z_OUT), (WX1, WY1, Z_IN), (WX0, WY1, Z_IN)], reveal, facing=(0, -1, 0))
    m.poly([(WX0, WY0, Z_OUT), (WX1, WY0, Z_OUT), (WX1, WY0, Z_IN), (WX0, WY0, Z_IN)], reveal, facing=(0, 1, 0))
    # 左右の壁の内側(腰板より上)
    zs = frange(Z_IN, ZF + T / 2, 0.5)
    ys2 = frange(WAIN, H, 0.45)
    m.panel((X0, 0, 0), (0, 0, 1), (0, 1, 0), zs, ys2, pc, (1, 0, 0))
    m.panel((X1, 0, 0), (0, 0, 1), (0, 1, 0), zs, ys2, pc, (-1, 0, 0))
    # 側壁の手前の切り口
    zf = ZMID + DEPTH / 2
    for xa, xb in ((X0 - T, X0), (X1, X1 + T)):
        m.poly([(xa, 0, zf), (xb, 0, zf), (xb, H, zf), (xa, H, zf)], kit.shade("woodDark", 0.9), facing=(0, 0, 1))

    # --- 外側の板張り ---
    weather = "#7d6655"
    # 奥の壁:縦板(板の間のすき間から暗い下地が見える)
    bw = 0.2
    for xa, xb in ((X0 - T, WX0), (WX1, X1 + T)):
        m.poly([(xa, -0.04, Z_OUT), (xb, -0.04, Z_OUT), (xb, H + 0.14, Z_OUT), (xa, H + 0.14, Z_OUT)],
               kit.shade("#7d6655", 0.35), facing=(0, 0, -1))
    for ya, yb in ((-0.04, WY0), (WY1, H + 0.14)):
        m.poly([(WX0, ya, Z_OUT), (WX1, ya, Z_OUT), (WX1, yb, Z_OUT), (WX0, yb, Z_OUT)],
               kit.shade("#7d6655", 0.35), facing=(0, 0, -1))
    # 板の割り付けは窓の両端に合わせる(窓の脇に細いすき間ができないように)
    xs_b = merge_pts(frange(X0 - T, WX0, bw), frange(WX0, WX1, bw), frange(WX1, X1 + T, bw))
    yb0, yb1 = -0.04, H + 0.14
    zo = Z_OUT
    for i in range(len(xs_b) - 1):
        xa, xb = xs_b[i], xs_b[i + 1]
        col = kit.jitter(weather, rnd, 0.16)
        segs = [(yb0, yb1)]
        if xb > WX0 and xa < WX1:
            segs = [(yb0, WY0), (WY1, yb1)]
        for ya, yb in segs:
            m.poly([(xa + 0.004, ya, zo - 0.006), (xb - 0.004, ya, zo - 0.006), (xb - 0.004, yb, zo - 0.006),
                    (xa + 0.004, yb, zo - 0.006)], col, vary=0.16, facing=(0, 0, -1))
    # 左右の壁の外側:縦板(押縁なし)
    for xw, fx in ((X0 - T, -1), (X1 + T, 1)):
        zs_b = frange(ZB - T / 2, zf, bw)
        for i in range(len(zs_b) - 1):
            za, zb = zs_b[i], zs_b[i + 1]
            col = kit.jitter(weather, rnd, 0.16)
            m.poly([(xw, yb0, za), (xw, yb0, zb), (xw, yb1, zb), (xw, yb1, za)], col, vary=0.14,
                   facing=(fx, 0, 0))
    # 角の見切り板(外の角)
    for x in (X0 - T, X1 + T):
        m.box((0.08, yb1 - yb0, 0.08), (x, (yb0 + yb1) / 2, Z_OUT), kit.shade(weather, 0.75), skip="+y,-y",
              bevel=0.008, edges="y")


# ---------------------------------------------------------------------------


def wainscot(m: Model, rnd):
    bw = 0.15
    zf = ZMID + DEPTH / 2
    back = kit.shade("woodDark", 0.45)
    # 奥の壁
    runs = [
        # (原点, 板の並ぶ向き u, 長さ, 表の向き, 裏打ちの位置)
        ((X0, 0, Z_IN + 0.03), (1, 0, 0), X1 - X0, (0, 0, 1)),
        ((X0 + 0.03, 0, Z_IN), (0, 0, 1), zf - Z_IN, (1, 0, 0)),
        ((X1 - 0.03, 0, Z_IN), (0, 0, 1), zf - Z_IN, (-1, 0, 0)),
    ]
    for o, u, length, nrm in runs:
        o = kit.Vector(o)
        u = kit.Vector(u)
        n = kit.Vector(nrm)
        # 裏打ち(溝から見える暗い面)
        p0 = o - n * 0.004
        m.poly([p0, p0 + u * length, p0 + u * length + kit.Vector((0, WAIN, 0)), p0 + kit.Vector((0, WAIN, 0))],
               back, facing=nrm)
        k = 0
        nb = max(1, round(length / bw))
        step = length / nb
        while k < nb:
            a = step * k + 0.003
            b = step * (k + 1) - 0.003
            col = kit.jitter("woodDark", rnd, 0.16)
            y0, y1 = 0.1, WAIN - 0.02
            # 表の面と、左の面取り
            f = [o + u * (a + 0.007), o + u * b, o + u * b, o + u * (a + 0.007)]
            f = [f[0] + kit.Vector((0, y0, 0)), f[1] + kit.Vector((0, y0, 0)), f[2] + kit.Vector((0, y1, 0)),
                 f[3] + kit.Vector((0, y1, 0))]
            m.poly(f, col, vary=0.1, facing=nrm)
            ch = [o + u * a - n * 0.004 + kit.Vector((0, y0, 0)), f[0], f[3], o + u * a - n * 0.004 + kit.Vector((0, y1, 0))]
            m.poly(ch, kit.worn_wood(col), facing=tuple(n - u))
            k += 1
        # 幅木と笠木
        mid = o + u * (length / 2)
        if abs(u.x) > 0.5:
            m.box((length, 0.11, 0.02), (mid.x, 0.055, mid.z + n.z * 0.01), kit.shade("woodDeep", 1.1),
                  bevel=0.005, edges="+y", skip="-y" + (",-z" if n.z > 0 else ",+z"))
            m.box((length, 0.04, 0.05), (mid.x, WAIN, mid.z + n.z * 0.02), "wood", bevel=0.008,
                  skip="-z" if n.z > 0 else "+z", vary=0.08)
        else:
            m.box((0.02, 0.11, length), (mid.x + n.x * 0.01, 0.055, mid.z), kit.shade("woodDeep", 1.1),
                  bevel=0.005, edges="+y", skip="-y" + (",-x" if n.x > 0 else ",+x"))
            m.box((0.05, 0.04, length), (mid.x + n.x * 0.02, WAIN, mid.z), "wood", bevel=0.008,
                  skip="-x" if n.x > 0 else "+x", vary=0.08)


# ---------------------------------------------------------------------------


def ceiling(m: Model, rnd):
    zf = ZMID + DEPTH / 2
    # 天井の厚み(外から見える縁)。下面は天井板、上面は屋根の下
    m.box((X1 - X0 + 2 * T, 0.14, DEPTH), (0, H + 0.07, ZMID), "woodDeep", skip="+y,-y")
    m.poly([(X0, H + 0.004, Z_IN), (X1, H + 0.004, Z_IN), (X1, H + 0.004, zf), (X0, H + 0.004, zf)],
           kit.shade("woodDeep", 0.5), facing=(0, -1, 0))
    pz = frange(Z_IN, zf, 0.3)
    for i in range(len(pz) - 1):
        col = kit.jitter("woodDark", rnd, 0.14)
        za, zb = pz[i] + 0.003, pz[i + 1] - 0.003
        m.poly([(X0, H, za), (X1, H, za), (X1, H, zb), (X0, H, zb)], col, vary=0.12, facing=(0, -1, 0))
    # 梁(手続き生成:8 × 0.2 × 0.22、y 3.2)
    for z in BEAMS_Z:
        col = kit.jitter("woodDark", rnd, 0.1)
        m.box((X1 - X0, 0.2, 0.22), (0, H - 0.1, z), col, bevel=0.015, edges="x", skip="+y",
              grain=("-y", 4, 0.1), vary=0.1)
        for s in (-1, 1):
            # 柱(壁際)と方杖
            px = s * (X1 - 0.08)
            m.box((0.16, H - 0.2, 0.16), (px, (H - 0.2) / 2, z), kit.jitter("woodDark", rnd, 0.1), bevel=0.012,
                  edges="y", skip="+y,-y", vary=0.1)
            a = (px - s * 0.06, H - 0.75, z)
            b = (px - s * 0.62, H - 0.19, z)
            m.bar(a, b, 0.1, 0.1, kit.jitter("woodDark", rnd, 0.1), bevel=0.01, edges="x", skip="", vary=0.08)
            # 鉄の当て板とボルト(梁と方杖の継ぎ目)
            for (jx, jy, half) in ((px - s * 0.5, H - 0.17, 0.11), (px - s * 0.1, H - 0.62, 0.08)):
                for side in (1,):  # カメラから見える手前の面だけ
                    zz = z + side * (half + 0.003)
                    m.box((0.1, 0.1, 0.006), (jx, jy, zz), "#2f3236", mat="steel", skip="-z" if side > 0 else "+z",
                          rot=(0, 0, s * math.pi / 4))
                    m.cyl(0.011, 0.011, 0.01, (jx, jy, zz + side * 0.006), "#4a4f55", seg=6, mat="steel",
                          caps="top", rot=(side * math.pi / 2, 0, 0), cap="#6a7077")
    # 桁(壁の上端を回る横材)
    m.box((X1 - X0, 0.16, 0.12), (0, H - 0.08, Z_IN + 0.06), "woodDark", bevel=0.01, edges="x",
          skip="+y,-z", vary=0.1)
    for s in (-1, 1):
        m.box((0.12, 0.16, zf - Z_IN), (s * (X1 - 0.06), H - 0.08, (zf + Z_IN) / 2), "woodDark", bevel=0.01,
              edges="z", skip="+y" + (",-x" if s < 0 else ",+x"), vary=0.1)
    # 奥の角の柱(手続き生成:0.18 角、x ±3.91、z −2.81)
    for x in (X0 + 0.09, X1 - 0.09):
        m.box((0.18, H, 0.18), (x, H / 2, Z_IN + 0.09), kit.jitter("woodDark", rnd, 0.1), bevel=0.014,
              edges="y", skip="+y,-y", vary=0.1)


# ---------------------------------------------------------------------------


def pegboard(m: Model, rnd):
    px = X0 + 0.04  # ボードの中心 x(手続き生成と同じ)
    fx = px + 0.01  # 表の面
    yc, zc, hh, ww = 1.55, -0.6, 0.9, 1.6
    m.box((0.02, hh, ww), (px, yc, zc), kit.jitter("woodLight", rnd, 0.06), skip="-x", vary=0.1)
    # 縁の見切り
    for dy in (-1, 1):
        m.box((0.03, 0.035, ww + 0.035), (px + 0.005, yc + dy * (hh / 2), zc), "woodDark", skip="-x",
              faces={"+y": kit.shade("woodDark", 1.2)})
    for dz in (-1, 1):
        m.box((0.03, hh - 0.035, 0.035), (px + 0.005, yc, zc + dz * (ww / 2)), "woodDark", skip="-x,+y,-y")
    # 穴(暗い小さな四角)
    hole = kit.shade("woodDeep", 0.55)
    for iy in range(8):
        for iz in range(15):
            y = yc - hh / 2 + 0.1 + iy * 0.1
            z = zc - ww / 2 + 0.1 + iz * 0.1
            d = 0.0045
            m.poly([(fx + 0.0005, y - d, z - d), (fx + 0.0005, y - d, z + d), (fx + 0.0005, y + d, z + d),
                    (fx + 0.0005, y + d, z - d)], hole, facing=(1, 0, 0))
    # 工具:局所座標(横 u = −z、縦 v = y、手前 +x)で組む
    def frame(z, y):
        return kit.xform((fx + 0.004, y, z), (0, math.pi / 2, 0))

    steel = "#9aa2aa"
    dark = "#3d4248"

    def peg(z, y):
        m.cyl(0.004, 0.004, 0.03, (fx + 0.015, y, z), "#c7ccd1", seg=6, rot=(0, 0, -math.pi / 2), mat="steel",
              caps="top")

    # 金づち
    f = frame(-1.25, 1.6)
    m.box((0.028, 0.3, 0.02), (0, -0.07, 0.012), "woodLight", matrix=f, bevel=0.005, skip="-z", vary=0.1,
          grain=("+z", 3, 0.15))
    m.box((0.12, 0.034, 0.03), (0, 0.095, 0.017), "#5c6268", mat="steel", matrix=f, bevel=0.005, skip="-z",
          edge="#9aa2aa")
    peg(-1.25 - 0.03, 1.6 + 0.07)
    # スパナ 2 本
    for k, (z, sc) in enumerate(((-0.99, 1.0), (-0.73, 0.78))):
        f = frame(z, 1.6)
        m.box((0.024 * sc, 0.26 * sc, 0.006), (0, -0.02, 0.004), steel, mat="steel", matrix=f, skip="-z")
        m.box((0.06 * sc, 0.045 * sc, 0.007), (0, 0.13 * sc, 0.004), steel, mat="steel", matrix=f, skip="-z")
        m.box((0.022 * sc, 0.03 * sc, 0.0005), (0, 0.142 * sc, 0.008), dark, mat="steel", matrix=f, skip="-z")
        m.cyl(0.022 * sc, 0.022 * sc, 0.007, (0, -0.16 * sc, 0.004), steel, seg=6, mat="steel", matrix=f,
              rot=(math.pi / 2, 0, 0), caps="top")
        m.cyl(0.011 * sc, 0.011 * sc, 0.0005, (0, -0.16 * sc, 0.008), dark, seg=6, mat="steel", matrix=f,
              rot=(math.pi / 2, 0, 0), caps="top")
        peg(z, 1.6 + 0.16 * sc)
    # ペンチ
    f = frame(-0.47, 1.6)
    for s in (-1, 1):
        g = f @ kit.xform((0, 0.02, 0.006), (0, 0, s * 0.12))
        m.box((0.016, 0.22, 0.008), (0, -0.04, 0), steel, mat="steel", matrix=g, skip="-z")
        m.box((0.022, 0.11, 0.012), (0, -0.1, 0.002), "#b8432f", matrix=g, bevel=0.003, skip="-z")
    m.cyl(0.01, 0.01, 0.004, (0, 0.02, 0.012), "#c7ccd1", seg=6, mat="steel", matrix=f, rot=(math.pi / 2, 0, 0),
          caps="top")
    peg(-0.47, 1.6 + 0.09)
    # ドライバー立て(横木の穴に差す)とドライバー 2 本
    f = frame(-0.08, 1.5)
    m.box((0.3, 0.025, 0.06), (0, 0, 0.03), "woodDark", matrix=f, skip="-z", vary=0.1)
    for k, (du, hc) in enumerate(((-0.07, "#e0b23c"), (0.07, "#3d6a9a"))):
        m.cyl(0.013, 0.014, 0.1, (du, 0.065, 0.03), hc, seg=6, matrix=f, cap=kit.shade(hc, 1.25))
        m.cyl(0.003, 0.003, 0.13, (du, -0.05, 0.03), "#c7ccd1", seg=6, mat="steel", matrix=f, caps="bottom")
    # のこぎり(歯は刃の下の縁のぎざぎざ)
    f = frame(-0.55, 1.2)
    prof = [(-0.25, 0.04), (0.2, 0.06)]
    prof.append((0.2, -0.06))
    nt = 34
    for k in range(1, nt + 1):
        u = 0.2 - k * (0.45 / nt)
        prof.append((u, -0.06 if k % 2 == 0 else -0.068))
    prof.append((-0.25, -0.055))
    m.prism(list(reversed(prof)) if _area(prof) < 0 else prof, 0.0, (0, 0, 0.004), "#b4bcc4", mat="steel",
            matrix=f, caps="front", vary=0.12)
    handle = [(0.19, 0.075), (0.31, 0.085), (0.33, 0.0), (0.31, -0.075), (0.19, -0.07), (0.2, 0.0)]
    m.prism(handle if _area(handle) > 0 else list(reversed(handle)), 0.02, (0, 0, 0.012), "#7a4a2a", matrix=f,
            side=kit.shade("#7a4a2a", 0.8), caps="front", vary=0.1)
    m.poly([f @ kit.Vector(p) for p in ((0.23, -0.025, 0.0225), (0.29, -0.025, 0.0225), (0.29, 0.03, 0.0225),
                                        (0.23, 0.03, 0.0225))], "#2a1d14", facing=tuple(f.to_3x3() @ kit.Vector((0, 0, 1))))
    peg(-0.55 - 0.27, 1.2)


def _area(pts):
    return sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1]
               for i in range(len(pts))) / 2


# ---------------------------------------------------------------------------


def window(m: Model, rnd):
    pane_w = (WX1 - WX0) / 2
    pane_h = WY1 - WY0
    wy = (WY0 + WY1) / 2
    open_ = 1.25
    fr = "woodDark"
    for hinge_x, ang in ((WX0, open_), (WX1, math.pi - open_)):
        f = kit.xform((hinge_x, wy, Z_OUT), (0, ang, 0))
        fw = 0.05
        for yy in (pane_h / 2 - fw / 2, -pane_h / 2 + fw / 2):
            m.box((pane_w, fw, 0.04), (pane_w / 2, yy, 0), kit.jitter(fr, rnd, 0.1), matrix=f, bevel=0.006,
                  edges="x", vary=0.1)
        for xx in (fw / 2, pane_w - fw / 2):
            m.box((fw, pane_h - 2 * fw, 0.04), (xx, 0, 0), kit.jitter(fr, rnd, 0.1), matrix=f, bevel=0.006,
                  edges="y", skip="+y,-y", vary=0.1)
        m.box((pane_w - 2 * fw, 0.03, 0.03), (pane_w / 2, 0, 0), kit.jitter(fr, rnd, 0.1), matrix=f,
              bevel=0.005, edges="x", vary=0.1)
        # ガラス(両面の板 1 枚)
        gw, gh = pane_w - 0.1, pane_h - 0.1
        pts = [(pane_w / 2 - gw / 2, -gh / 2, 0), (pane_w / 2 + gw / 2, -gh / 2, 0),
               (pane_w / 2 + gw / 2, gh / 2, 0), (pane_w / 2 - gw / 2, gh / 2, 0)]
        m.poly([f @ kit.Vector(p) for p in pts], "glass", mat="glass")
        # 蝶番(黒い鉄の筒)とつまみ(真鍮)
        for yy in (pane_h / 2 - 0.2, -pane_h / 2 + 0.2):
            m.cyl(0.012, 0.012, 0.09, (0, yy, -0.02), "#2f3236", seg=6, mat="steel", matrix=f)
        m.cyl(0.012, 0.016, 0.02, (pane_w - 0.03, 0, 0.03), "brass", seg=8, mat="brass", matrix=f,
              rot=(math.pi / 2, 0, 0), caps="top", cap=kit.shade("brass", 1.3))

    # 窓台の植木鉢とサボテン(手続き生成:(xMin + 0.22, yMin + 0.06, Z_IN + 0.06))
    px, py, pz = WX0 + 0.22, WY0, Z_IN + 0.06
    terra = "rust"
    m.cyl(0.066, 0.055, 0.1, (px, py + 0.05, pz), terra, seg=8, caps="bottom", vary=0.1)
    m.cyl(0.075, 0.07, 0.03, (px, py + 0.11, pz), kit.shade(terra, 1.08), seg=8, bevel=0.004,
          edge=kit.shade(terra, 1.25), caps="none")
    m.cyl(0.068, 0.068, 0.004, (px, py + 0.112, pz), "#3a2a1e", seg=8, caps="top")
    cac = "#5f7f4c"
    m.cyl(0.026, 0.03, 0.15, (px, py + 0.19, pz), cac, seg=7, caps="none", vary=0.12)
    m.cyl(0.008, 0.026, 0.03, (px, py + 0.28, pz), kit.shade(cac, 1.1), seg=7, caps="top")
    for s, h in ((1, 0.05), (-1, 0.09)):
        m.cyl(0.012, 0.012, 0.04, (px + s * 0.035, py + 0.17 + h * 0.3, pz), cac, seg=6, rot=(0, 0, s * math.pi / 2),
              caps="none")
        m.cyl(0.008, 0.012, h, (px + s * 0.055, py + 0.17 + h * 0.3 + h / 2, pz), kit.shade(cac, 1.05), seg=6)
    # 油差し(窓台の右端)
    ox, oz = WX1 - 0.18, Z_IN + 0.05
    m.cyl(0.03, 0.042, 0.05, (ox, py + 0.025, oz), "brass", seg=10, mat="brass", bevel=0.003,
          edge=kit.shade("brass", 1.3), vary=0.1)
    m.cyl(0.005, 0.016, 0.04, (ox, py + 0.07, oz), kit.shade("brass", 0.9), seg=8, mat="brass")
    m.bar((ox, py + 0.085, oz), (ox + 0.09, py + 0.13, oz + 0.03), 0.005, 0.005, kit.shade("brass", 0.85),
          mat="brass")


# ---------------------------------------------------------------------------


def roof(m: Model, rnd):
    zf = ZMID + DEPTH / 2
    zb = ZB - T / 2
    ridge_z = (zf + zb) / 2
    ridge_y = H + 0.95
    eave = 0.35
    base_y = H + 0.14
    slope = (ridge_y - base_y) / (ridge_z - zb)
    xa, xb = X0 - T - 0.3, X1 + T + 0.3
    th = 0.06
    tin = "#5a4a42"
    # 切妻の妻壁(三角、外側の板張り)
    for x, fx in ((X0 - T, -1), (X1 + T, 1)):
        m.poly([(x, base_y, zb), (x, base_y, zf), (x, ridge_y, ridge_z)], "#7d6655", vary=0.12, facing=(fx, 0, 0))
    # 屋根面:トタンの板(縦の継ぎ目ごとに色を変える)
    for side, z_eave in ((-1, zb - eave), (1, zf + eave)):
        y_eave = base_y - eave * slope
        xs = frange(xa, xb, 0.45)
        for i in range(len(xs) - 1):
            col = kit.jitter(tin, rnd, 0.2)
            if rnd() < 0.25:
                col = kit.mix(col, "rust", 0.45)
            p = [(xs[i], ridge_y, ridge_z), (xs[i + 1], ridge_y, ridge_z), (xs[i + 1], y_eave, z_eave),
                 (xs[i], y_eave, z_eave)]
            m.poly(p, col, mat="steel", vary=0.15, facing=(0, 1, side))
        # 軒の裏と鼻先
        m.poly([(xa, y_eave - th, z_eave), (xb, y_eave - th, z_eave), (xb, ridge_y - th, ridge_z),
                (xa, ridge_y - th, ridge_z)], kit.shade(tin, 0.5), mat="steel", facing=(0, -1, -side))
        m.poly([(xa, y_eave, z_eave), (xb, y_eave, z_eave), (xb, y_eave - th, z_eave), (xa, y_eave - th, z_eave)],
               kit.shade(tin, 0.7), mat="steel", facing=(0, 0, side))
        # けらば(両端の切り口)
        for x, fx in ((xa, -1), (xb, 1)):
            m.poly([(x, ridge_y, ridge_z), (x, y_eave, z_eave), (x, y_eave - th, z_eave), (x, ridge_y - th, ridge_z)],
                   kit.shade(tin, 0.6), mat="steel", facing=(fx, 0, 0))
    # 棟の包み板
    m.box((xb - xa + 0.04, 0.05, 0.22), (0, ridge_y + 0.01, ridge_z), kit.shade(tin, 0.8), mat="steel",
          bevel=0.02, edges="x", skip="-y")
