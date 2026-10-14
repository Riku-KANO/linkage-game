"""
工具箱の本体(Toolbox)。原点は TOOLBOX.center の床、+z が前(局所座標。親の group が回す)。
上段のトレイ・平行リンク・床のスパナは手続き生成のまま(動く部品)。

  - 赤く塗った鋼板の箱(上は開いていて、トレイを開くと中が見える)。角は塗装がはげて鋼が見える
  - 折り返した縁、下の黒い台、両側の取っ手、リンクの軸(リベット)、前面の真鍮の銘板
  - 中身:仕切り、ボルト・ナットの山、ドライバー 2 本、金づち
"""

import math

import kit
from kit import Model, seeded

FILE = "toolbox.glb"

BW = 0.52
BH = 0.2
BD = 0.26
PIVOT_Y = BH - 0.035
PIVOT_Z = 0.035

PREVIEWS = [
    ("top", (0.45, 0.75, 0.6), (0.0, 0.1, 0.0), 40),
    ("front", (0.9, 0.35, 0.9), (0.0, 0.1, 0.0), 35),
]


def build() -> Model:
    m = Model("toolbox")
    rnd = seeded(5)
    red = "red"
    red_in = kit.shade(red, 0.55)
    worn = kit.worn_paint(red, "#9aa2aa", 0.55)
    steel = "metal"
    dark = "metalDark"

    # 下の黒い台(手続き生成の base と同じ寸法)
    m.box((BW + 0.01, 0.02, BD + 0.01), (0, 0.01, 0), dark, mat="steel", bevel=0.004,
          edge=kit.shade(dark, 1.4), skip="-y")
    # 外板:縦の角を丸め(面取り)、上下は開ける
    wall_h = 0.17
    m.box((BW, wall_h, BD), (0, 0.02 + wall_h / 2, 0), red, mat="steel", bevel=0.012, edges="y",
          edge=worn, skip="+y,-y", vary=0.06)
    # 内壁(裏返した箱)。中は深い箱ではなく中敷き(y = 0.11)にして、トレイを開いたときに中身が見えるようにする
    floor = 0.11
    in_h = BH - 0.004 - floor
    m.box((BW - 0.012, in_h, BD - 0.012), (0, floor + in_h / 2, 0), red_in, mat="steel",
          skip="+y", flip=True, faces={"+y": kit.shade(red, 0.42)}, vary=0.12)
    # 折り返した縁(手続き生成の lid rim:幅 +0.01、高さ 0.015、y 0.19)
    rim = "#8e3022"
    rw, rd, rt = BW + 0.01, BD + 0.01, 0.014
    for s in (-1, 1):
        m.box((rw, 0.015, rt), (0, BH - 0.0075, s * (rd / 2 - rt / 2)), rim, mat="steel",
              bevel=0.004, edge=kit.worn_paint(rim, "#aab0b6", 0.6))
        m.box((rt, 0.015, rd - 2 * rt), (s * (rw / 2 - rt / 2), BH - 0.0075, 0), rim, mat="steel",
              bevel=0.004, edge=kit.worn_paint(rim, "#aab0b6", 0.6))

    # 両側の取っ手(手続き生成:x = ±(BW/2 + 0.03)、y = 0.14、長さ 0.12 の握り)
    for s in (-1, 1):
        x = s * (BW / 2 + 0.03)
        for z in (-0.055, 0.055):
            m.box((0.03, 0.026, 0.012), (s * (BW / 2 + 0.014), BH * 0.7, z), dark, mat="steel",
                  skip="-x" if s > 0 else "+x")
        m.cyl(0.01, 0.01, 0.124, (x, BH * 0.7, 0), dark, seg=8, rot=(math.pi / 2, 0, 0),
              mat="steel", bevel=0.002, edge=kit.shade(dark, 1.5))
        # 平行リンクの軸(トレイのリンクの付け根)
        for pz in (PIVOT_Z, PIVOT_Z + 0.06, -PIVOT_Z, -PIVOT_Z - 0.06):
            m.cyl(0.009, 0.009, 0.006, (s * (BW / 2 + 0.002), PIVOT_Y, pz), kit.shade(steel, 1.1),
                  seg=6, rot=(0, 0, -s * math.pi / 2), mat="steel", caps="top",
                  cap=kit.shade(steel, 1.3))

    # 前面の真鍮の銘板と鋲
    m.box((0.1, 0.034, 0.003), (0, 0.06, BD / 2 + 0.0015), "brass", mat="brass", skip="-z",
          faces={"+y": kit.shade("brass", 1.3), "-y": kit.shade("brass", 0.7)})
    for x in (-0.042, 0.042):
        m.cyl(0.003, 0.003, 0.003, (x, 0.06, BD / 2 + 0.004), kit.shade("brass", 0.8), seg=6,
              rot=(math.pi / 2, 0, 0), mat="brass", caps="top")
    # 銘板の刻線(暗い線 2 本)
    for y in (0.066, 0.054):
        m.box((0.07, 0.003, 0.001), (0, y, BD / 2 + 0.0034), kit.shade("brass", 0.45), mat="brass",
              skip="-z")

    # --- 中身(中敷きの上)---
    # 低い仕切り:奥にボルト・ナット、手前に長い工具
    dz = -0.012
    m.box((BW - 0.014, 0.026, 0.004), (0, floor + 0.013, dz), kit.shade(red, 0.75), mat="steel",
          faces={"+y": worn})
    # ボルト・ナットの山(奥の区画:z ∈ [−BD/2, dz])
    z0, z1 = -BD / 2 + 0.022, dz - 0.012
    x0, x1 = -BW / 2 + 0.03, BW / 2 - 0.03
    for i in range(9):
        x = x0 + rnd() * (x1 - x0)
        z = z0 + rnd() * (z1 - z0)
        yaw = rnd() * math.pi * 2
        r = 0.0035 + rnd() * 0.0025
        ln = 0.025 + rnd() * 0.035
        c = kit.jitter(steel, rnd, 0.25) if rnd() < 0.7 else kit.mix("brass", steel, 0.3)
        y = floor + r * 1.7 + rnd() * 0.012
        m.bolt((x, y, z), ln, r, c, rot=(0, yaw, math.pi / 2 + (rnd() - 0.5) * 0.3))
    for i in range(7):
        x = x0 + rnd() * (x1 - x0)
        z = z0 + rnd() * (z1 - z0)
        r = 0.006 + rnd() * 0.004
        tilt = (rnd() - 0.5) * 0.8
        m.nut((x, floor + 0.004 + rnd() * 0.01, z), r, r * 0.8, kit.jitter(steel, rnd, 0.2),
              rot=(tilt, rnd() * math.pi, 0))
    # ワッシャー(平たい輪の代わりに薄い円板)
    for i in range(3):
        x = x0 + rnd() * (x1 - x0)
        z = z0 + rnd() * (z1 - z0)
        m.cyl(0.008, 0.008, 0.0015, (x, floor + 0.002 + rnd() * 0.008, z),
              kit.shade(steel, 1.2), seg=8, mat="steel", caps="top", cap=kit.shade(steel, 1.25),
              rot=((rnd() - 0.5) * 0.4, 0, (rnd() - 0.5) * 0.4))

    # 手前の区画:ドライバー 2 本とスパナ(x 方向に寝かせる)
    for k, (hc, zz, xx) in enumerate((("#e0b23c", 0.016, -0.05), ("#3d6a9a", 0.046, 0.06))):
        y = floor + 0.012 + k * 0.004
        frame = kit.xform((xx, y, zz), (0, (rnd() - 0.5) * 0.12, math.pi / 2))
        # 柄(6 角)・口金・軸・先
        m.cyl(0.011, 0.012, 0.085, (0, 0.06, 0), hc, seg=6, mat="wood", matrix=frame,
              cap=kit.shade(hc, 0.8), edge=kit.shade(hc, 1.2), bevel=0.002)
        m.cyl(0.007, 0.007, 0.012, (0, 0.012, 0), kit.shade(steel, 1.2), seg=8, mat="steel",
              matrix=frame)
        m.cyl(0.003, 0.003, 0.1, (0, -0.044, 0), kit.shade(steel, 1.1), seg=6, mat="steel",
              matrix=frame, caps="none")
        m.box((0.002, 0.012, 0.006), (0, -0.098, 0), kit.shade(steel, 0.9), mat="steel",
              matrix=frame)
    # スパナ(両口):平たい棒と両端の口
    frame = kit.xform((0.0, floor + 0.003, 0.085), (0, 0.04, 0))
    sp = kit.shade(steel, 1.15)
    m.box((0.15, 0.004, 0.013), (0, 0, 0), sp, mat="steel", matrix=frame, skip="-y")
    for s, w in ((-1, 0.03), (1, 0.024)):
        x = s * 0.085
        m.box((0.02, 0.005, w), (x, 0, 0), sp, mat="steel", matrix=frame, skip="-y")
        m.box((0.012, 0.0052, w * 0.4), (x + s * 0.005, 0, 0), kit.shade(steel, 0.3),
              mat="steel", matrix=frame, skip="-y")
    return m
