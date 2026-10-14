/**
 * 設計画面(DOM)と 3D の紙の間の合図。React を通さず、3D 側が毎フレーム読む。
 */
export const designSignals = {
  /**
   * 紙の上に DOM のエディタが出ている(カメラが降りきって位置が合っている)。
   * この間は 3D の紙のインクを隠す(エディタの SVG が同じ図面を同じ位置に描く)。
   */
  editorLive: false,
};
