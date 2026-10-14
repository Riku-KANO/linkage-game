/** 機構解析(E-04, E-05)の文言。担当:kinematics */
export const analysis: Record<string, string> = {
  'analysis.dof.locked': '自由度 {dof}:動きません',
  'analysis.dof.ok': '自由度 1:正常に動きます',
  'analysis.dof.loose': '自由度 {dof}:ぐらつきます',
  'analysis.noCrank': 'クランクがありません',
  'analysis.specialGeometry':
    'グリューブラーの式では自由度 {dof}(動かない)ですが、平行四辺形のような特殊な寸法なので動いています。寸法が少しでもずれると動かなくなります',
  'analysis.notAssemblable': 'リンクが届かず、組み立てられません',
  'analysis.noFullRotation': 'クランクが一回転できません({from}°〜{to}° でリンクが届きません)',
  'analysis.deadPoint':
    'クランク {angle}° 付近で死点に近づきます(リンクが一直線に並び、動きが不安定になります)',
  'analysis.redundantLinks':
    '赤いリンクのあたりが固まっています(余分なリンクが {count} 本分あります。どれかを外すと動きます)',
  'analysis.looseJoints':
    '赤い点はクランクを止めても動いてしまいます(あと {count} 本リンクを足して支えてください)',
  'analysis.metric.stride': '歩幅',
  'analysis.metric.lift': '足上げ',
  'analysis.metric.flatness': '接地の平らさ',
  'analysis.metric.duty': '接地の割合',
  'analysis.metric.direction.forward': '前へ進む',
  'analysis.metric.direction.backward': '後ろへ進む',
  'analysis.metric.direction.none': '進む向きが定まりません',
  'analysis.issue.unknown-joint': '存在しないジョイントを参照しています',
  'analysis.issue.link-too-few-joints': 'つながっていないリンクがあります',
  'analysis.issue.crank-pivot-not-fixed': 'クランクの軸は固定点に置いてください',
  'analysis.issue.crank-pivot-not-on-link': 'クランクの軸がリンク上にありません',
  'analysis.issue.crank-link-missing': 'クランクのリンクがありません',
  'analysis.issue.crank-link-has-other-fixed': 'クランクが別の固定点に留められています',
  'analysis.issue.link-all-fixed': '両端が固定点のリンクは動きません',
  'analysis.issue.floating-joint': 'どこにもつながっていない部品があります',
  'analysis.issue.link-too-short': '短すぎるリンクがあります(2cm 未満)。点をもう少し離してください',
  'analysis.issue.newton-too-large':
    '一度に計算しなければならない点が多すぎます。三角形や四節リンクの組み合わせに分けて組んでください',
  'analysis.grashof.crank-rocker': 'グラスホフ判定:てこクランク(クランクは一回転できます)',
  'analysis.grashof.double-crank': 'グラスホフ判定:両クランク(クランクも出力側も一回転できます)',
  'analysis.grashof.double-rocker':
    'グラスホフ判定:両てこ(中間のリンクが最短なので、クランクは一回転できません)',
  'analysis.grashof.rocker-crank':
    'グラスホフ判定:回るのは出力側だけです(出力側のリンクが最短なので、クランクは一回転できません)',
  'analysis.grashof.change-point':
    'グラスホフ判定:変位点(リンクが一直線に並ぶ瞬間があり、動く向きが定まりません)',
  'analysis.grashof.triple-rocker':
    'グラスホフの条件を満たしません(最短と最長のリンクの和が長すぎて、クランクは一回転できません)',
};
