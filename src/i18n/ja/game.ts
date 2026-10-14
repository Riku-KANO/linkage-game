/**
 * game モジュールの文言。担当モジュールだけがこのファイルを編集する。
 * ステージの説明とヒントには {distance}(m)、{timeLimit}(秒)、{budget}、{step}(cm)を
 * 埋められる(stageTextParams)。
 */
export const game: Record<string, string> = {
  // ---- 章 ----
  'game.chapter.1.title': 'はじめの一歩',
  'game.chapter.1.desc':
    '平らな地面を、決められた距離だけ歩かせよう。四節リンクと、クランクが一回転する条件を学ぶ章。',
  'game.chapter.2.title': '段差を越える',
  'game.chapter.2.desc':
    '段差や溝のある道を越えよう。脚先の軌道の高さと形、そして自由度を学ぶ章。脚列の複製が使えるようになる。',
  'game.chapter.3.title': 'でこぼこ道',
  'game.chapter.3.desc': '凸凹や坂を転ばずに進もう。接地区間を平らにする軌道と、重心を学ぶ章。',
  'game.chapter.4.title': '荷物を運ぶ',
  'game.chapter.4.desc': '重い荷物を載せて坂を登ろう。トルクと速さのつり合いを学ぶ章。',
  'game.chapter.5.title': '総合',
  'game.chapter.5.desc': '予算つきの複合コース。ここまで学んだことを総動員しよう。',
  'game.chapter.locked': 'まだ遊べません',
  'game.chapter.comingSoon': '準備中',

  // ---- 部品と機能 ----
  'game.part.link': 'リンク',
  'game.part.pin': 'ピン',
  'game.part.fixed': '固定点',
  'game.part.crank': 'クランク',
  'game.part.slider': 'スライダ',
  'game.part.gear': 'ギア',
  'game.part.spring': 'ばね',
  'game.feature.legArray': '脚列の複製',
  'game.feature.bodyPreset': '外装プリセット',

  // ---- 設計の名前(ステージの見本・壊れた機械) ----
  'game.design.basicLeg': '四節リンクの脚',
  'game.design.highStepLeg': '足を高く上げる脚',
  'game.design.jansen': 'ヤンセンリンクの機械',
  'game.design.broken': 'こわれた機械',
  'game.design.stuckCrank': '回らない機械',
  'game.design.shuffler': 'すり足の機械',
  'game.design.oneLeg': '一本足の機械',
  'game.design.locked': '動かない機械',
  'game.design.new': '新しい機械',

  // ---- 解放 ----
  'game.unlock.stage': '新しいステージ「{title}」',
  'game.unlock.chapter': '第 {chapter} 章「{title}」が解放されました',
  'game.unlock.part': '新しい部品:{part}',
  'game.unlock.feature': '新しい機能:{feature}',

  // ---- 評価・結果 ----
  'game.result.cleared': 'クリア!',
  'game.result.failed': '失敗',
  'game.result.newRecord': '最高記録',
  'game.axis.time': '到達時間',
  'game.axis.parts': '部品数',
  'game.axis.cost': 'コスト',
  'game.axis.energy': '消費エネルギー',
  'game.unit.time': '{value} 秒',
  'game.unit.parts': '{value} 個',
  'game.unit.cost': '{value}',
  'game.unit.energy': '{value} J',
  'game.unit.distance': '{value} m',
  'game.medal.gold': '金',
  'game.medal.silver': '銀',
  'game.medal.bronze': '銅',
  'game.medal.none': 'なし',

  // ---- 試走前チェック ----
  'game.preflight.empty': '部品がありません。固定点とクランクから組み始めよう',
  'game.preflight.noCrank': 'クランクがありません。モーターで回すクランクを付けよう',
  'game.preflight.dofLocked': '自由度が {dof} で、機構が動きません。余分なリンクを外そう',
  'game.preflight.dofLoose':
    '自由度が {dof} で、機構がぐらつきます。リンクを足して動きを 1 通りに決めよう',
  'game.preflight.notAssemblable': 'リンクが届かず、組み立てられません',
  'game.preflight.noFullRotation': 'クランクが一回転できません。クランクを短くしよう',
  'game.preflight.partNotAllowed': 'このステージでは「{part}」を使えません',
  'game.preflight.legArrayLocked': '脚列の複製はまだ使えません(第 2 章で解放)',
  'game.preflight.overBudget': '予算オーバー:コスト {cost} / 予算 {budget}',
  'game.preflight.motorStopped': 'モーターの回転数が 0 です',
  'game.preflight.rpmTooHigh': '回転数は {max} rpm までです',
  'game.preflight.noFoot': '脚先が決まっていません。地面をけるジョイントを脚先にしよう',
  'game.preflight.walksBackward': 'このままだと後ろへ歩きます。モーターの回転の向きを逆にしよう',

  // ---- 失敗理由(結果画面の一言と、次に試すこと) ----
  'game.fail.invalid': '設計に問題がある',
  'game.fail.invalid.advice': '試走前のチェックに出た問題を直そう',
  'game.fail.overBudget': '予算オーバー',
  'game.fail.overBudget.advice': '脚の数を減らすか、リンクを短くしてコストを下げよう',
  'game.fail.jammed': '機構が詰まった',
  'game.fail.jammed.advice': 'リンクが伸びきる所で引っかかっている。長さを見直そう',
  'game.fail.stalled': 'トルク不足',
  'game.fail.stalled.advice': 'モーターの力が足りない。回転数を下げるか、クランクを短くしよう',
  'game.fail.topHeavy': '重心が高い',
  'game.fail.topHeavy.advice': '脚列を増やして足元を広げるか、脚を短くして重心を下げよう',
  'game.fail.fallen': '転倒',
  'game.fail.fallen.advice': '脚の位相をずらして、いつも何本かの脚が地面につくようにしよう',
  'game.fail.wrongWay': '逆向きに歩いた',
  'game.fail.wrongWay.advice': 'モーターの回転の向きを逆にしよう',
  'game.fail.timeout': '時間切れ',
  'game.fail.timeout.advice': '回転数を上げるか、歩幅を広げて速く歩こう',

  // ---- ヒント ----
  'game.hint.level.1': 'ヒント 1:方針',
  'game.hint.level.2': 'ヒント 2:部品の配置',
  'game.hint.level.3': 'ヒント 3:完成形の一部',
  'game.hint.show': 'ヒントを見る',
  'game.hint.next': '次のヒントを見る',
  'game.hint.none': 'ヒントはもうありません',

  // ---- チュートリアル共通 ----
  'game.tutorial.next': '次へ',
  'game.tutorial.skip': 'チュートリアルを飛ばす',

  // ---- 章 1 ステージ 1:こわれた機械 ----
  'game.stage.c1-s1.title': 'こわれた機械',
  'game.stage.c1-s1.desc':
    '脚のリンクが 1 本外れた機械が届いた。リンクをつないで直し、{distance}m 先のゴールまで歩かせよう。',
  'game.stage.c1-s1.hint1':
    '自由度が 2 なのは、動きを決めるリンクが 1 本足りないから。右上の固定点と脚をつなごう。',
  'game.stage.c1-s1.hint2': '影の 2 つの点を、リンクでつなぎます',
  'game.stage.c1-s1.hint3': '足りないリンクはこれ',
  'game.stage.c1-s1.tut.1': '工房へようこそ。この機械は脚のリンクが 1 本外れていて、歩けません。',
  'game.stage.c1-s1.tut.2':
    '「自由度」を見てください。2 は「ぐらつく」という意味。動きを 1 通りに決めるには、リンクがもう 1 本いります。',
  'game.stage.c1-s1.tut.3':
    'リンクを渡します。右上の固定点と、脚の付け根の光るピンを、リンクでつなぎましょう。',
  'game.stage.c1-s1.tut.4':
    'まだぐらつきます。リンクの両端が、固定点とピンにはまっているか確かめましょう。',
  'game.stage.c1-s1.tut.5': 'クランクが一回転できません。つなぐ場所を見直しましょう。',
  'game.stage.c1-s1.tut.6': '直りました!「試走」を押して、機械を歩かせましょう。',

  // ---- 章 1 ステージ 2:回らないクランク ----
  'game.stage.c1-s2.title': '回らないクランク',
  'game.stage.c1-s2.desc':
    'こんどの機械はクランクが長すぎて、途中で引っかかってしまう。クランクを短くして、{distance}m 歩かせよう。',
  'game.stage.c1-s2.hint1':
    'クランクが一回転するには、クランクがいちばん短いリンクであることが大切。今の半分くらいにしてみよう。',
  'game.stage.c1-s2.hint2': 'クランクの先のピンを、影の位置まで動かします',
  'game.stage.c1-s2.hint3': '直した後のクランクと、つながる連結棒',
  'game.stage.c1-s2.tut.1': 'この機械は、クランクが途中で止まって一回転できません。',
  'game.stage.c1-s2.tut.2':
    'クランクが一回転するには、まわりのリンクより十分に短くなければいけません。これを「グラスホフの条件」といいます。',
  'game.stage.c1-s2.tut.3':
    'クランクの先のピンをつかんで、モーターの軸に近づけましょう。一回転できると赤い表示が消えます。',
  'game.stage.c1-s2.tut.4': '一回転できるようになりました。「試走」で歩かせてみましょう。',

  // ---- 章 1 ステージ 3:はじめての脚 ----
  'game.stage.c1-s3.title': 'はじめての脚',
  'game.stage.c1-s3.desc':
    '白紙から四節リンクの脚を組み立てよう。部品はひとつずつ渡すよ。目標は {distance}m 先。',
  'game.stage.c1-s3.hint1':
    '短いクランク、長い連結棒、その間で揺れる棒。連結棒を下へ伸ばした先を脚先にしよう。',
  'game.stage.c1-s3.hint2': '固定点とクランクの位置',
  'game.stage.c1-s3.hint3': 'クランクと揺れる棒。残りは連結棒',
  'game.stage.c1-s3.tut.1':
    'ここからは白紙から作ります。固定点・クランク・リンクで「四節リンク」を組みましょう。',
  'game.stage.c1-s3.tut.2': 'まずは固定点を 2 つ置きましょう。機体のフレームに留める軸受けです。',
  'game.stage.c1-s3.tut.3': '片方の固定点にクランクを付けましょう。モーターで回る短い腕です。',
  'game.stage.c1-s3.tut.4':
    'リンクを 2 本足します。1 本はクランクの先から、もう 1 本はもう一方の固定点から伸ばして、先どうしをつなぎましょう。',
  'game.stage.c1-s3.tut.5':
    '自由度が 1 になるようにつなぎましょう。今はまだ動きが決まっていません。',
  'game.stage.c1-s3.tut.6':
    'クランクが一回転できません。クランクを短く、ほかのリンクを長めにしてみましょう。',
  'game.stage.c1-s3.tut.7':
    '動きました!連結棒を下へ伸ばした先が脚先です。軌道の底が平らで長いほど、なめらかに歩けます。',
  'game.stage.c1-s3.tut.8': '準備ができたら「試走」で歩かせましょう。',

  // ---- 章 1 ステージ 4:長い道のり ----
  'game.stage.c1-s4.title': '長い道のり',
  'game.stage.c1-s4.desc':
    '{distance}m 先のゴールまで、{timeLimit} 秒以内にたどり着こう。速さは回転数と歩幅で決まる。',
  'game.stage.c1-s4.hint1': 'モーターの回転数を上げるか、脚先の軌道の底を長くして歩幅を広げよう。',
  'game.stage.c1-s4.hint2': '固定点とクランクの位置',
  'game.stage.c1-s4.hint3': 'クランクと、脚先まで伸びた連結棒',

  // ---- 章 1 ステージ 5:大またで歩く ----
  'game.stage.c1-s5.title': '大またで歩く',
  'game.stage.c1-s5.desc':
    '{distance}m を {timeLimit} 秒で。四節リンクの形を工夫して、大きな歩幅で歩こう。',
  'game.stage.c1-s5.hint1':
    'クランクを少し長くし、脚先を軸から遠ざけると歩幅が広がる。一回転できる範囲で試そう。',
  'game.stage.c1-s5.hint2': '固定点とクランクの位置',
  'game.stage.c1-s5.hint3': 'クランクと揺れる棒。残りは連結棒',

  // ---- 章 2 ステージ 1:段差をのぼる ----
  'game.stage.c2-s1.title': '段差をのぼる',
  'game.stage.c2-s1.desc':
    '高さ {step}cm の段差がある。すり足の機械ではつまずいてしまう。足を高く上げて、{distance}m 先へ。',
  'game.stage.c2-s1.hint1':
    '軌道のいちばん高い所と低い所の差が、足を上げる高さ。段差より十分に高くしよう。',
  'game.stage.c2-s1.hint2': '固定点とクランクの位置',
  'game.stage.c2-s1.hint3': 'クランクと、脚先まで伸びた連結棒',

  // ---- 章 2 ステージ 2:脚をふやす ----
  'game.stage.c2-s2.title': '脚をふやす',
  'game.stage.c2-s2.desc':
    '脚が 1 本しかない機械は立っていられない。脚列の複製で脚を増やし、位相をずらして歩かせよう。',
  'game.stage.c2-s2.hint1':
    '脚列の組数を 3、位相差を 120°にしてみよう。前後反転を入れると、前と後ろにも脚が並ぶ。',
  'game.stage.c2-s2.hint2': '固定点とクランクの位置',
  'game.stage.c2-s2.hint3': 'クランクと、脚先まで伸びた連結棒',

  // ---- 章 2 ステージ 3:動かない機械 ----
  'game.stage.c2-s3.title': '動かない機械',
  'game.stage.c2-s3.desc':
    'ヤンセンリンクの機械が、ぴくりとも動かない。余分なリンクを見つけて外し、段を上ろう。',
  'game.stage.c2-s3.hint1':
    '自由度 0 は「動かない」という意味。リンクで三角形に固まっている所を探そう。',
  'game.stage.c2-s3.hint2': 'クランクから伸びる 2 本のリンク',
  'game.stage.c2-s3.hint3': '完成形の上半分。余分なリンクはここにない',

  // ---- 章 2 ステージ 4:溝をまたぐ ----
  'game.stage.c2-s4.title': '溝をまたぐ',
  'game.stage.c2-s4.desc':
    '行く手に溝が 2 つ。歩幅の広い脚なら、落ちずにまたげる。予算は {budget}。',
  'game.stage.c2-s4.hint1': '脚先の軌道の平らな底が長いほど、溝をまたげる。',
  'game.stage.c2-s4.hint2': '固定点とクランクの位置',
  'game.stage.c2-s4.hint3': '完成形の上半分',

  // ---- 章 2 ステージ 5:段差の道 ----
  'game.stage.c2-s5.title': '段差の道',
  'game.stage.c2-s5.desc':
    '上り段差、溝、下り段差が続く道。予算 {budget} 以内の機械で {distance}m 先を目指そう。',
  'game.stage.c2-s5.hint1':
    'ヤンセンリンクは高くつく。四節リンクの脚でも、足を高く上げて歩幅を広げれば越えられる。',
  'game.stage.c2-s5.hint2': '固定点とクランクの位置',
  'game.stage.c2-s5.hint3': 'クランクと揺れる棒。残りは連結棒',
};
