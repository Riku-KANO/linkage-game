/** 機構解析(E-04, E-05)の文言。担当:kinematics */
export const analysis: Record<string, string> = {
  'analysis.dof.locked': '自由度 {dof}:動きません',
  'analysis.dof.ok': '自由度 1:正常に動きます',
  'analysis.dof.loose': '自由度 {dof}:ぐらつきます',
  'analysis.noCrank': 'クランクがありません',
  'analysis.notAssemblable': 'リンクが届かず、組み立てられません',
  'analysis.noFullRotation': 'クランクが一回転できません',
  'analysis.issue.unknown-joint': '存在しないジョイントを参照しています',
  'analysis.issue.link-too-few-joints': 'つながっていないリンクがあります',
  'analysis.issue.crank-pivot-not-fixed': 'クランクの軸は固定点に置いてください',
  'analysis.issue.crank-pivot-not-on-link': 'クランクの軸がリンク上にありません',
  'analysis.issue.crank-link-missing': 'クランクのリンクがありません',
  'analysis.issue.crank-link-has-other-fixed': 'クランクが別の固定点に留められています',
  'analysis.issue.link-all-fixed': '両端が固定点のリンクは動きません',
  'analysis.issue.floating-joint': 'どこにもつながっていない部品があります',
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
