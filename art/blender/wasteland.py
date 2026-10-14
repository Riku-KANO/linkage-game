"""
窓の外の荒野の地面と台地(Wasteland)。ワールド座標。
試走コース・散らばった岩(インスタンス)・風車は手続き生成のまま。

  - 地面:Wasteland.tsx と同じ高さの関数(同じシードの値ノイズ、工房と試走コースの周りは y = −0.03 で平ら)。
    格子ではなく、窓から見える辺りを細かく・遠くを粗くした点をドロネー三角形分割した面。色は高さで塗り分け
  - 台地(メサ):手続き生成と同じ位置・大きさ(同じシード)を、地層の段のある崩れた柱に
  - 岩の群れ(台地のふもとと近く)、枯れ草の株、風車の基礎(コンクリートの台・揚水の管・木の水槽)
"""

import math

from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

import kit
from kit import Model, seeded, value_noise

FILE = "wasteland.glb"

TEST_TRACK = dict(z=-14.0, x_start=-8.0, x_goal=8.0, width=3.2)
ROOM_Z_FRONT = 4.8
FLAT = dict(x_min=-16.0, x_max=16.0, z_min=TEST_TRACK["z"] - 6, z_max=ROOM_Z_FRONT + 3)
WINDMILL = (-6.5, 0.0, -8.5)
WINDMILL_ROT = 0.7

PREVIEWS = [
    ("window", (-1.5, 1.8, -2.8), (-2.6, 1.0, -14.0), 30),
    ("result", (-2.0, 1.55, -18.4), (0.0, 0.6, -10.0), 35),
    ("far", (0.0, 40.0, 60.0), (0.0, 0.0, -40.0), 30),
]

_noise = value_noise(11)


def roughness(x: float, z: float) -> float:
    dx = max(0.0, FLAT["x_min"] - x, x - FLAT["x_max"])
    dz = max(0.0, FLAT["z_min"] - z, z - FLAT["z_max"])
    d = math.hypot(dx, dz)
    return min(1.0, max(0.0, (d - 2) / 30))


def height(x: float, z: float) -> float:
    """Wasteland.tsx の地面と同じ高さ"""
    n = _noise(x / 22, z / 22) * 0.7 + _noise(x / 7 + 50, z / 7) * 0.3
    return -0.03 + (n - 0.35) * 9 * roughness(x, z)


def ground_color(y: float, rnd):
    k = min(1.0, max(0.0, y / 4))
    c = kit.mix("sand", "ochre", min(1.0, k * 1.6))
    c = kit.mix(c, "rust", max(0.0, k - 0.5))
    return kit.shade(c, 0.92 + rnd() * 0.12)


def in_track(x, z, margin=0.0):
    return abs(z - TEST_TRACK["z"]) < TEST_TRACK["width"] / 2 + 0.35 + margin and abs(x) < 11 + margin


def in_house(x, z, margin=0.0):
    return -4.5 - margin < x < 4.5 + margin and -3.6 - margin < z < 5.3 + margin


def build() -> Model:
    m = Model("wasteland")
    m.section("ground")
    ground(m)
    m.section("mesas")
    mesas(m)
    m.section("rocks")
    rocks(m)
    m.section("grass")
    grass(m)
    m.section("windmill")
    windmill_base(m)
    return m


# ---------------------------------------------------------------------------


def ground(m: Model):
    rnd = seeded(5)
    half = 210.0
    focus = (-3.0, -10.0)
    pts = []
    base = 5.0
    n = int(2 * half / base)
    for j in range(n + 1):
        for i in range(n + 1):
            x = -half + i * base
            z = -half + j * base
            jx = (rnd() - 0.5) * base * 0.7
            jz = (rnd() - 0.5) * base * 0.7
            keep = rnd()
            on_edge = i in (0, n) or j in (0, n)
            if on_edge:
                # 外周は粗く、ずらさない
                if (i + j) % 5 == 0:
                    pts.append((x, z))
                continue
            x += jx
            z += jz
            d = math.hypot(x - focus[0], z - focus[1])
            s = base + 0.1 * d
            # 平らな所(工房・試走コースの周り)はさらに少し粗くてよい
            if roughness(x, z) == 0 and abs(z - TEST_TRACK["z"]) > 8:
                s *= 1.25
            if keep < (base / s) ** 2:
                pts.append((x, z))
    for c in ((-half, -half), (half, -half), (half, half), (-half, half)):
        if c not in pts:
            pts.append(c)
    verts2, _, faces, _, _, _ = delaunay_2d_cdt([Vector(p) for p in pts], [], [], 0, 1e-4, False)
    verts = [(v.x, height(v.x, v.y), v.y) for v in verts2]
    cols = []
    crnd = seeded(29)
    for f in faces:
        y = sum(verts[i][1] for i in f) / 3
        cols.append(ground_color(y, crnd))
    m.tri_mesh(verts, faces, cols, "ground", facing=(0, 1, 0))


# ---------------------------------------------------------------------------


def ring(cx, cy, cz, r, seg, rnd, wob, phase=0.0):
    return [
        Vector((cx + r * (1 + (rnd() - 0.5) * wob) * math.sin(phase + i / seg * math.tau), cy,
                cz + r * (1 + (rnd() - 0.5) * wob) * math.cos(phase + i / seg * math.tau)))
        for i in range(seg)
    ]


def column(m: Model, rings, colors, top_color, mat="ground"):
    """輪を下から順に結んだ柱(側面は帯ごとの色、上は蓋)"""
    seg = len(rings[0])
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(seg):
            j = (i + 1) % seg
            m.poly([a[i], a[j], b[j], b[i]], colors[k], mat=mat, vary=0.06,
                   facing=tuple((a[i] + a[j]) / 2 - Vector((sum(p.x for p in a) / seg, a[i].y,
                                                              sum(p.z for p in a) / seg))))
    top = rings[-1]
    m.poly(list(top), top_color, mat=mat, vary=0.05, facing=(0, 1, 0))


def mesas(m: Model):
    mr = seeded(23)  # 手続き生成と同じ列(r, h, 色の順に消費する)
    wr = seeded(61)
    spots = [(-60, -70), (-25, -95), (15, -80), (55, -110), (85, -60), (-95, -40), (-40, -130), (100, 20),
             (-110, 40)]
    for x, z in spots:
        r = 6 + mr() * 9
        h = 7 + mr() * 14
        col = kit.jitter("mesa", mr, 0.15)
        cap_col = kit.jitter(col, mr)
        base_col = kit.jitter("ochre", mr, 0.1)
        # 本体:下から上へ細くなる 7 角の柱を、地層の段(少し引っ込む棚)で 3 つの帯に分ける
        seg = 7
        # 上端は手続き生成と同じ(h − 0.5)。下端は起伏に埋まるまで下げる(浮かないように)
        ground_min = min(height(x + r * 1.5 * math.sin(a), z + r * 1.5 * math.cos(a))
                         for a in (i / 12 * math.tau for i in range(12)))
        y0 = min(-0.5, ground_min - 0.6)
        top_y = h - 0.5
        levels = [0.0, 0.5, 0.53, 1.0]
        rings = []
        for k, t in enumerate(levels):
            rr = r * (1 - 0.18 * t) * (0.96 if k == 2 else 1.0)
            rings.append(ring(x, y0 + (top_y - y0) * t, z, rr, seg, wr, 0.08))
        band_cols = []
        for k in range(len(levels) - 1):
            if k == 1:
                band_cols.append(kit.shade(col, 1.12))  # 棚の上面(明るい)
            else:
                band_cols.append(kit.jitter(kit.mix(col, "ochre", 0.12 * k), wr, 0.08))
        column(m, rings, band_cols, kit.shade(col, 1.08))
        # 上の段(手続き生成:半径 0.55〜0.7 r、高さ 0.35 h、中心を r·0.1 ずらす)
        hh = h * 0.35
        tx = x + r * 0.1
        rings2 = [ring(tx, h - 0.5 + 0.0, z, r * 0.7, 6, wr, 0.1, 0.3),
                  ring(tx, h - 0.5 + hh * 0.5, z, r * 0.62, 6, wr, 0.1, 0.3),
                  ring(tx, h - 0.5 + hh, z, r * 0.55, 6, wr, 0.1, 0.3)]
        column(m, rings2, [cap_col, kit.shade(cap_col, 0.92)], kit.shade(cap_col, 1.1))
        # ふもとの崩れた岩くず(低い 8 角の裾)
        rings3 = [ring(x, y0 - 0.1, z, r * 1.45, 8, wr, 0.12, 0.2),
                  ring(x, max(0.7, ground_min + 1.3), z, r * 1.22, 8, wr, 0.1, 0.2)]
        column(m, rings3, [base_col], kit.shade(base_col, 0.95))


# ---------------------------------------------------------------------------


def rocks(m: Model):
    rnd = seeded(43)
    # 中くらいの距離に岩の群れ(コースと窓の前は避ける)
    clusters = [(-22, -34), (18, -40), (-38, -22), (30, -26), (-12, -52), (6, -28)]
    for cx, cz in clusters:
        n = 2 + int(rnd() * 3)
        for k in range(n):
            x = cx + (rnd() - 0.5) * 5
            z = cz + (rnd() - 0.5) * 5
            s = 0.4 + rnd() ** 2 * 1.3
            y = height(x, z) + s * 0.25
            c = kit.shade("rust", 0.75 + rnd() * 0.35)
            m.ico((x, y, z), (s * (0.9 + rnd() * 0.5), s * (0.55 + rnd() * 0.3), s * (0.9 + rnd() * 0.5)), c,
                  rot=(rnd() * 0.5, rnd() * 6, rnd() * 0.5), mat="ground", rnd=rnd, wobble=0.4, subdiv=1)
    # 工房の裏と風車の周りの小石
    for k in range(7):
        x = -9 + rnd() * 16
        z = -4.5 - rnd() * 5
        if in_house(x, z, 0.3) or in_track(x, z, 1.0) or (-3.6 < x < 0.2 and z > -7):
            continue
        s = 0.1 + rnd() * 0.18
        m.ico((x, -0.03 + s * 0.3, z), (s, s * 0.6, s * 1.1), kit.shade("rust", 0.8 + rnd() * 0.3),
              rot=(0, rnd() * 6, 0), mat="ground", rnd=rnd, wobble=0.3, subdiv=1)


# ---------------------------------------------------------------------------


def grass(m: Model):
    rnd = seeded(71)
    straw = ("#c9a86a", "#b89656", "#d4b77c", "#a88a52")
    placed = 0
    tries = 0
    while placed < 85 and tries < 2000:
        tries += 1
        # 工房とコースの周りに多め、遠くはまばら
        if rnd() < 0.7:
            x = -20 + rnd() * 36
            z = -24 + rnd() * 30
        else:
            x = -45 + rnd() * 80
            z = -60 + rnd() * 50
        if in_track(x, z, 0.2) or in_house(x, z, 0.4):
            continue
        # 窓のすぐ外(カメラが通る)と風車の足元は空ける
        if -3.4 < x < -0.2 and -6.0 < z < -3.0:
            continue
        if math.hypot(x - WINDMILL[0], z - WINDMILL[2]) < 1.6:
            continue
        y = height(x, z)
        blades = 4 + int(rnd() * 4)
        tall = 0.16 + rnd() * 0.22
        base_c = straw[int(rnd() * len(straw))]
        for b in range(blades):
            a = rnd() * math.tau
            lean = 0.25 + rnd() * 0.5
            hgt = tall * (0.6 + rnd() * 0.5)
            w = 0.012 + rnd() * 0.01
            bx = x + math.cos(a) * 0.03
            bz = z + math.sin(a) * 0.03
            tip = (bx + math.cos(a) * lean * hgt, y + hgt, bz + math.sin(a) * lean * hgt)
            px, pz = -math.sin(a) * w, math.cos(a) * w
            c0 = kit.shade(base_c, 0.6)
            c1 = kit.shade(kit.jitter(base_c, rnd, 0.1), 1.1)
            m.poly([(bx - px, y - 0.01, bz - pz), (bx + px, y - 0.01, bz + pz), tip], c0, mat="grass",
                   colors=[c0, c0, c1])
        placed += 1


# ---------------------------------------------------------------------------


def windmill_base(m: Model):
    rnd = seeded(83)
    wx, _, wz = WINDMILL
    rot = kit.euler(0, WINDMILL_ROT, 0)
    concrete = "#a39a8c"
    # 脚の下のコンクリートの台
    for lx, lz in ((-0.9, -0.9), (0.9, -0.9), (0.9, 0.9), (-0.9, 0.9)):
        p = rot @ Vector((lx, 0, lz))
        m.box((0.34, 0.2, 0.34), (wx + p.x, 0.05, wz + p.z), kit.jitter(concrete, rnd, 0.1), rot=(0, WINDMILL_ROT, 0),
              bevel=0.02, edges="+y,y", skip="-y", mat="ground", vary=0.12)
        # 脚を留めるボルト
        for bx, bz in ((-0.1, -0.1), (0.1, 0.1)):
            q = rot @ Vector((lx + bx, 0, lz + bz))
            m.cyl(0.014, 0.014, 0.03, (wx + q.x, 0.16, wz + q.z), "#3d4248", seg=6, mat="steel", caps="top")
    # 揚水の管(塔の中心を下りて、水槽へ曲がる)
    pipe = "#5c6268"
    m.cyl(0.035, 0.035, 1.3, (wx, 0.6, wz), pipe, seg=8, mat="steel", caps="top")
    m.box((0.5, 0.12, 0.5), (wx, 0.06, wz), kit.jitter(concrete, rnd, 0.08), bevel=0.02, edges="+y", skip="-y",
          mat="ground", rot=(0, WINDMILL_ROT, 0))
    # 水槽(木の桶)
    tx, tz = -8.6, -6.9
    r, h = 0.72, 0.85
    seg = 16
    for i in range(seg):
        a0 = i / seg * math.tau
        a1 = (i + 1) / seg * math.tau
        c = kit.jitter("wood", rnd, 0.2)
        p = [(tx + r * math.sin(a0), 0.0, tz + r * math.cos(a0)), (tx + r * math.sin(a1), 0.0, tz + r * math.cos(a1)),
             (tx + r * 0.97 * math.sin(a1), h, tz + r * 0.97 * math.cos(a1)),
             (tx + r * 0.97 * math.sin(a0), h, tz + r * 0.97 * math.cos(a0))]
        m.poly(p, c, vary=0.12, facing=(math.sin((a0 + a1) / 2), 0, math.cos((a0 + a1) / 2)))
        # 縁(板の厚み)と内側
        q = [(tx + r * 0.97 * math.sin(a0), h, tz + r * 0.97 * math.cos(a0)),
             (tx + r * 0.97 * math.sin(a1), h, tz + r * 0.97 * math.cos(a1)),
             (tx + r * 0.9 * math.sin(a1), h, tz + r * 0.9 * math.cos(a1)),
             (tx + r * 0.9 * math.sin(a0), h, tz + r * 0.9 * math.cos(a0))]
        m.poly(q, kit.worn_wood(c), facing=(0, 1, 0))
        inner = [q[3], q[2], (q[2][0], h - 0.12, q[2][2]), (q[3][0], h - 0.12, q[3][2])]
        m.poly(inner, kit.shade(c, 0.6), facing=(-math.sin((a0 + a1) / 2), 0, -math.cos((a0 + a1) / 2)))
    # 水面
    m.poly([(tx + r * 0.9 * math.sin(i / seg * math.tau), h - 0.12, tz + r * 0.9 * math.cos(i / seg * math.tau))
            for i in range(seg)], "#3f5a63", facing=(0, 1, 0))
    # 鉄の箍(たが)2 本
    for yy in (0.18, 0.66):
        m.cyl(r * (1.005 - 0.03 * yy / h) + 0.008, r * (1.005 - 0.03 * yy / h) + 0.008, 0.05, (tx, yy, tz),
              "#3d4248", seg=seg, mat="steel", caps="none")
    # 管から水槽への樋
    m.bar((wx, 1.0, wz), (tx + 0.3, h + 0.12, tz - 0.25), 0.06, 0.06, pipe, mat="steel")
    m.cyl(0.035, 0.035, 0.3, (tx + 0.3, h, tz - 0.25), pipe, seg=8, mat="steel", caps="bottom")
