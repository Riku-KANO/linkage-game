/** testrun モジュールの文言。担当モジュールだけがこのファイルを編集する */
export const testrun: Record<string, string> = {
  // 時間操作(S-06)
  'testrun.controls': '試走の操作',
  'testrun.play': '再生',
  'testrun.pause': '一時停止',
  'testrun.step': 'コマ送り',
  'testrun.reset': 'リセット',
  'testrun.speed': '速度',
  'testrun.speed.x': '×{s}',
  'testrun.timeLabel': '経過',
  'testrun.time': '{s} 秒',
  'testrun.distanceLabel': '距離',
  'testrun.distance': '{m} m',
  'testrun.slowMo': 'スロー',
  'testrun.keys': 'Space 再生・停止 / → コマ送り / R リセット / 1〜4 速度',

  // 状態
  'testrun.status.goal': 'ゴール!',
  'testrun.status.fallen': '転倒',
  'testrun.status.stalled': 'トルク不足で停止',
  'testrun.status.jammed': '機構が詰まった',

  // 表示の切り替え(S-07)
  'testrun.toggles': '表示',
  'testrun.show.trails': '脚先の軌跡',
  'testrun.show.contacts': '接地',
  'testrun.show.com': '重心',
  'testrun.show.torque': 'トルク',
  'testrun.show.ghost': 'ゴースト',
  'testrun.show.design': '設計図',
  'testrun.follow': '追従カメラ',

  // クランクトルクのメーター
  'testrun.torque.title': 'クランクトルク',
  'testrun.torque.value': '{v} N·m',
  'testrun.torque.limit': '上限 {v}',
  'testrun.torque.stall': '停動',

  // 設計図の縮小版(U-04)
  'testrun.mini.title': '設計図',
  'testrun.mini.angle': 'θ {deg}°',

  // 地形
  'testrun.tick': '{m} m',

  // 開発用プレイグラウンド(?dev=testrun)
  'testrun.dev.title': '試走ビュー',
  'testrun.dev.note': '運動学だけの簡易シミュレーション(動力学は統合時に差し替え)',
  'testrun.dev.machine': '機械',
  'testrun.dev.machine.jansen': 'ヤンセン型 見本機',
  'testrun.dev.machine.chebyshev': 'チェビシェフリンク',
  'testrun.dev.machine.fourBar': '四節リンク',
  'testrun.dev.course': 'コース',
  'testrun.dev.course.sample': '平地 → 段差 → 溝',
  'testrun.dev.course.flat': '平地',
  'testrun.dev.ghost': 'ゴースト',
  'testrun.dev.ghost.none': 'なし',
  'testrun.dev.ghost.previous': '前回の試走',
  'testrun.dev.ghost.sample': '見本(少し遅い)',
  'testrun.dev.tipOver': '4 秒で転倒させる(自動スローの確認)',
  'testrun.dev.highlight': '問題のリンクを強調',
  'testrun.dev.shadows': '影',
};
