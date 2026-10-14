/** ホーム・ステージ選択・設定・図鑑の画面(stream int-home、src/app/screens) */
export const home: Record<string, string> = {
  'home.menu.keyHint': '↑↓ で選び Enter で決定・工房の物体もクリックできます',
  // 遊び方の本(INT-7b、stream int-polish)。工房の物体はなく、テキストメニューだけの項目
  'home.menu.howToPlay': '遊び方',
  'home.menu.howToPlay.desc': '機械の組み方・歩かせ方を図で見る',
  'home.welcome.region': 'はじめての方へ',

  'home.zukan.title': '機構図鑑',
  'home.zukan.soon': '準備中',
  'home.zukan.body':
    'チェビシェフリンクやヤンセンリンクのような有名な機構を組むと、名前と原理の解説つきで棚に並びます。',
  'home.zukan.count': '登録した機構 {count} 件',

  'home.sandbox.title': 'サンドボックス',
  'home.sandbox.body': '窓の外の荒野で、ステージの決まりに縛られずに機械を試せます。',
  'home.sandbox.start': '作業台で始める',

  'home.settings.lowPerfAuto':
    '低性能モードは起動時に自動で選びました({reason})。切り替えると以後はその選択を使います。',
};
