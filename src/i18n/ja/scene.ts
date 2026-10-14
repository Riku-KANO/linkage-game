/** scene モジュールの文言。担当モジュールだけがこのファイルを編集する */
export const scene: Record<string, string> = {
  // ホームのメニュー(工房の物体と画面端のテキストメニュー)
  'scene.menu.label': 'メニュー',
  'scene.menu.continue': '続きから',
  'scene.menu.stageSelect': 'ステージ選択',
  'scene.menu.zukan': '機構図鑑',
  'scene.menu.sandbox': 'サンドボックス',
  'scene.menu.settings': '設定',
  'scene.object.continue': '作業台',
  'scene.object.stageSelect': '壁のコース模型',
  'scene.object.zukan': '棚',
  'scene.object.sandbox': '窓の外の荒野',
  'scene.object.settings': '工具箱',
  'scene.menu.keyHint': '↑↓ で選び Enter で決定',

  // 製図用紙の表題欄
  'scene.paper.title': 'アシクミ 設計図',
  'scene.paper.units': '単位 cm ・ 方眼 10',

  // 起動
  'scene.boot.skipHint': 'クリックでスキップ',
  'scene.boot.loading': '読み込み中…',

  // 共通
  'scene.back': '戻る',
  'scene.backHint': 'Esc・右クリックで戻る',
  'scene.skipHint': 'クリックでスキップ',

  // ステージ選択(仮)
  'scene.stageSelect.title': 'ステージ選択',
  'scene.stageSelect.chapter': '第 {n} 章',
  'scene.stageSelect.chapter1': 'はじめの一歩',
  'scene.stageSelect.chapter2': '段差を越える',
  'scene.stageSelect.stage': '{chapter}-{n}',
  'scene.stageSelect.locked': 'まだ遊べません',

  // 設計(仮)
  'scene.design.title': '設計',
  'scene.design.placeholder': 'ここに設計ビューが重なります(製図用紙と位置合わせ済み)',
  'scene.design.testRun': '試走する',
  'scene.design.stage': 'ステージ {id}',

  // 試走(仮)
  'scene.testRun.title': '試走',
  'scene.testRun.goal': 'ゴール(仮)',
  'scene.testRun.backToDesign': '設計に戻る',

  // 結果(仮)
  'scene.result.title': '結果',
  'scene.result.placeholder': 'ここに結果のメーターとメダルが入ります',
  'scene.result.retry': '設計に戻る',
  'scene.result.next': 'ステージ選択へ',

  // 図鑑・設定・サンドボックス
  'scene.zukan.title': '機構図鑑',
  'scene.zukan.empty': 'まだ登録された機構はありません。有名な機構を組むとここに並びます。',
  'scene.settings.title': '設定',
  'scene.settings.lowPerf': '低性能モード',
  'scene.settings.lowPerfHint': '影・被写界深度・ブルームを切り、カメラの揺れを止めます',
  'scene.settings.lowPerfAuto': '起動時に自動で選びました({reason})',
  'scene.settings.reason.software': 'ソフトウェア描画',
  'scene.settings.reason.slow': '描画が遅い',
  'scene.settings.reason.ok': '十分な性能',
  'scene.settings.reason.manual': '手動',
  'scene.settings.reducedMotion': '動きを減らす',
  'scene.settings.reducedMotionHint': 'カメラの移動を短いフェードに置き換えます',
  'scene.settings.volume': '音量',
  'scene.sandbox.title': 'サンドボックス',
  'scene.sandbox.soon': '窓の外の荒野で自由に機械を試せる場所です(準備中)。',

  // 開発用パネル(?dev=scene)
  'scene.debug.title': 'scene デバッグ',
  'scene.debug.screen': '画面',
  'scene.debug.transition': '遷移',
  'scene.debug.none': 'なし',
  'scene.debug.fps': 'fps',
  'scene.debug.camera': 'カメラ',
  'scene.debug.lowPerf': '低性能モード',
  'scene.debug.reducedMotion': '動きを減らす',
  'scene.debug.resetSeen': '初回の演出に戻す',
  'scene.debug.back': '戻る',
  'scene.debug.skip': 'スキップ',
  'scene.debug.paper': '用紙',
  'scene.debug.reverse': '逆再生',
  'scene.debug.short': '短縮',
};
