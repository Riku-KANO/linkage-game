/** result モジュールの文言。担当モジュールだけがこのファイルを編集する */
export const result: Record<string, string> = {
  'result.region': '試走の結果',
  'result.headline.cleared': 'クリア!',
  'result.headline.failed': '失敗',
  'result.stage': 'ステージ {chapter}-{order} {title}',
  'result.skipHint': 'クリックかキーでスキップ',

  // 失敗理由(game が理由のキーを渡さなかったときの既定)
  'result.reasonLabel': '原因',
  'result.reason.fallen': '転倒した',
  'result.reason.timeout': '時間切れ',
  'result.reason.stalled': 'トルク不足でモーターが止まった',
  'result.reason.jammed': '機構が詰まった',
  'result.reason.overBudget': '予算オーバー',
  'result.reason.invalid': '機構が組み立てられない',
  'result.reason.unknown': 'ゴールに届かなかった',
  'result.distance': '進んだ距離 {distance} / {total} m',
  'result.replayFall': '転倒の瞬間を見る',

  // スコア 4 軸
  'result.axis.time': '到達時間',
  'result.axis.parts': '部品数',
  'result.axis.cost': 'コスト',
  'result.axis.energy': '消費エネルギー',
  'result.unit.time': '秒',
  'result.unit.parts': '個',
  'result.unit.cost': '',
  'result.unit.energy': 'J',

  // メダル
  'result.medal.gold': '金',
  'result.medal.silver': '銀',
  'result.medal.bronze': '銅',
  'result.medal.none': 'なし',
  'result.medalName.gold': '金メダル',
  'result.medalName.silver': '銀メダル',
  'result.medalName.bronze': '銅メダル',
  'result.medalName.none': 'メダルなし',
  'result.thresholds': '{gold}・{silver}・{bronze} 以下でそれぞれ金・銀・銅',
  'result.meterAria': '{axis} {value}{unit}',

  // 相手の記録との比較
  'result.opponent': '相手',
  'result.opponentValue': '相手 {value}{unit}',
  'result.win': '勝ち',
  'result.lose': '負け',
  'result.tie': '引き分け',
  'result.versus.title': '相手の記録と比べて',
  'result.versus.score': '{wins}勝 {losses}敗 {ties}分',
  'result.versus.otherStage': '別のステージの記録です',
  'result.versus.youNotCleared': 'クリアした相手の勝ち',
  'result.versus.themNotCleared': '相手は未クリア',

  // 共有
  'result.share.copy': '共有リンクをコピー',
  'result.share.copying': 'リンクを作っています…',
  'result.share.copied': 'コピーしました。送った相手はあなたのゴーストと競えます',
  'result.share.manual': 'コピーできませんでした。下のリンクを選んでコピーしてください',
  'result.share.error': '共有リンクを作れませんでした',
  'result.share.urlLabel': '共有リンク',

  // 行動
  'result.action.back': '設計に戻る',
  'result.action.next': '次のステージ',
  'result.action.retry': 'もう一度',
};
