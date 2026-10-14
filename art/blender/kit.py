"""
アシクミ 工房素材のキット(Blender 5.2 LTS、ヘッドレスの Python)。

- 座標は three.js と同じ(m、+x 右、+y 上、+z 手前)で組み、Blender に渡すときだけ Z 上へ変換する。
  glTF の書き出し(+Y 上)で元の three.js 座標に戻る。
- 部品は「素材ごと」に 1 つのメッシュへまとめる(描画呼び出しを減らす)。色は頂点色(面の角ごと)。
- 乱数は src/scene/env/geometry.ts と同じ mulberry32(同じシードなら同じ列)。
- 座標は 0.01 mm、色は 1e-4 に丸めてから Blender に渡す(浮動小数点の端数で出力が揺れないように)。
"""

from __future__ import annotations

import colorsys
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

# ---------------------------------------------------------------------------
# 乱数(geometry.ts の seeded と同じ列を返す)
# ---------------------------------------------------------------------------

_M32 = 0xFFFFFFFF


def seeded(seed: int):
    """mulberry32。0..1 の一様乱数を返す関数"""
    a = seed & _M32

    def rnd() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & _M32
        t = a
        t = ((t ^ (t >> 15)) * (t | 1)) & _M32
        t = (t ^ ((t + (((t ^ (t >> 7)) * (t | 61)) & _M32)) & _M32)) & _M32
        return ((t ^ (t >> 14)) & _M32) / 4294967296

    return rnd


def value_noise(seed: int, n: int = 64):
    """格子の値ノイズ(Wasteland.tsx の valueNoise と同じ)"""
    rnd = seeded(seed)
    grid = [rnd() for _ in range(n * n)]

    def at(i: int, j: int) -> float:
        return grid[(i % n) * n + (j % n)]

    def noise(x: float, y: float) -> float:
        i = math.floor(x)
        j = math.floor(y)
        fx = x - i
        fy = y - j
        sx = fx * fx * (3 - 2 * fx)
        sy = fy * fy * (3 - 2 * fy)
        a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx
        b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx
        return a + (b - a) * sy

    return noise


# ---------------------------------------------------------------------------
# 色(sRGB の 0..1 で扱い、頂点に書くときに線形へ変換する)
# ---------------------------------------------------------------------------

PALETTE = {
    "woodLight": "#b07d52",
    "wood": "#8a5a3b",
    "woodDark": "#5b3a26",
    "woodDeep": "#3e271a",
    "plaster": "#b59a7e",
    "plasterDark": "#9c8068",
    "floor": "#6e4a33",
    "metal": "#8a939c",
    "metalDark": "#3d4248",
    "red": "#b8432f",
    "brass": "#c9a24a",
    "paper": "#efe6d2",
    "sand": "#c98f5a",
    "ochre": "#b7773f",
    "rust": "#9b5a3c",
    "mesa": "#a8613f",
    "ink": "#2b2118",
    "glass": "#a9c8d8",
    "green": "#6f8f5a",
    "blue": "#4f6f9a",
}


def hexc(h: str) -> tuple[float, float, float]:
    """'#rrggbb'(または PALETTE の名前)→ sRGB 0..1"""
    h = PALETTE.get(h, h).lstrip("#")
    return (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255)


def col(c) -> tuple[float, float, float]:
    """色の指定(16 進文字列・PALETTE 名・sRGB タプル)を sRGB タプルに"""
    return hexc(c) if isinstance(c, str) else (float(c[0]), float(c[1]), float(c[2]))


def _lin1(c: float) -> float:
    c = min(1.0, max(0.0, c))
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def linear(c) -> tuple[float, float, float]:
    s = col(c)
    return (_lin1(s[0]), _lin1(s[1]), _lin1(s[2]))


def mix(a, b, t: float):
    a, b = col(a), col(b)
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def shade(c, k: float):
    """明るさを k 倍(sRGB のまま)"""
    c = col(c)
    return tuple(min(1.0, x * k) for x in c)


def jitter(c, rnd, amount: float = 0.06):
    """色を少しばらつかせる(geometry.ts の jitterColor と同じ考え方:色相を少し、明るさを ±amount)"""
    r, g, b = col(c)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    h = (h + (rnd() - 0.5) * amount * 0.3) % 1.0
    l = min(1.0, max(0.0, l * (1 + (rnd() - 0.5) * amount * 2)))
    return colorsys.hls_to_rgb(h, l, s)


def worn_wood(c):
    """木の角:擦れて少し明るく、色が浅くなる"""
    r, g, b = col(c)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return colorsys.hls_to_rgb(h, min(1.0, l * 1.22 + 0.02), s * 0.82)


def worn_paint(c, metal="#8a939c", k: float = 0.45):
    """塗装の角:塗料がはげて下の鋼が少し見える"""
    return mix(c, metal, k)


# ---------------------------------------------------------------------------
# 行列(three.js の座標・Euler XYZ と同じ意味)
# ---------------------------------------------------------------------------


def euler(rx: float = 0.0, ry: float = 0.0, rz: float = 0.0) -> Matrix:
    """three.js の Euler(順序 XYZ)と同じ回転行列 = Rx · Ry · Rz"""
    return (
        Matrix.Rotation(rx, 4, "X") @ Matrix.Rotation(ry, 4, "Y") @ Matrix.Rotation(rz, 4, "Z")
    )


def xform(pos=(0, 0, 0), rot=None, mat: Matrix | None = None) -> Matrix:
    """局所の位置・回転(three.js の Euler XYZ)。mat があればその座標系の中に置く(mat · T · R)"""
    m = Matrix.Translation(Vector(pos))
    if rot is not None:
        m = m @ euler(*rot)
    if mat is not None:
        m = mat @ m
    return m


def rot_between(a, b) -> Matrix:
    """a 方向を b 方向へ回す最小の回転(three.js の setFromUnitVectors と同じ)"""
    q = Vector(a).normalized().rotation_difference(Vector(b).normalized())
    return q.to_matrix().to_4x4()


# ---------------------------------------------------------------------------
# 素材(glTF の metallic/roughness。色は頂点色で、ベースカラー係数は 1)
# ---------------------------------------------------------------------------

#: 素材の定義:名前 → (roughness, metallic, alpha, 両面)
MATERIALS = {
    # 木・漆喰・布・土など(手続き生成の vcMatte:roughness 0.85、metalness 0.02 に合わせる)
    "wood": (0.82, 0.0, 1.0, False),
    # 紙・本の小口(さらにつや消し)
    "paper": (0.93, 0.0, 1.0, False),
    # 塗装した鉄・黒い鉄(vcMetal:0.5 / 0.3)
    "steel": (0.5, 0.3, 1.0, False),
    # 真鍮(brass:0.45 / 0.35。環境マップがないので金属度は控えめ)
    "brass": (0.4, 0.4, 1.0, False),
    # 窓・瓶のガラス(手続き生成の glass:不透明度 0.18)
    "glass": (0.05, 0.1, 0.18, True),
    # 枯れ草(薄い板なので両面)
    "grass": (0.9, 0.0, 1.0, True),
    # 地面(受ける影だけ。木と同じ設定だが別メッシュにして大きさを分ける)
    "ground": (0.9, 0.0, 1.0, False),
}


def _material(name: str) -> bpy.types.Material:
    rough, metal, alpha, double = MATERIALS[name]
    m = bpy.data.materials.new(name)
    m.use_backface_culling = not double  # glTF の doubleSided はこれで決まる
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Alpha"].default_value = alpha
    if alpha < 1.0:
        m.surface_render_method = "BLENDED"
    return m


# ---------------------------------------------------------------------------
# 組み立て
# ---------------------------------------------------------------------------


def _r5(x: float) -> float:
    v = round(x, 5)
    return 0.0 if v == 0 else v  # -0.0 を 0.0 に


def _r4(x: float) -> float:
    v = round(x, 4)
    return 0.0 if v == 0 else v


class _Acc:
    def __init__(self):
        self.verts: list[tuple[float, float, float]] = []
        self.faces: list[tuple[int, ...]] = []
        self.cols: list[tuple[float, float, float]] = []  # 面の角ごと(faces の順)


def _newell(pts) -> Vector:
    """多角形の法線(Newell の方法、正規化しない)"""
    n = Vector((0.0, 0.0, 0.0))
    k = len(pts)
    for i in range(k):
        a, b = Vector(pts[i]), Vector(pts[(i + 1) % k])
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n


def _dir_key(n: Vector) -> str:
    ax = max(range(3), key=lambda i: abs(n[i]))
    return ("+" if n[ax] >= 0 else "-") + "xyz"[ax]


class Model:
    """
    1 つの GLB。素材ごとに頂点・面・角の色をためる。
    部品は同じ座標系(Room・Wasteland・Workbench はワールド、他は部品の局所)で置き、
    origin を指定すると GLB の節点がその位置に平行移動し、頂点は origin からの相対になる。
    """

    def __init__(self, name: str, origin=(0.0, 0.0, 0.0)):
        self.name = name
        self.origin = tuple(origin)
        self.acc: dict[str, _Acc] = {}
        self._vary = seeded(len(name) * 7919 + sum(map(ord, name)))

    # -- 低レベル -----------------------------------------------------------

    def _a(self, mat: str) -> _Acc:
        if mat not in MATERIALS:
            raise KeyError(f"unknown material {mat}")
        if mat not in self.acc:
            self.acc[mat] = _Acc()
        return self.acc[mat]

    def _corner(self, c, vary: float):
        c = col(c)
        if vary > 0:
            k = 1 + (self._vary() - 0.5) * vary
            c = (c[0] * k, c[1] * k, c[2] * k)
        lc = linear(c)
        return (_r4(lc[0]), _r4(lc[1]), _r4(lc[2]))

    def add_bmesh(self, bm: bmesh.types.BMesh, mat: str, color_of, vary: float = 0.0):
        """一時的な bmesh を素材のメッシュへ足す。color_of(face) → 色(または角ごとの色のリスト)"""
        a = self._a(mat)
        bm.verts.index_update()
        base = len(a.verts)
        for v in bm.verts:
            a.verts.append((_r5(v.co.x), _r5(v.co.y), _r5(v.co.z)))
        for f in bm.faces:
            a.faces.append(tuple(base + lp.vert.index for lp in f.loops))
            c = color_of(f)
            if isinstance(c, list):
                for ci in c:
                    a.cols.append(self._corner(ci, vary))
            else:
                for _ in f.loops:
                    a.cols.append(self._corner(c, vary))
        bm.free()

    def poly(self, pts, color, mat: str = "wood", vary: float = 0.0, colors=None, facing=None):
        """1 枚の多角形(点は反時計回りが表)。colors で角ごとの色。facing を渡すとその向きに表を揃える"""
        if facing is not None and _newell(pts).dot(Vector(facing)) < 0:
            pts = list(reversed(pts))
            if colors:
                colors = list(reversed(colors))
        a = self._a(mat)
        base = len(a.verts)
        for p in pts:
            a.verts.append((_r5(p[0]), _r5(p[1]), _r5(p[2])))
        a.faces.append(tuple(range(base, base + len(pts))))
        for i in range(len(pts)):
            a.cols.append(self._corner(colors[i] if colors else color, vary))

    def tri_mesh(self, verts, faces, face_colors, mat: str, vary: float = 0.0, facing=None):
        """
        頂点を共有する任意のメッシュ(地形・壁の格子など)。face_colors は面ごと(または角ごとのリスト)。
        facing を渡すと各面の表をその向きに揃える(角ごとの色も一緒に並べ替える)
        """
        a = self._a(mat)
        base = len(a.verts)
        for p in verts:
            a.verts.append((_r5(p[0]), _r5(p[1]), _r5(p[2])))
        for f, c in zip(faces, face_colors):
            if facing is not None and _newell([verts[i] for i in f]).dot(Vector(facing)) < 0:
                f = list(reversed(f))
                if isinstance(c, list):
                    c = list(reversed(c))
            a.faces.append(tuple(base + i for i in f))
            if isinstance(c, list):
                for ci in c:
                    a.cols.append(self._corner(ci, vary))
            else:
                for _ in f:
                    a.cols.append(self._corner(c, vary))

    def panel(self, origin, u, v, us, vs, color_fn, facing, mat: str = "wood", skip_fn=None):
        """
        平らな面を格子に分けた板(壁の漆喰のむらなど)。点 = origin + u·s + v·t(s ∈ us、t ∈ vs)。
        色は頂点ごと(color_fn(点))なので、glTF では頂点を共有できて軽い。skip_fn(中心) が真のマスは抜く
        """
        o, u, v = Vector(origin), Vector(u), Vector(v)
        verts = []
        cols = []
        for t in vs:
            for s in us:
                p = o + u * s + v * t
                verts.append((p.x, p.y, p.z))
                cols.append(color_fn(p))
        nu = len(us)
        faces, fcols = [], []
        for j in range(len(vs) - 1):
            for i in range(nu - 1):
                c = o + u * ((us[i] + us[i + 1]) / 2) + v * ((vs[j] + vs[j + 1]) / 2)
                if skip_fn is not None and skip_fn(c):
                    continue
                f = [j * nu + i, j * nu + i + 1, (j + 1) * nu + i + 1, (j + 1) * nu + i]
                faces.append(f)
                fcols.append([cols[k] for k in f])
        self.tri_mesh(verts, faces, fcols, mat, facing=facing)

    # -- 部品 ---------------------------------------------------------------

    def box(
        self,
        size,
        pos,
        color,
        rot=None,
        mat: str = "wood",
        bevel: float = 0.0,
        edges: str = "all",
        edge=None,
        skip: str = "",
        faces: dict | None = None,
        vary: float = 0.0,
        matrix: Matrix | None = None,
        grain: tuple | None = None,
        flip: bool = False,
    ):
        """
        直方体(中心・寸法)。bevel で角を面取りし、面取りの面は edge の色(既定は擦れた木の色)。
        edges:面取りする辺 'all' | 'x' 'y' 'z'(その軸に平行な辺) | '+y' など(その面の辺)を , 区切りで。
        skip:消す面('-y,+z' など。見えない面を省いて軽くする)。faces:面ごとの色 {'+y': 色}。
        grain=('+y', 本数, ばらつき):その面を木目の帯に分ける。flip:面を裏返す(内壁)。
        """
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
        bm.normal_update()
        tag = bm.faces.layers.int.new("tag")
        for f in bm.faces:
            f[tag] = 0
        if bevel > 0:
            sel = []
            keys = [k.strip() for k in edges.split(",") if k.strip()]
            for e in bm.edges:
                d = e.verts[1].co - e.verts[0].co
                ax = max(range(3), key=lambda i: abs(d[i]))
                ok = False
                for k in keys:
                    if k == "all" or k == "xyz"[ax] and len(k) == 1:
                        ok = True
                    elif len(k) == 2 and any(_dir_key(f.normal) == k for f in e.link_faces):
                        ok = True
                if ok:
                    sel.append(e)
            res = bmesh.ops.bevel(
                bm,
                geom=sel,
                offset=bevel,
                offset_type="OFFSET",
                segments=1,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
            for f in res["faces"]:
                f[tag] = 1
        bm.normal_update()
        drop = {k.strip() for k in skip.split(",") if k.strip()}
        strips = []
        if grain is not None:
            # 木目:その面を長手方向の細い帯に分け、帯ごとに色を少し変える
            gkey, gn, gamt = grain
            drop.add(gkey)
            gf = next((f for f in bm.faces if f[tag] == 0 and _dir_key(f.normal) == gkey), None)
            if gf is not None and len(gf.verts) == 4:
                q = [lp.vert.co.copy() for lp in gf.loops]
                u, v = q[1] - q[0], q[3] - q[0]
                # 帯は長い辺に沿って並べ、短い辺の方向に分ける
                if u.length < v.length:
                    q = [q[1], q[2], q[3], q[0]]
                    u, v = q[1] - q[0], q[3] - q[0]
                cuts = [0.0]
                for i in range(gn - 1):
                    cuts.append((i + 1 + (self._vary() - 0.5) * 0.6) / gn)
                cuts.append(1.0)
                for i in range(gn):
                    a0, a1 = cuts[i], cuts[i + 1]
                    strips.append(
                        (
                            [q[0] + v * a0, q[0] + u + v * a0, q[0] + u + v * a1, q[0] + v * a1],
                            jitter(color, self._vary, gamt),
                        )
                    )
        if drop:
            kill = [f for f in bm.faces if f[tag] == 0 and _dir_key(f.normal) in drop]
            bmesh.ops.delete(bm, geom=kill, context="FACES_ONLY")
        if flip:
            # 内側を表にする(箱の内壁など)
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
        m = xform(pos, rot, matrix)
        for pts, c in strips:
            self.poly([m @ p for p in pts], c, mat, vary)
        bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
        ecol = edge if edge is not None else worn_wood(color)
        fmap = faces or {}
        # 面の向きは変換前の軸で決めたいので、回転を戻して判定する
        inv = m.to_3x3().inverted()

        def color_of(f):
            if f[tag] == 1:
                return ecol
            k = _dir_key(inv @ f.normal)
            return fmap.get(k, color)

        bm.normal_update()
        self.add_bmesh(bm, mat, color_of, vary)

    def cyl(
        self,
        r_top: float,
        r_bot: float,
        h: float,
        pos,
        color,
        seg: int = 8,
        rot=None,
        mat: str = "wood",
        caps: str = "both",
        cap=None,
        bevel: float = 0.0,
        edge=None,
        vary: float = 0.0,
        matrix: Matrix | None = None,
        phase: float = 0.0,
        flip: bool = False,
    ):
        """円柱(軸は y、three.js の CylinderGeometry と同じ引数順)。cap は上下の面の色。flip で内側を表に"""
        bm = bmesh.new()
        bmesh.ops.create_cone(
            bm,
            cap_ends=caps != "none",
            cap_tris=False,
            segments=seg,
            radius1=r_bot,
            radius2=r_top,
            depth=h,
            # 最初の頂点を +z に置く(three.js の CylinderGeometry と同じ角の向き)。phase でさらに回す
            matrix=Matrix.Rotation(-math.pi / 2, 4, "X") @ Matrix.Rotation(phase - math.pi / 2, 4, "Z"),
        )
        tag = bm.faces.layers.int.new("tag")
        bm.normal_update()
        for f in bm.faces:
            f[tag] = 2 if abs(f.normal.y) > 0.999 and len(f.verts) == seg else 0
        if caps in ("top", "bottom"):
            want = 1 if caps == "bottom" else -1  # 消す側
            kill = [f for f in bm.faces if f[tag] == 2 and f.normal.y * want > 0]
            bmesh.ops.delete(bm, geom=kill, context="FACES_ONLY")
        if bevel > 0:
            sel = [e for e in bm.edges if any(f[tag] == 2 for f in e.link_faces)]
            res = bmesh.ops.bevel(
                bm,
                geom=sel,
                offset=bevel,
                offset_type="OFFSET",
                segments=1,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
            for f in res["faces"]:
                f[tag] = 1
        if flip:
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
        m = xform(pos, rot, matrix)
        bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
        ecol = edge if edge is not None else color
        ccol = cap if cap is not None else color

        def color_of(f):
            t = f[tag]
            return ecol if t == 1 else ccol if t == 2 else color

        self.add_bmesh(bm, mat, color_of, vary)

    def prism(
        self,
        profile,
        depth: float,
        pos,
        color,
        rot=None,
        mat: str = "wood",
        side=None,
        back=None,
        caps: str = "both",
        vary: float = 0.0,
        matrix: Matrix | None = None,
    ):
        """
        平面の輪郭(局所 xy、反時計回り)を z 方向へ厚み depth で押し出した板。
        表(+z)は color、側面は side、裏(−z)は back の色。caps='front' で裏を省く。
        """
        m = xform(pos, rot, matrix)
        n = len(profile)
        hz = depth / 2
        front = [m @ Vector((p[0], p[1], hz)) for p in profile]
        rear = [m @ Vector((p[0], p[1], -hz)) for p in profile]
        sc = side if side is not None else color
        if caps in ("both", "front"):
            self.poly(front, color, mat, vary)
        if caps in ("both", "back"):
            self.poly(list(reversed(rear)), back if back is not None else color, mat, vary)
        if depth > 0:
            for i in range(n):
                j = (i + 1) % n
                self.poly([rear[i], rear[j], front[j], front[i]], sc, mat, vary)

    def bar(self, a, b, w: float, t: float, color, mat: str = "wood", bevel: float = 0.0, **kw):
        """2 点を結ぶ角棒(長手は a→b、太さ w は局所 y、厚み t は局所 z)"""
        a, b = Vector(a), Vector(b)
        d = b - a
        r = rot_between((1, 0, 0), d)
        self.box(
            (d.length, w, t), (0, 0, 0), color, mat=mat, bevel=bevel,
            matrix=Matrix.Translation((a + b) / 2) @ r, **kw,
        )

    def ico(self, pos, scale, color, rot=None, mat: str = "wood", rnd=None, wobble: float = 0.0,
            subdiv: int = 1, vary: float = 0.0, matrix: Matrix | None = None):
        """岩などの多面体(正二十面体を伸縮・頂点を揺らす)"""
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
        if rnd is not None and wobble > 0:
            for v in bm.verts:
                k = 1 + (rnd() - 0.5) * wobble
                v.co *= k
        bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
        m = xform(pos, rot, matrix)
        bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
        if callable(color):
            bm.normal_update()
            self.add_bmesh(bm, mat, color, vary)
        else:
            self.add_bmesh(bm, mat, lambda f: color, vary)

    def nut(self, pos, r: float, h: float, color, rot=None, mat: str = "steel", hole=None,
            matrix: Matrix | None = None):
        """六角ナット(軸は y)。上面は穴の周りの輪、穴は暗い六角形。下面は省く"""
        m = xform(pos, rot, matrix)
        out = [Vector((r * math.cos(a), 0, -r * math.sin(a))) for a in
               (i * math.pi / 3 + math.pi / 6 for i in range(6))]
        inn = [p * 0.5 for p in out]
        up = Vector((0, h / 2, 0))
        dn = Vector((0, -h / 2, 0))
        hc = hole if hole is not None else shade(color, 0.35)
        for i in range(6):
            j = (i + 1) % 6
            self.poly([m @ (out[i] + up), m @ (out[j] + up), m @ (inn[j] + up), m @ (inn[i] + up)],
                      color, mat)
            self.poly([m @ (out[i] + dn), m @ (out[j] + dn), m @ (out[j] + up), m @ (out[i] + up)],
                      shade(color, 0.85), mat)
        self.poly([m @ (p + up * 0.6) for p in inn], hc, mat)

    def bolt(self, pos, length: float, r: float, color, rot=None, mat: str = "steel"):
        """六角ボルト(頭が原点、軸は −y 方向へ length)"""
        m = xform(pos, rot)
        hh = r * 0.7
        self.cyl(r * 1.7, r * 1.7, hh, (0, hh / 2, 0), shade(color, 1.05), seg=6, mat=mat,
                 matrix=m, cap=shade(color, 1.2), phase=math.pi / 6)
        self.cyl(r, r, length, (0, -length / 2, 0), shade(color, 0.9), seg=6, mat=mat,
                 matrix=m, caps="bottom")

    # -- 書き出し -----------------------------------------------------------

    def section(self, name: str):
        """以降の部品をこの名前で数える(重さの内訳を見るため)"""
        self._sections = getattr(self, "_sections", [])
        self._sections.append((name, sum(len(a.cols) for a in self.acc.values())))

    def breakdown(self) -> list[tuple[str, int]]:
        secs = getattr(self, "_sections", [])
        total = sum(len(a.cols) for a in self.acc.values())
        out = []
        for i, (name, start) in enumerate(secs):
            end = secs[i + 1][1] if i + 1 < len(secs) else total
            out.append((name, end - start))
        return out

    def stats(self) -> dict:
        return {
            k: {"verts": len(a.verts), "faces": len(a.faces), "corners": len(a.cols)}
            for k, a in sorted(self.acc.items())
        }

    def build_objects(self) -> list[bpy.types.Object]:
        """素材ごとに 1 つのオブジェクトを作る(名前順。出力の順序を固定する)"""
        objs = []
        ox, oy, oz = self.origin
        for mat_name in sorted(self.acc):
            a = self.acc[mat_name]
            if not a.faces:
                continue
            me = bpy.data.meshes.new(f"{self.name}_{mat_name}")
            # 頂点は origin からの相対にし(節点の平行移動が origin)、three.js (x, y, z) → Blender (x, −z, y)
            me.from_pydata(
                [(_r5(x - ox), _r5(-(z - oz)), _r5(y - oy)) for (x, y, z) in a.verts], [], a.faces
            )
            attr = me.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
            flat = []
            for c in a.cols:
                flat.extend((c[0], c[1], c[2], 1.0))
            attr.data.foreach_set("color", flat)
            me.color_attributes.active_color = attr
            me.color_attributes.render_color_index = 0
            me.polygons.foreach_set("use_smooth", [False] * len(me.polygons))
            me.update()
            me.materials.append(_material(mat_name))
            ob = bpy.data.objects.new(f"{self.name}_{mat_name}", me)
            ob.location = (ox, -oz, oy)
            bpy.context.scene.collection.objects.link(ob)
            objs.append(ob)
        return objs

    def export(self, path: str):
        self.build_objects()
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=path,
            check_existing=False,
            export_format="GLB",
            export_copyright="",
            export_yup=True,
            export_apply=True,
            export_texcoords=False,
            export_normals=True,
            export_tangents=False,
            export_materials="EXPORT",
            export_vertex_color="MATERIAL",
            export_all_vertex_colors=False,
            export_active_vertex_color_when_no_material=False,
            export_attributes=False,
            use_mesh_edges=False,
            use_mesh_vertices=False,
            export_cameras=False,
            export_lights=False,
            export_extras=False,
            export_animations=False,
            export_skins=False,
            export_morph=False,
            export_draco_mesh_compression_enable=False,
            export_meshopt_compression_enable=False,
            export_gpu_instances=False,
            export_shared_accessors=False,
            use_selection=False,
            use_visible=False,
            use_renderable=False,
        )


def reset():
    """空のシーンにする(前の素材の名前やデータが残らないように)"""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images,
                 bpy.data.cameras, bpy.data.lights, bpy.data.worlds):
        for d in list(coll):
            coll.remove(d)


# ---------------------------------------------------------------------------
# 確認用の画像(Eevee)
# ---------------------------------------------------------------------------


def preview(path: str, eye, target, lens: float = 35.0, size=(640, 400), sun=(0.35, 1.0, 0.7)):
    """three.js 座標のカメラ位置と注視点で、夕方の光を当てて PNG を描く(素材の目視確認用)"""
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (*linear("#6c5a78"), 1)
    bg.inputs["Strength"].default_value = 0.9
    sc.world = world

    def b(v):
        return Vector((v[0], -v[2], v[1]))

    cam = bpy.data.cameras.new("cam")
    cam.lens = lens
    cam.clip_start = 0.02
    cam.clip_end = 1000
    co = bpy.data.objects.new("cam", cam)
    co.location = b(eye)
    co.rotation_euler = (b(target) - b(eye)).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(co)
    sc.camera = co
    ld = bpy.data.lights.new("sun", "SUN")
    ld.energy = 3.5
    ld.color = linear("#ffb67a")
    ld.angle = 0.05
    lo = bpy.data.objects.new("sun", ld)
    lo.rotation_euler = b(sun).to_track_quat("Z", "Y").to_euler()
    sc.collection.objects.link(lo)
    fill = bpy.data.lights.new("fill", "SUN")
    fill.energy = 0.6
    fill.color = linear("#8d86c4")
    fo = bpy.data.objects.new("fill", fill)
    fo.rotation_euler = b((0.4, 0.8, 0.6)).to_track_quat("Z", "Y").to_euler()
    sc.collection.objects.link(fo)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
