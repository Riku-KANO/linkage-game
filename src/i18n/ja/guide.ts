/** guide モジュールの文言。担当モジュールだけがこのファイルを編集する */
export const guide: Record<string, string> = {
  // ---- 共通 ----
  'guide.close': '閉じる',

  // ---- 遊び方の本(GUIDE-1) ----
  'guide.book.title': '遊び方',
  'guide.book.prev': '前へ',
  'guide.book.next': '次へ',
  'guide.book.done': 'さっそく作る',
  'guide.book.page': '{n} / {total}',
  'guide.book.goto': '{n} ページ目:{title}',
  'guide.book.pages': 'ページ',
  'guide.book.glossary': '用語集',
  'guide.book.keyHint': '← → でページをめくる・Esc で閉じる',
  'guide.book.figure': '図:{title}',
  'guide.book.openShortcuts': '操作一覧を開く',
  'guide.book.allShortcuts': 'ほかの操作は ? キーの操作一覧で見られます。',

  'guide.page.about.title': 'このゲームについて',
  'guide.page.about.p1':
    'アシクミは、棒(リンク)とピンとモーターで「脚のしくみ」を発明して、機械を歩かせるゲームです。',
  'guide.page.about.p2':
    '設計図にかいた 1 本の脚が、奥へ何組も並んで歩く機械になります。段差や溝のあるコースを、ゴールまで歩かせましょう。',
  'guide.page.about.p3':
    '流れは「脚を組む → 動きを見る → 試走する → メダルを見て直す」のくり返し。組んでいる間も機構はずっと動くので、何度でもその場で試せます。',
  'guide.page.about.p4':
    '機構学を知らなくても大丈夫。いじって動かすうちにコツがつかめます。知っていれば、もっと速く強い機械が作れます。',
  'guide.page.about.loop.build': '組む',
  'guide.page.about.loop.watch': '動きを見る',
  'guide.page.about.loop.run': '試走',
  'guide.page.about.loop.improve': '直す',

  'guide.page.link.title': '棒を引いてつなぐ',
  'guide.page.link.p1':
    'リンク道具(L)を選び、点からドラッグすると棒(リンク)が引けます。棒の長さは変わらない、かたい棒です。',
  'guide.page.link.p2':
    '棒の端を別の点に重ねると「カチッ」と吸い付いて、ピンでつながります。ピンのところでは、棒どうしが自由にくるくる回れます。',
  'guide.page.link.p3':
    '棒の途中からドラッグすると、その棒と一体になった点が作れます。脚先を遠くへのばしたいときに便利です。',
  'guide.page.link.p4':
    '長さは右のパネルで数字でも決められます。まちがえたら元に戻す(⌘Z / Ctrl+Z)。',

  'guide.page.crank.title': '固定点とクランク',
  'guide.page.crank.p1':
    '固定点(F)は、機体のフレームに留めた軸受けです。ここは動きません。脚はふつう 2 つ以上の固定点からぶら下げます。',
  'guide.page.crank.p2':
    '固定点についた短い棒をクランク道具(C)でクリックすると「クランク」になります。モーターでぐるぐる回る腕で、機械を動かす力はすべてここから入ります。',
  'guide.page.crank.p3':
    'クランクが回ると、つながった棒が押されたり引かれたりして、脚全体が動きます。クランクが一回転できることが、歩くための第一歩です。',

  'guide.page.dof.title': '自由度 1 で動く',
  'guide.page.dof.p1':
    'クランクを回したとき、ほかの棒の動きが 1 通りに決まれば、機構はきちんと動きます。この「動き方の数」を[[dof|自由度]]といいます。',
  'guide.page.dof.p2':
    '地面も 1 本の棒と数えて、輪になった棒が 4 本なら自由度 1 で動きます。3 本(三角形)だと固まり、5 本だとクランクを止めてもぐらつきます。',
  'guide.page.dof.p3':
    '固まったら棒を 1 本外す、ぐらつくなら棒を 1 本足して支える。画面の「自由度」が 1 になれば OK です。',
  'guide.page.dof.p4':
    '知っていると便利:自由度は棒とピンの数から[[grubler|グリューブラーの式]]で計算できます。',
  'guide.page.dof.cap.ok': '動く:自由度 1',
  'guide.page.dof.cap.locked': '固まる:自由度 0',
  'guide.page.dof.cap.loose': 'ぐらつく:自由度 2',
  'guide.page.dof.sub.ok': '地面+棒 3 本',
  'guide.page.dof.sub.locked': '地面+棒 2 本',
  'guide.page.dof.sub.loose': '地面+棒 4 本',

  'guide.page.path.title': '脚先の軌道を見る',
  'guide.page.path.p1':
    '脚先(A で指定)が 1 回転でえがく線が「軌道」です。設計しているあいだ、ずっと表示されます。',
  'guide.page.path.p2':
    '良い軌道は、底が平らで長く、戻るときに持ち上がる形。平らな底で地面をけって進み、持ち上げて前へ戻します。',
  'guide.page.path.p3':
    '底の長さが「歩幅」、高さが「足上げ」です。段差を越えるには、足上げが段差より高くないといけません。',
  'guide.page.path.p4':
    '地面についた脚先が後ろへ動くと、機械は前へ進みます。後ろ向きに歩くときは、モーターの回転を逆にしましょう。軌道の形は[[couplerCurve|カップラーカーブ]]と呼ばれます。',

  'guide.page.legs.title': '脚を増やす',
  'guide.page.legs.p1':
    '脚列の設定で、同じ脚を奥へ何組も並べられます(第 2 章から)。組ごとにクランクの角度をずらすのが「位相差」です。',
  'guide.page.legs.p2':
    '位相をずらすと、いつもどれかの脚が地面について、なめらかに歩けます。3 組を 120° ずつずらすのが定番です。',
  'guide.page.legs.p3':
    '機械が立っていられるのは、地面についた脚先が手前と奥に広がっているとき。脚が一列に並ぶと横に倒れます。「前後反転した脚」も付けると安定します。',
  'guide.page.legs.p4': 'くわしくは[[legPhase|脚列と位相]]。',
  'guide.page.legs.side': '横から:3 組を 120° ずらす',
  'guide.page.legs.front': '前から',

  'guide.page.run.title': '試走とメダル',
  'guide.page.run.p1':
    '「試走」を押すと、3D のコースで機械が歩きます。転ばずに、制限時間内にゴールへ着けばクリアです。',
  'guide.page.run.p2': '記録は 4 つの点で見ます。それぞれに金・銀・銅のメダルがあります。',
  'guide.page.run.p3':
    '正解は 1 つではありません。速さを狙うか、少ない部品で作るか、省エネを狙うかで、ちがう機械が生まれます。',
  'guide.page.run.p4':
    '失敗しても、転んだ瞬間と理由が見られます。ワンクリックで設計に戻って直しましょう。',
  'guide.page.run.axis.time': '時間:ゴールまでの速さ',
  'guide.page.run.axis.parts': '部品数:少ないほど良い',
  'guide.page.run.axis.cost': 'コスト:安く作る',
  'guide.page.run.axis.energy': 'エネルギー:省エネで歩く',

  'guide.page.keys.title': '操作一覧',
  'guide.page.keys.p1': 'よく使う操作です。全部の一覧は、いつでも ? キーで開けます。',

  // ---- 図の中のラベル ----
  'guide.fig.fixed': '固定点',
  'guide.fig.crank': 'クランク',
  'guide.fig.motor': 'モーター',
  'guide.fig.pin': 'ピン',
  'guide.fig.snap': 'カチッ',
  'guide.fig.seconds': '{s} 秒',
  'guide.fig.foot': '脚先',
  'guide.fig.path': '軌道',
  'guide.fig.contact': '接地',
  'guide.fig.stride': '歩幅 {cm} cm',
  'guide.fig.lift': '足上げ {cm} cm',
  'guide.fig.forward': '進む向き',
  'guide.fig.start': 'スタート',
  'guide.fig.goal': 'ゴール',
  'guide.fig.hold': '止めても…',
  'guide.fig.stuck': '回らない',
  'guide.fig.tips': '倒れる',
  'guide.fig.stands': '立てる',
  'guide.fig.oneRow': '一列',
  'guide.fig.spread': '手前と奥',
  'guide.fig.dead': '死点',
  'guide.fig.noReach': '届かない',
  'guide.fig.special': '自由度 0 なのに動く',
  'guide.fig.formula': '3×({n}−1) − 2×{j} = {dof}',
  'guide.fig.count': '棒 {n}(地面を含む)・ピン {j}',
  'guide.fig.grashof': 's + l = {sl} ≤ p + q = {pq}',
  'guide.fig.rocker': '揺れる',
  'guide.fig.turns': '一回転',
  'guide.fig.coupler': 'カップラー',
  'guide.fig.phase': '{deg}°',
  'guide.fig.medal.gold': '金',
  'guide.fig.medal.silver': '銀',
  'guide.fig.medal.bronze': '銅',

  // ---- 用語集(GUIDE-2) ----
  'guide.glossary.title': '用語集',
  'guide.glossary.list': '用語の一覧',
  'guide.glossary.inGame': 'ゲームでは',
  'guide.glossary.related': '関連',
  'guide.glossary.intro': '知らなくても遊べますが、知っていると設計がぐっと楽になる言葉です。',
  'guide.term.open': '「{name}」の説明',

  'guide.term.dof.name': '自由度',
  'guide.term.dof.reading': 'じゆうど',
  'guide.term.dof.short': '機構の動き方が何通りあるかを表す数。',
  'guide.term.dof.body':
    'クランクの回転も 1 と数えます。1 なら、クランクの角度だけで全部の棒の位置が決まり、きちんと動きます。0 以下だと固まって動かず、2 以上だとクランクを止めても形が決まらず、ぐらつきます。',
  'guide.term.dof.play':
    '画面の「自由度」が 1 になるまで、棒を足したり外したりしよう。固まったら外す、ぐらつくなら足す。',

  'guide.term.grubler.name': 'グリューブラーの式',
  'guide.term.grubler.reading': 'グリューブラーのしき',
  'guide.term.grubler.short': '棒とピンの数から自由度を計算する式。',
  'guide.term.grubler.body':
    '自由度 = 3 ×(棒の数 − 1)− 2 × ピンの数。地面(フレーム)も棒 1 本と数えます。平面の棒は 1 本で「左右・上下・回転」の 3 つの動きを持ち、ピン 1 か所でそのうち 2 つが止まる、という考え方です。',
  'guide.term.grubler.play':
    '両端を今ある点につなぐ棒を 1 本足すと、自由度は 1 減ります(棒で +3、ピン 2 か所で −4)。',

  'guide.term.grashof.name': 'グラスホフの条件',
  'guide.term.grashof.short': '四節リンクのどれかの棒が一回転できるかを、長さだけで見分ける条件。',
  'guide.term.grashof.body':
    '地面を含む 4 本の棒のうち、いちばん短いものを s、いちばん長いものを l、残りを p と q とします。s + l ≤ p + q なら、どれかの棒が一回転できます。クランクを一回転させたいなら、さらにクランクをいちばん短くします。',
  'guide.term.grashof.play':
    '「クランクが一回転できない」と出たら、まずクランクを短くしてみよう。いちばんの近道です。',

  'guide.term.crankRocker.name': 'てこクランク機構',
  'guide.term.crankRocker.reading': 'てこクランクきこう',
  'guide.term.crankRocker.short':
    'クランクが一回転し、向かいの棒(てこ)が行ったり来たり揺れる四節リンク。',
  'guide.term.crankRocker.body':
    'グラスホフの条件を満たし、クランクがいちばん短いとこの形になります。モーターの回転を、往復の揺れに変える機構です。歩く脚の基本の形でもあります。',
  'guide.term.crankRocker.play':
    '第 1 章の脚はほとんどこれ。クランクとてこをつなぐ棒(カップラー)をのばした先を脚先にします。',

  'guide.term.deadPoint.name': '死点',
  'guide.term.deadPoint.reading': 'してん',
  'guide.term.deadPoint.short': '2 本の棒が一直線に並び、動く向きが定まらなくなる姿勢。',
  'guide.term.deadPoint.body':
    '棒が一直線に並ぶと、つっぱって力が伝わりにくくなったり、どちらへ曲がるか迷ったりします。設計ビューでは、軌道の上の × 印と赤い帯で知らせます。',
  'guide.term.deadPoint.play':
    '死点の近くでは機械がひっかかりやすくなります。棒の長さを少し変えて、一直線に並ばないようにしよう。',

  'guide.term.couplerCurve.name': 'カップラーカーブ',
  'guide.term.couplerCurve.short':
    'クランクとてこをつなぐ中間の棒(カップラー)の上の点が、1 回転でえがく曲線。',
  'guide.term.couplerCurve.body':
    '同じ四節リンクでも、点の場所しだいで、卵形、三日月形、8 の字など、いろいろな形になります。脚先の軌道は、このカップラーカーブです。',
  'guide.term.couplerCurve.play':
    '脚先の位置を少し動かすだけで、底の平らさや足上げが大きく変わります。いろいろ試してみよう。',

  'guide.term.legPhase.name': '脚列と位相',
  'guide.term.legPhase.reading': 'あしれつといそう',
  'guide.term.legPhase.short':
    '同じ脚を奥へ並べること(脚列)と、組ごとにクランクの角度をずらすこと(位相)。',
  'guide.term.legPhase.body':
    '3 組を 120° ずつずらすと、1 回転のあいだに 3 本の脚が順番に地面をけります。ずらさないと、全部の脚が同時に浮いて機械がはねてしまいます。',
  'guide.term.legPhase.play':
    '脚先が地面についている割合が 1/3 くらいなら、3 組を 120° ずつずらすのがちょうどいい。',

  'guide.term.notAssemblable.name': '組立不能',
  'guide.term.notAssemblable.reading': 'くみたてふのう',
  'guide.term.notAssemblable.short': '棒が届かず、その角度では機構が組み立てられない状態。',
  'guide.term.notAssemblable.body':
    'クランクが長すぎたり、ほかの棒が短すぎたりすると、ある角度で 2 本の棒の端が出会えなくなります。そこでクランクが止まり、一回転できません。設計ビューでは、届かない棒が赤く震えます。',
  'guide.term.notAssemblable.play': 'クランクを短くするか、届かない棒を長くしよう。',

  'guide.term.specialGeometry.name': '特殊な寸法(平行四辺形)',
  'guide.term.specialGeometry.reading': 'とくしゅなすんぽう',
  'guide.term.specialGeometry.short':
    '式では動かないはずなのに、寸法がそろっているおかげで動く機構。',
  'guide.term.specialGeometry.body':
    '平行な棒を 3 本並べた「二重平行四辺形」は、グリューブラーの式では自由度 0 ですが、長さがぴったりそろっているので動けます。少しでも長さがずれると固まってしまう、もろい動きです。',
  'guide.term.specialGeometry.play':
    '「特殊な寸法で動く」と出たら、長さを変えたときに固まらないか気をつけよう。',

  // ---- 操作一覧(GUIDE-3) ----
  'guide.keys.title': '操作一覧',
  'guide.keys.note': '設計ビューを選んでいるときに使えます。',
  'guide.keys.or': 'または',
  'guide.keys.group.tool': '道具',
  'guide.keys.group.edit': '編集',
  'guide.keys.group.view': '表示・動き',
  'guide.keys.group.pointer': 'マウス',
  'guide.keys.group.help': 'ヘルプ',
  'guide.keys.tool.select': '選択・移動',
  'guide.keys.tool.link': 'リンク:点からドラッグして棒を引く',
  'guide.keys.tool.fixed': '固定点を置く・外す',
  'guide.keys.tool.crank': 'クランクにする',
  'guide.keys.tool.foot': '脚先を決める',
  'guide.keys.tool.delete': '削除の道具',
  'guide.keys.undo': '元に戻す',
  'guide.keys.redo': 'やり直し',
  'guide.keys.copy': 'コピー',
  'guide.keys.cut': '切り取り',
  'guide.keys.paste': '貼り付け',
  'guide.keys.selectAll': 'すべて選択',
  'guide.keys.delete': '選んだ部品を削除',
  'guide.keys.mirror': '左右反転',
  'guide.keys.escape': '取り消し・選択解除・選択の道具へ',
  'guide.keys.nudge': '選んだ点を 1 cm 動かす',
  'guide.keys.nudgeFar': '選んだ点を 10 cm 動かす',
  'guide.keys.togglePlay': '再生・停止',
  'guide.keys.step': 'クランクを 5° ずつ回す',
  'guide.keys.stepFar': 'クランクを 15° ずつ回す',
  'guide.keys.fit': '全体を表示',
  'guide.keys.pointer.pan': '図を動かす',
  'guide.keys.pointer.zoom': '拡大・縮小',
  'guide.keys.pointer.addSelect': '選択に追加',
  'guide.keys.pointer.noSnap': '吸い付けずに置く',
  'guide.keys.help': 'この一覧を開く',
  'guide.keys.cap.drag': 'ドラッグ',
  'guide.keys.cap.rightDrag': '右ドラッグ',
  'guide.keys.cap.middleDrag': '中ボタン',
  'guide.keys.cap.wheel': 'ホイール',
  'guide.keys.cap.click': 'クリック',

  // ---- 状況に応じた一言(GUIDE-4) ----
  'guide.tip.label': 'ひとこと',
  'guide.tip.dismiss': 'この一言を閉じる',
  'guide.tip.severity.info': 'ヒント',
  'guide.tip.severity.warn': '注意',
  'guide.tip.severity.error': '動きません',
  'guide.tip.empty':
    'まずは固定点(F)を 2 つ置いて、リンク道具(L)で固定点からドラッグして棒を引いてみよう。棒の端を別の点に重ねると、ピンでつながります。',
  'guide.tip.emptyShort': '固定点(F)を置いて、リンク道具(L)で棒を引こう。',
  'guide.tip.noFixed':
    '固定点がありません。固定点の道具(F)で点をクリックすると、機体のフレームに留められます。まずは 2 つがおすすめ。',
  'guide.tip.noCrank':
    'クランクがありません。クランク道具(C)で、固定点についた短い棒をクリックすると、モーターで回る腕になります。',
  'guide.tip.floating':
    'どこにもつながっていない棒があります。端を別の点に重ねて、ピンでつなごう。',
  'guide.tip.dofLoose':
    '[[dof|自由度]]が {dof} で、ぐらつきます。両端を今ある点につなぐ棒を {need} 本足して、動きを 1 通りに決めよう。',
  'guide.tip.dofLocked':
    '[[dof|自由度]]が {dof} で、固まって動きません。赤い棒のあたりから {extra} 本外そう。',
  'guide.tip.noFullRotation':
    'クランクが一回転できません。赤い棒が[[notAssemblable|届かない角度]]があります。クランクを短くするか、届かない棒を長くしよう。',
  'guide.tip.noFullRotationGrashof':
    'クランクが一回転できません。[[grashof|グラスホフの条件]]で考えると、クランク({crank} cm)を {max} cm より短くすれば回りそうです。',
  'guide.tip.noFoot': '動きました!次は脚先の道具(A)で、地面をける点をクリックして脚先を決めよう。',
  'guide.tip.footNotLowest':
    '脚先より下を通る点があり、そこが先に地面に当たってしまいます。脚先がいちばん下を通るようにしよう。',
  'guide.tip.walksBackward': 'このままだと後ろへ歩きます。モーターの回転の向きを逆にしよう。',
  'guide.tip.lowLiftStep':
    'このコースには {step} cm の段差があります。足上げが {lift} cm しかないので、つまずきそうです。軌道を縦に大きくしよう。',
  'guide.tip.fallen': '転んでしまいました。軌道の底を平らにすると、機体がゆれにくくなります。',
  'guide.tip.fallenLegs':
    '転んでしまいました。脚列を増やして[[legPhase|位相]]をずらし、手前と奥の両方で支えよう。',
  'guide.tip.timeout': '時間切れでした。モーターの回転数を上げるか、歩幅を広げて速く歩こう。',
  'guide.tip.stalled': 'モーターの力が足りず止まりました。回転数を下げるか、クランクを短くしよう。',
  'guide.tip.lowLift':
    '足上げが {lift} cm しかなく、戻るときに脚先が地面をこすります。軌道がもっと持ち上がる形を探そう。',
  'guide.tip.noFlat':
    '軌道の底が丸く、歩くと機体が上下にゆれます(ゆれ {flat} cm)。脚先の位置を変えて、底が平らな[[couplerCurve|軌道]]を探そう。',
  'guide.tip.special':
    '[[specialGeometry|特殊な寸法]]のおかげで動いています。長さを少し変えると固まるので気をつけよう。',

  // ---- はじめての方へ ----
  'guide.welcome.title': 'はじめての方へ',
  'guide.welcome.body':
    '棒とモーターで脚のしくみを発明して、機械を歩かせるゲームです。機構学を知らなくても、動かしながら試せば大丈夫。まずはチュートリアルで、10 分ほどで最初の 1 歩を歩かせてみましょう。',
  'guide.welcome.tutorial': 'チュートリアルから始める',
  'guide.welcome.howTo': '遊び方を見る',
  'guide.welcome.later': 'あとで',

  // ---- 開発用プレイグラウンド(?dev=guide) ----
  'guide.dev.title': '遊び方・用語・一言(開発用)',
  'guide.dev.openBook': '遊び方の本を開く',
  'guide.dev.startPage': '開くページ',
  'guide.dev.openGlossary': '用語集を開く',
  'guide.dev.openSheet': '操作一覧を開く(? キー)',
  'guide.dev.welcome': '「はじめての方へ」を出す',
  'guide.dev.reducedMotion': '動きを減らす',
  'guide.dev.mac': 'Mac のキー表記',
  'guide.dev.tipDemo': '状況の一言',
  'guide.dev.sample': '見本の設計',
  'guide.dev.stage': 'ステージ',
  'guide.dev.stageNone': '(なし)',
  'guide.dev.event': '直前の試走',
  'guide.dev.eventNone': '(なし)',
  'guide.dev.event.fallen': '転倒',
  'guide.dev.event.timeout': '時間切れ',
  'guide.dev.event.stalled': 'トルク不足',
  'guide.dev.noTip': '言うことはありません(良い設計です)',
  'guide.dev.log': '呼ばれたコールバック',
  'guide.dev.termDemo': '文中の用語:',
  'guide.dev.termList':
    '[[dof|自由度]]・[[grubler]]・[[grashof]]・[[crankRocker]]・[[deadPoint]]・[[couplerCurve]]・[[legPhase]]・[[notAssemblable]]・[[specialGeometry]]',
  'guide.dev.reverse': '回転を逆にする',
  'guide.dev.sample.blank': '白紙',
  'guide.dev.sample.noFixed': '棒だけ(固定点なし)',
  'guide.dev.sample.noCrank': '四節(クランクなし)',
  'guide.dev.sample.five': '五節リンク(ぐらつく)',
  'guide.dev.sample.triangle': '三角形(固まる)',
  'guide.dev.sample.longCrank': '長すぎるクランク',
  'guide.dev.sample.noFoot': '四節(脚先なし)',
  'guide.dev.sample.footHigh': '脚先が上すぎる',
  'guide.dev.sample.backward': '四節の見本(後ろ向き)',
  'guide.dev.sample.chebyshev': 'チェビシェフ(底が丸い)',
  'guide.dev.sample.parallelogram': '二重平行四辺形',
  'guide.dev.sample.basic': '章 1 の脚(足上げ 12cm)',
  'guide.dev.sample.good': '良い脚',
  'guide.dev.sample.jansen': 'ヤンセン',
};
