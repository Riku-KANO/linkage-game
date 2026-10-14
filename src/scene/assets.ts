/**
 * 3D 素材の一覧(Blender → GLB)。素材は public/models/<file> に置く。
 * 素材は art/blender/ の Python スクリプトから `pnpm models` で作り直す(決定論的。models.test.ts が予算と外形を検査)。
 *
 * 置いた素材は present: true にする(assets.test.ts が実在を確かめる)。present: false の間は
 * 手続き生成のジオメトリを使い、ネットワークには取りに行かない(実行時に 404 を出さない)。
 * GLB は Draco 圧縮なしで書き出す(デコーダーを外部から読まないため)。
 * 置き換わるのは動かない部分だけ(env/ModelSlot.tsx)。原点と向きは各コンポーネントのローカル座標
 * (Room・Wasteland はワールド、他は layout.ts の位置を原点に、単位 m、+y 上)に合わせる。
 * Workbench の ModelSlot は親の変換がないのでワールド座標(GLB の節点を BENCH.center へ平行移動している)。
 */

export interface ModelEntry {
  /** public/models/ からの相対パス */
  file: string;
  /** ファイルが public/models にあるか */
  present: boolean;
  /** 何の素材か(差し替える手続き生成の部品) */
  note: string;
}

export const MODEL_MANIFEST = {
  room: {
    file: 'workshop-room.glb',
    present: false,
    note: '工房の床・壁・天井・梁・窓の戸・有孔ボード(Room)。窓枠はメニュー物体なので別',
  },
  workbench: {
    file: 'workbench.glb',
    present: false,
    note: '作業台の本体と小物(Workbench)。製図用紙・ドラフター・卓上ライトは手続き生成のまま',
  },
  courseModel: {
    file: 'course-model.glb',
    present: false,
    note: 'コース模型の上の章ごとの台地(CourseModel)。板と棚受けは手続き生成のまま',
  },
  shelf: {
    file: 'shelf.glb',
    present: false,
    note: '棚の枠と本(Shelf)。引き出しと模型は手続き生成',
  },
  toolbox: {
    file: 'toolbox.glb',
    present: true,
    note: '工具箱の本体(Toolbox)。トレイとリンクは手続き生成',
  },
  wasteland: { file: 'wasteland.glb', present: false, note: '窓の外の地面と台地(Wasteland)' },
  logo: {
    file: 'logo.glb',
    present: true,
    note: 'タイトルの看板の板(BootLogo)。ロゴの棒は手続き生成',
  },
} as const satisfies Record<string, ModelEntry>;

export type ModelId = keyof typeof MODEL_MANIFEST;

const base = (): string => {
  const b = import.meta.env?.BASE_URL ?? '/';
  return b.endsWith('/') ? b : `${b}/`;
};

/** 素材の URL。素材がなければ null(手続き生成で代用する) */
export function modelUrl(id: ModelId): string | null {
  const e: ModelEntry = MODEL_MANIFEST[id];
  return e.present ? `${base()}models/${e.file}` : null;
}

/** 置いてある素材の URL(先読み用) */
export function presentModelUrls(): string[] {
  return (Object.keys(MODEL_MANIFEST) as ModelId[])
    .map((id) => modelUrl(id))
    .filter((u): u is string => u !== null);
}
