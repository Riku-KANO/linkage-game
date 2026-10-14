/** 設計データの読み込み・保存・共有の文言(src/core/model、src/core/storage) */
export const model: Record<string, string> = {
  'model.load.empty': '読み込むデータがありません',
  'model.load.corrupt': 'ファイルが壊れているか、形式が違います',
  'model.load.foreign': 'アシクミの設計データではありません',
  'model.load.version': '新しい版のアシクミで作られたデータです。アプリを更新してください',
  'model.load.invalid': '設計データの中身に問題があり、読み込めません',
  'model.save.quota': 'ブラウザの保存容量がいっぱいで、自動保存できませんでした',
  'model.save.unavailable': 'このブラウザでは自動保存が使えません(プライベートモードなど)',
  'model.save.serialize': '設計データを保存用に変換できませんでした',
  'model.save.newer': '新しい版のアシクミで保存されたデータがあるため、上書きしませんでした',
  'model.share.copied': '共有リンクをコピーしました',
  'model.share.copyFailed': 'コピーできませんでした。下のリンクを選んでコピーしてください',
  'model.share.loaded': '共有された機械を読み込みました',
};
