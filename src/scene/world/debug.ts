/**
 * 開発・E2E 用の値(3D 側が書く。React の再描画は起こさない)。
 * window.__worldDev(開発用パネル)から読む。
 */
export const worldDebug = {
  /** 目印の画面上の位置(Canvas の左上基準、CSS px)。Canvas の外なら null */
  markerScreen: null as null | ((id: string) => { x: number; y: number } | null),
  /** 機械の道のりの位置(m) */
  walkerS: 0,
  /** T-06 の歩いた割合 0..1 */
  walkProgress: 0,
  /** T-06 で寄るカメラを差し込んでいるか */
  closeUp: false,
};
