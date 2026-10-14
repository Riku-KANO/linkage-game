/** world(工房が育つ・ステージ選択のジオラマ)の文言。担当モジュールだけがこのファイルを編集する */
export const world: Record<string, string> = {
  // ジオラマの目印のラベル
  'world.marker.code': '{chapter}-{order}',
  'world.marker.locked': 'まだ遊べません',
  'world.marker.playable': '挑戦できます',
  'world.marker.cleared': 'クリア',
  'world.marker.here': 'ここにいます',
  'world.marker.medal': '{axis}:{medal}',

  // 棚の模型・図鑑の額
  'world.shelf.chapter': '第 {n} 章',
  'world.frame.unknown': '?',

  // 開発用パネル(?dev=scene)
  'world.dev.title': 'world デバッグ',
  'world.dev.status': 'クリア {cleared}/{total} ・ 機械の位置 {stage}',
  'world.dev.walking': '歩行中 {from} → {to}',
  'world.dev.medals': 'メダル',
  'world.dev.medal.mixed': 'まちまち',
  'world.dev.clearNext': '次をクリア',
  'world.dev.clearAndWalk': 'クリアして T-06',
  'world.dev.clearChapter': '章をクリア',
  'world.dev.clearAll': '全部クリア',
  'world.dev.reset': '進行をリセット',
  'world.dev.machine': '機械:{name}',
  'world.dev.nextMachine': '機械を替える',
  'world.dev.zukan': '図鑑に登録',
};
