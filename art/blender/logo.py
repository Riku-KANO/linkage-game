"""
タイトルの看板の板(BootLogo)。原点は LOGO_SIGN.center(奥の壁、窓の右上)、+z が部屋の内側。
ロゴの棒・ピン・クランクは手続き生成(z = 0.045 の前に浮く)なので、板の前面は z = 0.015 に揃える。

  - 濃い色の 3 枚の横板(面取り・木目)と裏の桟
  - 真鍮の縁(上下と左右)、縁の鋲
  - 壁の釘から 2 本の針金で吊る(看板の上の空き)
"""

import kit
from kit import Model, seeded

FILE = "logo.glb"

W = 1.9  # LOGO_SIGN.width
H = 0.5  # LOGO_SIGN.height
T = 0.03  # 板の厚み(前面 z = +0.015)
WALL_Z = -0.03  # 奥の壁の内側の面(LOGO_SIGN.center は壁から 3cm 手前)

# 確認用のカメラ(起動画面 T-00 と同じく正面から少し下)
PREVIEWS = [
    ("front", (0.0, -0.05, 1.85), (0.0, 0.0, 0.0), 40),
    ("side", (1.3, 0.25, 0.9), (0.2, 0.0, 0.0), 35),
]


def build() -> Model:
    m = Model("logo")
    rnd = seeded(101)
    deep = "woodDeep"
    plank = kit.mix("woodDeep", "woodDark", 0.4)

    # 横板 3 枚(すき間 4mm)。前面だけ面取りし、木目の帯を入れる
    n = 3
    gap = 0.004
    ph = (H - gap * (n - 1)) / n
    for i in range(n):
        y = -H / 2 + ph / 2 + i * (ph + gap)
        c = kit.jitter(plank, rnd, 0.18)
        m.box(
            (W - 0.006, ph, T),
            (0, y, 0),
            c,
            bevel=0.004,
            edges="+z",
            edge=kit.worn_wood(kit.shade(c, 1.3)),
            skip="-z",
            grain=("+z", 6, 0.24),
            vary=0.12,
        )
    # すき間から壁が見えないよう、裏に暗い板
    m.box((W - 0.02, H - 0.02, 0.004), (0, 0, -T / 2 + 0.002), kit.shade(deep, 0.6), skip="-z")
    # 裏の桟(横から見える)
    for x in (-0.7, 0.7):
        m.box((0.06, H - 0.04, 0.012), (x, 0, -T / 2 - 0.006), "woodDark", bevel=0.003)

    # 真鍮の縁:上下は手続き生成と同じ寸法(幅 +0.04、高さ 0.025、奥行き 0.04、z +0.005)
    brass = "brass"
    for s in (-1, 1):
        m.box(
            (W + 0.04, 0.025, 0.04),
            (0, s * H / 2, 0.005),
            brass,
            mat="brass",
            bevel=0.004,
            edge=kit.shade(brass, 1.25),
            vary=0.1,
        )
        m.box(
            (0.025, H - 0.025, 0.036),
            (s * (W / 2 + 0.0075), 0, 0.003),
            brass,
            mat="brass",
            bevel=0.004,
            edge=kit.shade(brass, 1.25),
            vary=0.1,
        )
    # 縁の鋲(頭の丸い真鍮の鋲。前面の上下の縁に等間隔)
    for s in (-1, 1):
        for i in range(9):
            x = -W / 2 + 0.06 + i * (W - 0.12) / 8
            m.cyl(
                0.005,
                0.008,
                0.006,
                (x, s * H / 2, 0.028),
                kit.shade(brass, 0.85),
                seg=6,
                rot=(1.5708, 0, 0),
                mat="brass",
                caps="top",
                cap=kit.shade(brass, 1.3),
            )
    # 吊り金具:上の縁のヒートン 2 つ、針金、壁の釘
    nail = (0.0, H / 2 + 0.2, WALL_Z + 0.01)
    for s in (-1, 1):
        eye = (s * 0.62, H / 2 + 0.018, -0.004)
        m.box((0.012, 0.016, 0.004), eye, "metalDark", mat="steel")
        m.bar(
            (eye[0], eye[1] + 0.006, eye[2]),
            (nail[0] + s * 0.008, nail[1] - 0.004, nail[2] + 0.004),
            0.003,
            0.003,
            kit.shade("metal", 0.8),
            mat="steel",
        )
    m.cyl(
        0.004,
        0.004,
        0.03,
        (nail[0], nail[1], nail[2] + 0.005),
        "metalDark",
        seg=6,
        rot=(1.5708, 0, 0),
        mat="steel",
    )
    m.cyl(
        0.009,
        0.009,
        0.004,
        (nail[0], nail[1], nail[2] + 0.02),
        kit.shade("metal", 0.7),
        seg=8,
        rot=(1.5708, 0, 0),
        mat="steel",
    )
    return m
