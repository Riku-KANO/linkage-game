/**
 * 3D 素材の一覧(Blender → GLB)。素材は public/models/<file> に置く。
 *
 * 置いた素材は present: true にする(assets.test.ts が実在を確かめる)。present: false の間は
 * 手続き生成のジオメトリを使い、ネットワークには取りに行かない(実行時に 404 を出さない)。
 * GLB は Draco 圧縮なしで書き出す(デコーダーを外部から読まないため)。
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
  room: { file: 'workshop-room.glb', present: false, note: '工房の床・壁・天井・窓枠(Room)' },
  workbench: {
    file: 'workbench.glb',
    present: false,
    note: '作業台と製図台・卓上ライト(Workbench)',
  },
  courseModel: {
    file: 'course-model.glb',
    present: false,
    note: '壁のコース模型と章ごとの台地(CourseModel)',
  },
  shelf: { file: 'shelf.glb', present: false, note: '棚と本・模型(Shelf)' },
  toolbox: { file: 'toolbox.glb', present: false, note: '工具箱(Toolbox)' },
  wasteland: { file: 'wasteland.glb', present: false, note: '窓の外の荒野・台地・岩(Wasteland)' },
  logo: { file: 'logo.glb', present: false, note: 'タイトルの看板(BootLogo)' },
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
