import {
  CanvasTexture,
  Color,
  DoubleSide,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type ColorRepresentation,
} from 'three';

/**
 * 試走ビューの共有マテリアル(夕暮れの工房に合う木と金属)。テクスチャは手続き生成(画像ファイルなし)。
 * 最初に使ったときに 1 回だけ作り、使い回す(破棄しない)。
 */

/** 部品の色(機体) */
export const MACHINE_PALETTE = {
  /** 棒:明るい合板 */
  wood: '#d9a86c',
  /** プレート:少し濃い木 */
  plate: '#b98250',
  /** クランク:赤茶の塗装 */
  crank: '#a8452c',
  /** 問題のリンク */
  highlight: '#ff3b2f',
  /** ピン・軸:鋼 */
  steel: '#b7bec7',
  /** フレーム:暗い鉄 */
  frame: '#4a4f57',
  /** モーターの蓋・ハブ:真鍮 */
  brass: '#d4a442',
  /** 脚先のゴム */
  rubber: '#2a2422',
} as const;

/** シード付きの擬似乱数(テクスチャの模様用) */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** 木目(白っぽい灰色の濃淡。色はマテリアル・インスタンス色で乗せる) */
function woodGrainTexture(): CanvasTexture | null {
  const c = makeCanvas(256, 64);
  const g = c?.getContext('2d');
  if (!c || !g) return null;
  const rnd = lcg(7);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 46; i++) {
    const y0 = rnd() * c.height;
    const amp = 1 + rnd() * 3;
    const freq = 0.01 + rnd() * 0.03;
    const shade = Math.floor(205 + rnd() * 40);
    g.strokeStyle = `rgba(${shade - 30},${shade - 45},${shade - 60},${0.18 + rnd() * 0.25})`;
    g.lineWidth = 0.6 + rnd() * 1.6;
    g.beginPath();
    for (let x = 0; x <= c.width; x += 4) {
      const y = y0 + Math.sin(x * freq + i) * amp;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/**
 * 1m 四方のタイル:10cm の細線と 1m の太線(コースの床)。UV がワールド座標(m)の形状に貼る。
 */
export function gridTexture(base: string, minor: string, major: string): CanvasTexture | null {
  const size = 512;
  const c = makeCanvas(size, size);
  const g = c?.getContext('2d');
  if (!c || !g) return null;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const rnd = lcg(11);
  // 板の汚れ・ムラ
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `rgba(0,0,0,${0.02 + rnd() * 0.04})`;
    g.fillRect(rnd() * size, rnd() * size, 8 + rnd() * 60, 2 + rnd() * 6);
  }
  g.strokeStyle = minor;
  g.lineWidth = 1;
  for (let k = 1; k < 10; k++) {
    const p = (k * size) / 10 + 0.5;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, size);
    g.moveTo(0, p);
    g.lineTo(size, p);
    g.stroke();
  }
  g.strokeStyle = major;
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, size - 3, size - 3);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export interface MachineMaterials {
  /** 棒・ボス・プレート(色はインスタンス色) */
  wood: MeshStandardMaterial;
  steel: MeshStandardMaterial;
  frame: MeshStandardMaterial;
  brass: MeshStandardMaterial;
  rubber: MeshStandardMaterial;
}

let shared: MachineMaterials | null = null;

export function getMachineMaterials(): MachineMaterials {
  if (shared) return shared;
  const grain = woodGrainTexture();
  shared = {
    wood: new MeshStandardMaterial({ color: '#ffffff', map: grain, roughness: 0.62, metalness: 0 }),
    steel: new MeshStandardMaterial({
      color: MACHINE_PALETTE.steel,
      roughness: 0.32,
      metalness: 0.85,
    }),
    frame: new MeshStandardMaterial({
      color: MACHINE_PALETTE.frame,
      roughness: 0.55,
      metalness: 0.55,
    }),
    brass: new MeshStandardMaterial({
      color: MACHINE_PALETTE.brass,
      roughness: 0.3,
      metalness: 0.9,
    }),
    rubber: new MeshStandardMaterial({
      color: MACHINE_PALETTE.rubber,
      roughness: 0.9,
      metalness: 0,
    }),
  };
  return shared;
}

/** ゴースト用の半透明マテリアル(呼ぶたびに新しく作る。使い終わったら dispose) */
export function createGhostMaterial(
  color: ColorRepresentation,
  opacity: number,
): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    emissive: new Color(color).multiplyScalar(0.35),
    roughness: 0.5,
    metalness: 0,
    transparent: true,
    opacity,
    depthWrite: false,
    side: DoubleSide,
  });
}
