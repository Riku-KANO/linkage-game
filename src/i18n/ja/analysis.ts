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
};
