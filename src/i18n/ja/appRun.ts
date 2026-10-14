/**
 * app モジュールのうち、試走画面・結果画面の統合(INT-2 / INT-3、stream int-run)の文言。
 * 担当ストリームだけがこのファイルを編集する(設計画面の統合は app.ts)。
 */
export const appRun: Record<string, string> = {
  // 試走画面(INT-2)
  'app.run.hud': '試走の状況',
  'app.run.progress': 'ゴールまで',
  'app.run.sandbox': 'サンドボックス',
  'app.run.backKey': 'Esc',

  // 設計画面に出す試走前チェック(試走ボタンで止まったとき)
  'app.run.preflight.hint': '直すと試走できます',
};
