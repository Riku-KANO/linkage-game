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
  'game.preflight.noCrank':
    'クランクがありません。「クランク」を押して、固定点から伸びる棒をクリックしよう',
  'game.preflight.dofLocked':
    '自由度が {dof} で、機構が動きません。棒が三角形に固まっている所を探して、余分な棒を外そう',
  'game.preflight.dofLoose':
    '自由度が {dof} で、機構がぐらつきます。赤い点を固定点やほかの点と棒でつないで、動きを 1 通りに決めよう',
  'game.preflight.notAssemblable':
    '棒が届かず、組み立てられません。赤い棒の長さか、点の位置を見直そう',
  'game.preflight.noFullRotation':
    'クランクが一回転できません。クランクの先の点を軸に近づけて、クランクを短くしよう',
  'game.preflight.partNotAllowed': 'このステージでは「{part}」を使えません',
  'game.preflight.legArrayLocked': '脚列の複製はまだ使えません(第 2 章で解放)',
  'game.preflight.overBudget':
    '予算オーバー:コスト {cost} / 予算 {budget}。棒を短くするか、部品を減らそう',
  'game.preflight.motorStopped': 'モーターの回転数が 0 です。右の「モーター」で回転数を上げよう',
  'game.preflight.rpmTooHigh': '回転数は {max} rpm までです。回転数を下げよう',
  'game.preflight.noFoot':
    '脚先が決まっていません。「脚先」を押して、地面をける点(いちばん下の点)をクリックしよう',
  'game.preflight.walksBackward':
    'このままだと後ろへ歩きます。右の「モーター」の「逆回転」を押そう',

  // ---- 失敗理由(結果画面の一言と、次に試すこと) ----
  'game.fail.invalid': '設計に問題がある',
  'game.fail.invalid.advice': '試走前のチェックに出た問題を直そう',
  'game.fail.overBudget': '予算オーバー',
  'game.fail.overBudget.advice': '脚の組数を減らすか、棒を短くしてコストを下げよう',
  'game.fail.jammed': '機構が詰まった',
  'game.fail.jammed.advice':
    '棒が伸びきる所で引っかかった。赤く光る棒の長さを変えるか、クランクを短くしよう',
  'game.fail.stumbled': '段差につまずいた',
  'game.fail.stumbled.advice':
    '脚先が段差の側面に引っかかって止まった。足を段差より高く上げ、上から下ろす軌道にしよう',
  'game.fail.stalled': 'トルク不足',
  'game.fail.stalled.advice': 'モーターの力が足りない。回転数を下げるか、クランクを短くしよう',
  'game.fail.topHeavy': '重心が高い',
  'game.fail.topHeavy.advice': '脚を短くして重心を下げるか、脚列を増やして足元を広げよう',
  'game.fail.fallen': '転倒',
  'game.fail.fallen.advice':
    '脚先の軌道の底を平らで長くして、いつも何本かの脚が地面につくようにしよう(章 2 からは脚列の位相も変えられる)',
  'game.fail.wrongWay': '逆向きに歩いた',
  'game.fail.wrongWay.advice': '右の「モーター」の「逆回転」を押して、回る向きを逆にしよう',
  'game.fail.timeout': '時間切れ',
  'game.fail.timeout.advice': '回転数を上げるか、脚先の軌道の底を長くして歩幅を広げよう',

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
    '脚の棒(リンク)が 1 本外れた機械が届いた。棒をつないで直し、{distance}m 先のゴールまで歩かせよう。',
  'game.stage.c1-s1.hint1':
    '自由度が 2 なのは、動きを決める棒が 1 本足りないから。右上の固定点と、三角の板の右の角を棒でつなごう。',
  'game.stage.c1-s1.hint2': '影の 2 つの点を、リンクでつなぎます',
  'game.stage.c1-s1.hint3': '足りないのはこの棒。「リンク」で、影の棒の端から端までドラッグしよう',
  'game.stage.c1-s1.tut.1':
    '工房へようこそ。この機械は脚の棒(リンク)が 1 本外れていて、歩けません。まずは直してみましょう。',
  'game.stage.c1-s1.tut.2':
    '設計図の左上の札「自由度 2・ぐらつく」を見てください。自由度が 1 なら、機械はモーターの回転どおりに動きます。2 だと勝手にぐらつくので、棒をもう 1 本つないで 1 にします。',
  'game.stage.c1-s1.tut.3':
    '「リンク」が使えるようになりました。上の「リンク」を押してから、右上に 1 つだけ離れている固定点から、三角の板の右の角にある赤い点までドラッグしてつなぎましょう。',
  'game.stage.c1-s1.tut.4':
    'まだぐらつきます。棒の先が点にはまっていないようです。「元に戻す」(↶)で取り消して、固定点から赤い点までもう一度ドラッグしましょう。点に近づけると吸い付きます。',
  'game.stage.c1-s1.tut.5':
    '自由度は 1 になりましたが、クランクが一回転できません。つなぐ点がちがうようです。「元に戻す」(↶)で取り消して、右上の固定点と三角の板の右の角をつなぎ直しましょう。',
  'game.stage.c1-s1.tut.6': '直りました!「試走」ボタンを押して、機械を歩かせましょう。',

  // ---- 章 1 ステージ 2:回らないクランク ----
  'game.stage.c1-s2.title': '回らないクランク',
  'game.stage.c1-s2.desc':
    'こんどの機械はクランクが長すぎて、途中で引っかかってしまう。クランクを短くして、{distance}m 歩かせよう。',
  'game.stage.c1-s2.hint1':
    'クランクが一回転するには、クランクがいちばん短い棒であることが大切。クランクの先の点を軸へ近づけて、今の半分くらいの長さにしてみよう。',
  'game.stage.c1-s2.hint2': 'クランクの先の点を、影の点まで動かします',
  'game.stage.c1-s2.hint3': '直した後のクランクと連結棒。クランクの先の点を、影の点に重ねよう',
  'game.stage.c1-s2.tut.1':
    'この機械は、クランクが途中で引っかかって一回転できません。赤い線や × 印が、引っかかっている所です。',
  'game.stage.c1-s2.tut.2':
    'クランクが一回転するには、まわりの棒より十分に短くないといけません(機構学では「グラスホフの条件」と呼びます)。',
  'game.stage.c1-s2.tut.3':
    'オレンジ色の棒がクランクです。その先の点(いちばん上の点)をつかんで、回る矢印のついた軸の方へまっすぐ下げ、長さを今の半分くらいにしましょう(軸に重ねると回りません)。一回転できると赤い表示が消えます。',
  'game.stage.c1-s2.tut.4':
    '一回転できるようになりました!「試走」ボタンを押して歩かせてみましょう。',

  // ---- 章 1 ステージ 3:はじめての脚 ----
  'game.stage.c1-s3.title': 'はじめての脚',
  'game.stage.c1-s3.desc':
    '白紙から四節リンクの脚を組み立てよう。部品はひとつずつ渡すよ。目標は {distance}m 先。',
  'game.stage.c1-s3.hint1':
    '左の固定点に短いクランク(10cm ほど)。クランクの先から右下へ長い棒を伸ばし、その棒のまん中より少し下の点と、右の固定点を棒でつなごう。長い棒の下の端が脚先になる。',
  'game.stage.c1-s3.hint2': '固定点とクランクを置く場所。右の固定点は左より少し高く',
  'game.stage.c1-s3.hint3':
    'クランク・脚先・右の固定点の影。チュートリアルと同じ手順で、クランクの先から脚先の影まで長い棒を引き、その棒のまん中より少し下の点と右の固定点をつなごう',
  'game.stage.c1-s3.tut.1':
    'ここからは白紙から脚を 1 本作ります。部品を 1 つずつ渡すので、吹き出しのとおりに置いていきましょう。',
  'game.stage.c1-s3.tut.2':
    '上の「固定点」を押して、設計図をクリックし、固定点を 2 つ置きます。1 つ目は点線が十字に交わる所、2 つ目はそこから右へ太いマス目 4 つ、上へ 2 つの所に(太いマス目 1 つが 10cm)。',
  'game.stage.c1-s3.tut.3':
    '次は「リンク」です。「リンク」を押して、左の固定点から真上へドラッグし、長さ 10cm ほどの短い棒を引きましょう。引いている間は長さが表示されます。',
  'game.stage.c1-s3.tut.4':
    '「クランク」を押して、いま引いた短い棒をクリックしましょう。棒がモーターで回る腕(クランク)になって、回り始めます。',
  'game.stage.c1-s3.tut.5':
    'もう一度「リンク」を押して、クランクの上の端の点から右下へ、長い棒を引きます。右へ太いマス目 2〜3 つ、下へ 5 つほど。この棒の下の端が脚先になります。',
  'game.stage.c1-s3.tut.6':
    '「リンク」のまま、長い棒のまん中より少し下をクリックして点を 1 つ足します。その点から右の固定点までドラッグして、2 つをつなぎましょう(失敗したら「元に戻す」(↶))。',
  'game.stage.c1-s3.tut.7':
    'まだ自由度が 1 になっていません。棒の先が点にはまっていないようです。「元に戻す」(↶)で 1 つ戻して、点から点へドラッグし直しましょう。点に近づけると吸い付きます。',
  'game.stage.c1-s3.tut.8':
    '自由度は 1 ですが、クランクが一回転できません。「選択」でクランクの先の点をつかんで左の固定点に近づけ、クランクを短くしてみましょう。',
  'game.stage.c1-s3.tut.9':
    '動きました!「脚先」を押して、長い棒の下の端をクリックしましょう。脚先の通る道(軌道)が線で出ます。右の欄が「→ 前へ進む」なら OK、「← 後ろへ進む」ならモーターの「逆回転」を押します。',
  'game.stage.c1-s3.tut.10': '準備ができたら、「試走」ボタンを押して歩かせてみましょう。',

  // ---- 章 1 ステージ 4:長い道のり ----
  'game.stage.c1-s4.title': '長い道のり',
  'game.stage.c1-s4.desc':
    '{distance}m 先のゴールまで、{timeLimit} 秒以内にたどり着こう。速さは回転数と歩幅で決まる。',
  'game.stage.c1-s4.hint1':
    '1-3 と同じ形の脚で届く。速くするには、右の「モーター」で回転数を 60 くらいに上げよう。',
  'game.stage.c1-s4.hint2': '固定点とクランクの位置',
  'game.stage.c1-s4.hint3':
    'クランク・脚先・右の固定点の影。1-3 と同じ手順で、クランクの先から脚先の影まで長い棒を引き、そのまん中より少し下の点と右の固定点をつなごう。回転数は 60 に',

  // ---- 章 1 ステージ 5:大またで歩く ----
  'game.stage.c1-s5.title': '大またで歩く',
  'game.stage.c1-s5.desc':
    '{distance}m を {timeLimit} 秒で。四節リンクの形を工夫して、大きな歩幅で歩こう。',
  'game.stage.c1-s5.hint1':
    'クランクを少し長くし、脚先を軸から遠ざけると歩幅が広がる(一回転できる範囲で)。回転数を 60〜80 に上げると速く歩ける。',
  'game.stage.c1-s5.hint2': '固定点とクランクの位置',
  'game.stage.c1-s5.hint3':
    'クランク・脚先・右の固定点の影。1-3 と同じ手順で組み(長い棒のまん中より少し下の点と右の固定点をつなぐ)、回転数を 60〜80 に上げよう',

  // ---- 章 2 ステージ 1:段差をのぼる ----
  'game.stage.c2-s1.title': '段差をのぼる',
  'game.stage.c2-s1.desc':
    '高さ {step}cm の段差がある。すり足の機械ではつまずいてしまう。足を高く上げて、{distance}m 先へ。',
  'game.stage.c2-s1.hint1':
    '軌道のいちばん高い所と低い所の差が、足を上げる高さ。段差より十分に高くして、前の端では脚先を上から下ろそう。',
  'game.stage.c2-s1.hint2': '固定点とクランクの位置',
  'game.stage.c2-s1.hint3':
    '影は完成形の点の位置。「選択」で自分の機械の点(固定点・クランクの先・三角の板の角)を 1 つずつつかんで、影の同じ点に重ねよう',

  // ---- 章 2 ステージ 2:脚をふやす ----
  'game.stage.c2-s2.title': '脚をふやす',
  'game.stage.c2-s2.desc':
    '脚が 1 本しかない機械は立っていられない。脚列の複製で脚を増やし、位相をずらして歩かせよう。',
  'game.stage.c2-s2.hint1':
    '脚が 1 本では立っていられない。右の「脚列」で組数を増やし、位相差で脚の動きをずらして、いつも何本かの脚が地面につくようにしよう。',
  'game.stage.c2-s2.hint2': '機構はこのままで大丈夫(影と同じ形)。変えるのは右の「脚列」だけ',
  'game.stage.c2-s2.hint3':
    '脚列を「組数 6・位相差 120°・前後反転した脚も付ける」にしよう。左右と前後の脚が、いつも地面を支える',

  // ---- 章 2 ステージ 3:動かない機械 ----
  'game.stage.c2-s3.title': '動かない機械',
  'game.stage.c2-s3.desc':
    'ヤンセンリンクの機械が、ぴくりとも動かない。余分なリンクを見つけて外し、段を上ろう。',
  'game.stage.c2-s3.hint1':
    '自由度 0 は「動かない」という意味。棒が三角形に組まれると、そこはがっちり固まってしまう。クランクのまわりで三角形になっている所を探そう。',
  'game.stage.c2-s3.hint2':
    'クランクの先から伸びる 2 本の棒。この 2 本の先どうしを結ぶ棒があると、三角形に固まって動かない',
  'game.stage.c2-s3.hint3':
    '影は完成形の上半分。余分なのは、いちばん上の点からほぼ真下へ伸びる長い棒(影にはない)。「削除」を押して、その棒をクリックしよう',

  // ---- 章 2 ステージ 4:溝をまたぐ ----
  'game.stage.c2-s4.title': '溝をまたぐ',
  'game.stage.c2-s4.desc':
    '行く手に溝が 2 つ。歩幅の広い脚なら、落ちずにまたげる。予算は {budget}。',
  'game.stage.c2-s4.hint1':
    '脚先の軌道の平らな底が長いほど、溝をまたげる。2-3 で直したヤンセンリンクの機械や、2-1 の足を高く上げる脚でも越えられる。',
  'game.stage.c2-s4.hint2': '固定点とクランクの位置',
  'game.stage.c2-s4.hint3':
    '完成形(ヤンセンリンク)の上半分。2-3 の機械と同じ形なので、2-3 で「JSON に書き出す」を押し、ここで「JSON を読み込む」と使い回せる',

  // ---- 章 2 ステージ 5:段差の道 ----
  'game.stage.c2-s5.title': '段差の道',
  'game.stage.c2-s5.desc':
    '上り段差、溝、下り段差が続く道。予算 {budget} 以内の機械で {distance}m 先を目指そう。',
  'game.stage.c2-s5.hint1':
    'ヤンセンリンクは高くつく。四節リンクの脚でも、足を高く上げて歩幅を広げれば越えられる。',
  'game.stage.c2-s5.hint2': '固定点とクランクの位置',
  'game.stage.c2-s5.hint3':
    'クランク・脚先・右の固定点の影(2-1 の足を高く上げる脚と同じ形)。2-1 で「JSON に書き出す」を押し、ここで「JSON を読み込む」と使い回せる',
};
