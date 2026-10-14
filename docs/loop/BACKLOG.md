# BACKLOG

状態:`todo` / `doing` / `done` / `blocked`。ストリーム = ワークツリー名(`.worktrees/<stream>`、ブランチ `feat/<stream>`)。
受け入れ条件はテストか、プレイグラウンドでの目視確認で判定する。

## マイルストーン

1. **プロトタイプ** — 運動学ソルバーと 2D 設計ビュー。チェビシェフ・ヤンセンの脚先軌道が既知の形
2. **歩行** — 3D 試走ビューと動力学。ヤンセン型が平地を転ばずに歩く(ヤンセン型・チェビシェフ型・不格好な自作機構の 3 種で安定性を検証)
3. **ゲーム化** — 章 1・2、評価、保存、共有、ホーム画面と画面遷移。初見で 10 分以内に最初の歩行
4. **公開** — Cloudflare Pages

---

## ウェーブ 0(main、オーケストレーター) — done

| ID | 内容 | 状態 |
| --- | --- | --- |
| W0-1 | Vite + React + TS + R3F + Vitest + pnpm の雛形、検証ゲート `pnpm verify`、`scripts/wt.sh` | done |
| W0-2 | 契約:DesignDoc、sim/game の型、デザイントークン、アプリ状態、i18n | done |
| W0-3 | 運動学ソルバーの核(S-01 解析解+ニュートン法、S-02 組立モードの連続性)、プリセット(ヤンセン・チェビシェフ・四節) | done |
| W0-4 | 部品のコスト・重量(E-07 の集計関数)、脚列の配置と反転(E-06 の計算) | done |

## ウェーブ 1(並行 5 ストリーム)

### stream `kinematics` — `src/core/kinematics`(解析と性能)

| ID | 要件 | 内容 | 受け入れ条件 | 状態 |
| --- | --- | --- | --- | --- |
| KIN-1 | E-05 | グラスホフ判定:クランクを含む四節ループを検出し `GrashofResult` を返す | 四節リンク各型(てこクランク・両クランク・両てこ・変位点)をテストで分類できる。ヤンセンの第 1 ループがてこクランク | done |
| KIN-2 | E-05 | 死点(slack 小)と組立不能の原因リンク・ジョイントの特定、メッセージ | 届かない四節で原因リンクが `problemLinks` に入る。死点付近の角度が `deadPoints` に出る | done |
| KIN-3 | E-04 | 自由度 0/2 以上のとき、過拘束・ぐらつく部分のリンクを特定 | 三角形で固めた四節は過拘束リンクを返す。五節はぐらつく側を返す | done |
| KIN-4 | S-04 | クランク角に対する各点の速度(∂p/∂θ)を返す `poseDerivative` | 解析解(四節のクランクピン)と一致、数値微分と 1e-4 以内 | done |
| KIN-5 | 非機能 | 性能:複製後 100 ジョイントで 1 フレーム 4ms 以内。`analyzeMechanism` 180 サンプルで 10ms 以内 | ベンチマークテスト(緩めの閾値で CI でも安定) | done |
| KIN-6 | E-03 | 軌道の指標:歩幅、足上げ高さ、接地区間の平らさ、デューティ比 | ヤンセンで歩幅 > 35cm、平らさ < 0.5cm | done |

### stream `model` — `src/core/model`(保存・共有・互換)

| ID | 要件 | 内容 | 受け入れ条件 | 状態 |
| --- | --- | --- | --- | --- |
| MOD-1 | 非機能 | `validateDesign(unknown)`:型検査・正規化(範囲外の rpm など)。外部ライブラリなし | 壊れた JSON・型違い・存在しない参照を拒否し、理由を返す | done |
| MOD-2 | 非機能 | バージョン番号つき封筒と移行 `migrate()`。古い版を読めること | 合成した v0 データを v1 に移行するテスト | done |
| MOD-3 | U-02 | 共有リンク:設計(+任意でスコアとゴースト)を JSON → lz-string → URL フラグメント | 往復で一致。ヤンセン見本機の URL が 2000 文字未満。ゴースト(10Hz、量子化)込みでも 6000 文字未満 | done |
| MOD-4 | U-03 | JSON ファイルの書き出し・読み込み | 往復一致。読み込みは validate を通る | done |
| MOD-5 | U-01 | localStorage 自動保存(設計・進行・設定)。容量超過や破損に強い。debounce | 破損データでも落ちずに既定値。キーにバージョン | done |

### stream `editor` — `src/editor`, `src/dev/EditorPlayground.tsx`, `src/i18n/ja/editor.ts`

| ID | 要件 | 内容 | 受け入れ条件 | 状態 |
| --- | --- | --- | --- | --- |
| ED-1 | E-02 | SVG の設計ビュー:パン・ズーム、グリッド、スナップ、y 上向き | `?dev=editor` で操作できる | done |
| ED-2 | E-01, E-02 | 道具:選択・移動、リンク(端点同士をつなぐとピン)、固定点、クランク、脚先指定、削除、長さの数値入力 | 白紙から四節を組める。編集操作の純関数テスト | done |
| ED-3 | E-03 | 編集中も機構が動き、脚先軌道を線で描く。クランク角スライダ、再生・停止 | ドラッグ中も軌道が追従 | done |
| ED-4 | E-04, E-05 | 自由度バッジ、問題リンクを赤く震わせる、グラスホフ結果とメッセージ表示 | `analyzeMechanism` の結果をそのまま表示 | done |
| ED-5 | E-06 | 脚列の設定 UI(組数、位相差、間隔、前後反転)と位相のプレビュー | 設定が DesignDoc に入る | done |
| ED-6 | E-07 | 部品数・コスト・重量の表示(`computeBill`)、予算超過の警告 | | done |
| ED-7 | E-08 | 元に戻す・やり直し、範囲選択、コピー・貼り付け、左右反転、キーボードショートカット | 履歴・反転の純関数テスト | done |
| ED-8 | マイクロ | 吸い寄せ+はまる瞬間の揺れと `playSfx('snap')`、自由度が 1 になった瞬間に一度だけ試しに動く | | done |

### stream `sim` — `src/core/sim`, `src/dev/SimPlayground.tsx`

| ID | 要件 | 内容 | 受け入れ条件 | 状態 |
| --- | --- | --- | --- | --- |
| SIM-1 | 決定事項 | 地形:`TerrainSpec` から Rapier のコライダーを作り `TerrainCollider` を実装。テスト用の平面版 | 箱・坂・地面で深さと法線が正しい | done(地面・箱は Rapier、坂は float32 の凸包だと面の近くで法線が乱れるため JS の倍精度の角柱で厳密に解く) |
| SIM-2 | S-03 | 機体剛体(質量・慣性は `PART_SPECS` から)、脚列(`legInstances`/`mirrorDesignX`)、接触(ばね・ダンパー+クーロン摩擦)、240Hz | 静止した機体が地面に落ち着く(めり込み < 1cm、跳ねない) | done(接触力は機体 6 自由度と同時に陰的に解く。静止時のめり込み 3.5mm) |
| SIM-3 | S-04 | モーター:負荷トルク(仮想仕事)、直線的なトルク-回転数特性、停動 | トルク上限を下げると止まる。上り坂で遅くなる | done(勾配 0.15 で 15.5m → 9.0m/20 秒。60N·m で段差 8cm、150N·m で 12cm を越える) |
| SIM-4 | S-05 | 決定論:同じ入力で 2 回走らせてビット単位で一致 | テスト | done |
| SIM-5 | M2 | **受け入れ**:ヤンセン見本機が平地を 20 秒で 2m 以上、転ばずに進む。チェビシェフ型と不格好な自作機構で NaN・発散なし | テスト | blocked(物理側は完了。見本機 `jansenWalker()` は片側 6 脚で接地が前後 1 本ずつ=支持が線になり 1.7 秒で転ぶ(物理的に正しい)。同じ脚を左右に置いた両側 12 脚 `jansenTwoSided()` は 15.5m/20 秒・傾き 0.7°。見本機プリセットを両側にする変更待ち。チェビシェフ型・四節は NaN・発散なし) |
| SIM-6 | | ヘッドレス実行 `runHeadless`(評価用)。30 秒分が Node で 1 秒以内 | ベンチマーク | done(30 秒:片側 6 脚 35ms、両側 12 脚 66ms) |
| SIM-7 | S-07 | 可視化用の値(接地、重心投影、トルク)をスナップショットに入れる。デバッグ用の 2D 側面ビュー(`?dev=sim`) | 目視 | done(スナップショットに comGround・tilt を追加。プレイグラウンドは jsdom のスモークテストのみで、ブラウザでの目視は未実施) |

### stream `scene` — `src/scene`, `src/app/App.tsx`, `src/dev/ScenePlayground.tsx`, `src/i18n/ja/scene.ts`

| ID | 要件 | 内容 | 受け入れ条件 | 状態 |
| --- | --- | --- | --- | --- |
| SC-1 | 素材 | 夕暮れの工房ジオラマ(GLB があれば読み、なければ手続き生成のジオメトリ) | `?dev=scene` で表示 | done |
| SC-2 | 遷移 | カメラリグ:画面ごとの定位置、ばね補間とトークンのイージング、割り込み・スキップ、透視⇄平行投影の連続補間 | 遷移中 60fps。補間の純関数テスト | done |
| SC-3 | T-00〜T-08 | `useApp` の画面状態に連動した遷移(初回/2 回目以降の時間、戻るは逆再生の短縮版、クリック・キーでスキップ、reduced-motion は 0.3 秒フェード) | 状態遷移のテスト | done |
| SC-4 | ホーム | 工房の物体がメニュー(作業台・コース模型・棚・窓の外・工具箱)、ホバーで輪郭が光り小さな機構が動きラベルが浮く、呼吸する揺れと視差、端のテキストメニュー(キーボード可) | 目視 | done |
| SC-5 | ホーム | 作業台の上でヤンセン型の見本機が歩く(運動学のみ) | 目視 | done |
| SC-6 | 非機能 | 低性能モード(影・DoF・ブルームなし、揺れ停止)、初回に GPU 性能を測って自動選択 | 判定の純関数テスト | done |

### stream `game` — `src/game`, `src/i18n/ja/game.ts`(ウェーブ 1 に前倒し:契約だけに依存)

| ID | 要件 | 内容 | 受け入れ条件 | 状態 |
| --- | --- | --- | --- | --- |
| GAME-1 | 章 1・2 | ステージデータ(章 1 はじめの一歩 5、章 2 段差を越える 5)。章 1 は壊れた機械を直す課題から | 全ステージの設計・地形・メダル基準・文言キーを検査するテスト | done(メダル基準・制限時間は仮。sim 統合後に参考解をヘッドレス試走して調整) |
| GAME-2 | 評価 | 試走前チェック `preflight`(自由度≠1 はエラー等)と `evaluateRun`(クリア条件、4 軸スコア、金銀銅) | 純関数テスト | done |
| GAME-3 | 進行 | クリアで章と部品を解放、最高記録の更新(`Progress` のリデューサー) | 純関数テスト | done |
| GAME-4 | 決定事項 | 3 段階ヒント(方針の一言、部品配置の影、完成形の一部)の出し方 | | done |
| GAME-5 | U-05 | チュートリアル(章 1 の最初の 3 ステージ)のステップ進行エンジン | 純関数テスト | done |
| GAME-6 | 結果 | 失敗理由の判定(トルク不足、重心が高い、転倒、時間切れ、機構が詰まった) | 純関数テスト | done(「重心が高い」の角度しきい値 15° は仮) |

### stream `audio` — `src/audio`

| ID | 要件 | 内容 | 受け入れ条件 | 状態 |
| --- | --- | --- | --- | --- |
| AU-1 | 効果音 | Web Audio のエンジン(初回操作でアンロック、音量、ミュート)。`registerSfx` で `sfx.ts` に登録 | 偽の AudioContext でアンロック・音量・ミュート・発音数制限・タブ裏での停止をテスト。`installAudio()` は冪等、Node では何もしない | done |
| AU-2 | 効果音 | 金属と木の機械音を合成で作る(snap, press, release, error, whoosh, gear, stamp, step, success)。音声ファイルなし | パラメータ写像のテスト。`?dev=audio` で試聴 | done |
| AU-3 | 効果音 | モーターのうなり(rpm と負荷で変化) | rpm → 音程・負荷 → ざらつきの写像テスト、滑らかな追従(setTargetAtTime)。`?dev=audio` で試聴 | done |

## ウェーブ 2a(前倒し:契約だけに依存するもの)

### stream `testrun` — `src/testrun`, `src/dev/TestrunPlayground.tsx`, `src/i18n/ja/testrun.ts`

| ID | 要件 | 内容 | 受け入れ条件 | 状態 |
| --- | --- | --- | --- | --- |
| TR-1 | 試走 | 機体の 3D 描画(リンク・ピン・胴体・クランク、インスタンシング、毎フレーム ref 更新) | 任意の R3F Canvas に置ける | done |
| TR-2 | 試走 | 地形の描画(TerrainSpec の箱・坂・地面、スタートとゴールの印、距離の目盛り) | | done |
| TR-3 | 試走 | ばね付きの追従カメラ、転倒の瞬間の自動スロー | 純関数テスト | done |
| TR-4 | S-06 | 時間操作(再生・一時停止・スロー・早送り・リセット)と 240Hz 固定ステップの時計 | 純関数テスト | done |
| TR-5 | S-07 | 可視化:脚先軌道の軌跡、接地区間、重心の投影点、クランクトルク | | done |
| TR-6 | 試走 | ゴースト(前回の試走・共有相手)を半透明で並走 | | done |
| TR-7 | U-04 | 試走中の設計ビュー縮小版(読み取り専用の小さな 2D 図) | | done |

### stream `result` — `src/result`, `src/ui/mech`, `src/dev/ResultPlayground.tsx`, `src/i18n/ja/result.ts`

| ID | 要件 | 内容 | 受け入れ条件 | 状態 |
| --- | --- | --- | --- | --- |
| RS-1 | 結果 | 4 軸スコアの歯車式メーター(回って止まる)とメダルのプレス刻印 | タイムライン・歯車・ドラムの純関数テスト、`ResultPanel` のスモークテスト(順に止まる・刻印・スキップ・短縮版・動きの軽減)。`?dev=result` で目視 | done |
| RS-2 | 結果 | 成功・失敗の見出し、失敗理由の一言、ワンクリックで設計に戻る・次へ・再挑戦 | スモークテスト(見出し・理由キー・転倒の再生・各コールバック・主な行動へのフォーカス) | done |
| RS-3 | U-02 | 共有リンクのコピー、相手の記録との比較表示 | コピーした URL が decodeShare で往復する、コピー失敗時は選択できる欄。軸ごとの勝敗(`compareRuns`)の純関数テスト | done |
| RS-4 | 設計原則 3 | 機構で動く UI 部品(リンクで沈むボタン、歯車メーター、プレス)を `src/ui/mech` に | `LinkButton`・`GearMeter`・`PressStamp`・`LinkagePanel`。計算(歯車列・ドラム・スライダークランク・伸縮リンク・ばね)の純関数テストと部品のスモークテスト | done |

### stream `tuning` — `src/game`(ステージの実機調整)

| ID | 内容 | 受け入れ条件 | 状態 |
| --- | --- | --- | --- |
| TUNE-1 | 全ステージの参照解が本物の sim(Rapier 地形)でクリアできること。脚列を両側配置へ(`STANDARD_LEGS` は片側 3 組で倒れる) | 受け入れテスト:参照解 10 本すべて cleared | done — `STANDARD_LEGS` = 6 組×120°×12cm×前後反転(12 脚、見本機と同じ両側配置)。`highStepLeg` を段差に強い寸法に変更(14cm の段差でスタート位相 16/16 合格)。c2-s2・c2-s3・c2-s5 の地形を調整。`stages.sim.test.ts`(ずらしたスタートでも 6 中 5 以上) |
| TUNE-2 | 各ステージの「最初の設計」が意図どおり失敗すること(壊れた機械は動かない、低い脚は段差で止まる、1 脚は倒れる、詰まった機械は jammed) | 受け入れテスト | done — `stages.sim.test.ts`。失敗理由に `stumbled`(段差につまずいた)を追加(FailCause への追加のみ) |
| TUNE-3 | メダル基準・制限時間・予算を参照解の実測から導く校正スクリプト(再実行で更新できる) | 金は参照解を少し上回る程度、銅は初心者が届く程度 | done — `src/game/calibrate.ts` と `pnpm calibrate`(実測と校正値の表)。値は stages.ts に書き込み、`calibrate.test.ts` が 15% を超えるずれで失敗 |

## ウェーブ 2b(前倒し:3D に依存しない統合部分)

### stream `flow` — `src/app/flow`, `src/dev/FlowPlayground.tsx`, `src/i18n/ja/flow.ts`

| ID | 内容 | 受け入れ条件 | 状態 |
| --- | --- | --- | --- |
| FLOW-1 | セッション状態(進行・設定の保存と読み込み、ステージごとの設計の自動保存) | 偽の Storage で純関数・ストアのテスト | done(`useSession`/`createSessionStore`。設定は音量・動きの軽減・低性能モードを項目ごとに検査して保存。保存の失敗は通知 1 件に集約。selector は同じ参照を返す) |
| FLOW-2 | 試走のライフサイクル:試走前チェック → 地形と sim の生成 → 評価・失敗診断 → 記録・解放の通知、前回の試走のゴースト | ヘッドレスで「参照解でクリア → 次が解放」のテスト | done(`LiveRun`:240Hz 固定ステップ、ゴール・転倒・詰まり・停動 2 秒・制限時間で終了。ライブ(不規則なフレーム・速度変更・一時停止)とヘッドレスがビット単位で一致、sim の runHeadless とも一致。comHeight はスタート時の直立姿勢の重心高さ。転倒の瞬間の再生は決定論で走らせ直す) |
| FLOW-3 | 共有リンクで起動:設計を読み込み、相手の記録とゴーストを対戦相手にする | テスト | done(記録のステージが解放済みならそのステージ、未解放・記録なしはサンドボックス。壊れたリンクは通知して無視。どちらもフラグメントを消す) |
| FLOW-4 | チュートリアルとヒントの状態(エディタの変更を見て進める) | テスト | done(試走前チェックはチュートリアルで渡した部品ではなくステージの部品で行う。最初から置いてある固定点・クランクで止めないため) |
| FLOW-5 | JSON の書き出し・読み込みの操作(U-03) | | done |
| FLOW-6 | `?dev=flow`:3D なしで遊べる通しのループ(ステージ選択 → 設計 → 2D 側面の試走 → 結果 → 次) | 目視 | done(jsdom の通しスモークテストのみ。ブラウザでの目視は未実施) |

### stream `hud` — `src/hud`, `src/dev/HudPlayground.tsx`, `src/i18n/ja/hud.ts`

| ID | 内容 | 受け入れ条件 | 状態 |
| --- | --- | --- | --- |
| HUD-1 | 設計画面の枠:ステージ名・課題・制限、試走ボタンと試走前チェックの一覧、ヒント 3 段階、チュートリアルの吹き出し | props だけで動く表示部品。スモークテスト | done(StageHeader・BudgetMeter・TestRunButton・HintPanel・TutorialBubble。置き場は HudDock(画面の端、中央は空ける)、見出しとヒントはたためる。エラーがあると試走せず、押すと最初のエラーを onHighlight。ブラウザでの目視は未実施) |
| HUD-2 | ステージ選択の一覧(章・解放状態・最高メダル、キーボード操作) | | done(StageSelectPanel:章 × ステージの格子を矢印・Home/End・Enter・Esc で操作、読み上げ名、「次」の強調、軸ごとのメダルの粒、下の欄に課題と最高記録。ホームの TextMenu と homeMenuItems) |
| HUD-3 | 設定パネル(音量・ミュート・動きを減らす・低性能モード・進行のリセット・JSON 入出力) | | done(SettingsPanel。値は HudSettings(AppSettings にミュートを足した形)で受け取り onChange で返す。OS で動きを減らしているときはオンで固定。リセットは 2 段階で 8 秒で戻る) |
| HUD-4 | 通知(章・部品の解放、保存の失敗、共有リンクの読み込み) | | done(NoticeStack:自動で消え、ホバー・フォーカス中は止まる。エラーは閉じるまで残る(role=alert)。解放は歯車と錠の飾り。列は呼び出し側が pushNotice・dismissNotice で持つ。unlockNotices・loadFailNotice・saveFailNotice・shareLoadedNotice) |
| HUD-5 | 試走中の表示(時間・距離・ゴールまでの進み具合、設計に戻る) | | done(RunHud:時間/制限(残り 5 秒で注意)、距離とゴールまでの帯(ゴーストの印)、モーター負荷計、停動・転倒・詰まったの札、設計に戻る。毎フレームの更新は transform と SVG の属性だけ) |

### stream `guide` — `src/guide`, `src/dev/GuidePlayground.tsx`, `src/i18n/ja/guide.ts`(利用者の要望:遊び方とチュートリアルでわかりやすく)

| ID | 内容 | 受け入れ条件 | 状態 |
| --- | --- | --- | --- |
| GUIDE-1 | 遊び方の本:ページごとに本物のソルバーで動く小さな機構の図(棒を引く・固定点とクランク・自由度 1 で動く/固まる/ぐらつく・良い脚先の軌道・脚列と位相・試走とメダル) | 全ページが表示でき、図が動く | done:`HowToPlay`(8 ページ、前へ・次へ・← →・ページのピン・Esc)。図は sampleCycle/solvePose の姿勢(五節のぐらつきは補助機構を solvePose で解く)。動きを減らすと静止画。全ページの表示と「図が動く/止まる」を Vitest と E2E で確認 |
| GUIDE-2 | 用語の解説(自由度、グリューブラーの式、グラスホフの条件、死点、カップラーカーブ、てこクランク、脚列と位相):用語をクリックすると開く小窓 | 全用語に文言と図 | done:`GLOSSARY` 9 語(+組立不能・特殊な寸法)、`<Term id>` の小窓(Esc・外側クリックで閉じフォーカスを戻す)、`GlossaryPanel`/`GlossaryDialog`、文言中の `[[id\|表示]]` を `RichText` が用語リンクにする。全用語の文言と図をテスト |
| GUIDE-3 | 操作一覧(? キー):エディタのショートカットと同じ定義から作る | エディタと食い違わないテスト | done:`src/editor/keyboard.ts` に `SHORTCUTS` 表を追加(後方互換)。`ShortcutSheet`+`useShortcutSheetHotkey`。表 → resolveShortcut の一致と、全キー×修飾キーで resolveShortcut が反応するものが表に載ることをテスト |
| GUIDE-4 | 状況に応じた一言(白紙、クランクがない、自由度≠1、一回転できない、後ろ向きに歩く、脚先が地面をこする 等)と、初回の「チュートリアルから / 遊び方を見る」 | 判定は純関数でテスト | done:純関数 `pickTip`(17 種、グラスホフからクランク長の目安、段差ステージの足上げ、試走の結果、閉じた一言は飛ばす)と `TipBubble`、`WelcomeCard`。規則ごとにプリセット・ステージ・手作りの設計でテスト |

### stream `art` — `art/blender/**`, `public/models/**`, `src/scene/assets.ts`(素材:Blender → glTF)

| ID | 内容 | 受け入れ条件 | 状態 |
| --- | --- | --- | --- |
| ART-1 | Blender(5.2 LTS、ヘッドレスの Python)で工房の素材を作るスクリプトと `pnpm models`(再現可能・差分で読める) | スクリプトから GLB が毎回同じに生成される | done — `art/blender/`(共有の `kit.py`:three.js 座標で組んで素材ごとに 1 メッシュ、頂点色、geometry.ts と同じ mulberry32、面取り・木目・擦れ。素材ごとのスクリプト 6 本)と `scripts/models.mjs`。`pnpm models` で全 GLB を約 3 秒で作り直す。`pnpm models --check` で一時フォルダに作り直してバイト単位で一致を確認(同じ Blender・同じ OS ならバイト一致。座標 0.01mm・色 1e-4 に丸め、PYTHONHASHSEED=0)。`--preview` で Eevee の確認画像 |
| ART-2 | 部屋・作業台・棚・工具箱・窓の外の荒野・看板の GLB(手続き生成と同じ寸法と原点、Draco なし、1 つ 400KB 以下・合計 3MB 以下) | assets.test と E2E が通り、本番 CSP で外部読み込みなし | done — 6 つで合計 1.21MB(gzip 0.34MB、最大 346KB)。`models.test.ts`(予算・自己完結・属性・layout.ts との外形)と `e2e/models.spec.ts`(本番 CSP で自オリジンから読む)。ModelSlot:透明な素材は影を落とさない(ガラスが窓の光を遮っていた)。Workbench の GLB はワールド座標(節点を BENCH.center へ平行移動)。courseModel は対象外(world ストリームが作り直し中) |

### stream `sec` — `src/core/model`, `src/core/storage`, `scripts/serve-dist.mjs`, `public/_headers`(セキュリティ点検)

| ID | 内容 | 受け入れ条件 | 状態 |
| --- | --- | --- | --- |
| SEC-3 | 外から来るデータ(共有リンクのフラグメント、読み込む JSON、localStorage)の点検:展開爆弾、巨大入力、型の混乱、プロトタイプ汚染、XSS の経路 | ファズテスト(乱数で壊した入力)で落ちない・時間が有限 | done — 上限つきの lz 展開(展開後 100 万文字、2.3 万文字のトークンが 6000 万文字に膨らんでいた)、`MAX_JOINTS` 256→64 ほか(鎖 256 点で解析 2 分)、予約 id・制御文字の拒否、`__proto__` のキーを捨てる、進行の記録キーの検査、localStorage の値の上限。`fuzz.test.ts`・`hostile.test.ts`・`security.test.ts`・`tamper.test.ts`・`lz.test.ts`。`docs/security.md` |
| SEC-4 | 手元配信サーバーのパス走査・不正な URL、CSP の見直し、依存の監査を CI 手順に | テスト | done — serve-dist:不正な % で落ちていた・外を指すシンボリックリンクを配信していた・全インターフェースで待ち受けていたのを修正。CSP に Trusted Types(`'none'`、全画面で違反なし)ほか。`e2e/security.spec.ts`。供給網の設定とデプロイ前の手順は `docs/security.md` |

### stream `playtest` — `e2e/playtest/**`, `src/game/stages.ts`(チュートリアル定義)、`src/i18n/ja/game.ts`(初めての人がつまずかないか)

| ID | 内容 | 受け入れ条件 | 状態 |
| --- | --- | --- | --- |
| PLAY-1 | チュートリアル(1-1 修理、1-2 クランクを直す、1-3 白紙から)を初めての人の手順で E2E 化。各ステップの指示が、その時点で使える道具だけで達成できる | 3 ステージとも最後のステップまで進み、クリア | done — `e2e/playtest/`(play.ts と tutorial-1-1〜3・newcomer):吹き出しの文言と画面の見た目(離れた固定点・赤い点・オレンジのクランク・点線の十字とマス目)だけで操作し、3 つとも最後まで進んでクリア。空の保存から 1-1→1-3 を「次のステージ」だけで通す版も。よくある失敗(点に落とし損ねる・違う点・縮め足りない・棒の途中からドラッグ)は吹き出しの「元に戻す」で戻れる。**1-3 は 3 番目でクランクを求めるがリンクがなく行き止まりだった** → 手順を「固定点 2 → 短い棒 → クランク → 長い棒 → 途中の点と右の固定点 → 脚先 → 試走」に組み直し、寸法(40cm/20cm・クランク 10cm・脚先は右下)を吹き出しに。既定の回転数のまま前へ歩き、数 cm ずれても sim でクリア(`src/game/tutorial.sim.test.ts`)。既知の問題:クランクの先を軸に重ねると長さ 0 のクランクが「一回転できる」になる(fixme、kinematics・editor へ報告) |
| PLAY-2 | 全ステージを参照解(JSON 読み込み)で通しプレイし、クリア・メダルを確認する回帰テスト | 10 ステージ | done — `e2e/playtest/references.spec.ts`:各ステージの参考解を「JSON を読み込む」のファイル選択で入れて試走、保存された記録でクリア・時間のメダル銀以上・他の軸もメダルありを確認。10 本並列で約 5 秒。実測は全ステージ 4 軸とも金、時間は校正表と同一(ブラウザとヘッドレスが一致) |
| PLAY-3 | わかりにくい文言・行き止まり・効かないヒントを直す(チュートリアルとヒントの文言、ステップ定義) | 修正点を LOG に | done — 吹き出しは画面に見える言葉で点を指し(「右上に 1 つだけ離れている固定点」「三角の板の右の角の赤い点」「オレンジ色の棒の先」)、つまずいたときの吹き出しは「元に戻す」を案内。ヒント 3 は四節の脚では揺れる棒以外の点をすべて見せ、文言で手順を言い切る(2-2 は脚列の値、2-3 は消す棒、2-4・2-5 は JSON で前の機械を使い回す)。1-1・2-1・2-3 はヒント 3 だけでクリアできることを E2E、1-3〜1-5・2-2・2-4・2-5 は sim で確認。試走前チェックと失敗の助言は次に押すもの(逆回転・脚先・クランク)を書く。失敗の助言は結果画面に出ていない(result・flow へ報告) |

## ウェーブ 3(統合)

| ID | 内容 | 依存 | 状態 |
| --- | --- | --- | --- |
| INT-1 | 設計画面:製図用紙の上に MechanismEditor を位置合わせ(usePaperViewport)、3D の用紙にも今の設計を描いて遷移中も途切れない、パネル分の余白、戻る・試走ボタン | scene, editor | done(`src/app/screens/design/`:`DesignScreen` はエディタの描画面を紙の画面矩形にぴったり置き(view = 紙の設計範囲、1cm = 1cm、パン・ズームなし)、道具の帯・横のパネル(狭い画面では下)を `designLayout` の余白に置く。余白は App の `useDesignPaperInsets` が遷移の前から `setPaperInsets` に渡す。`PaperInk` は紙の絵ごと設計画面の画素の細かさで描き直した不透明な板(紙+図面/紙だけの 2 枚)で、ホーム・T-02/T-07/T-03 の間も紙の上はプレイヤーの機械、降りきるとエディタの SVG と画素単位で同じ図に切り替わる(色は照らされた紙で測ってエディタ側を合わせた)。見出しはセッションのステージ(番号・名前・課題)、エディタにステージの部品・動かせない点・予算・開いたヒントの影。差し込み口:stageHeader / hints(上の帯)、tutorial(全面の層)、onTestRun(既定 go('testRun'))、editor(制約の上書き)。Esc はエディタが作図→選択→道具の順に戻し、残りが「戻る」(editor の escape を変更)。紙の上の右クリックは何もしない(紙の外は戻る)。scene は `drawPaperSheet` を切り出しただけ。E2E `e2e/design-screen.spec.ts`。残り:INT-7 で HUD を差し込み口へ、FLOW-2 の試走前チェックを onTestRun へ、パン・ズームするならカメラも追従させる) |
| INT-2 | 試走画面:屋外の試走コースに TestRunScene、flow の試走ライフサイクル、追従カメラ(setStationOverride)、RunHud、ゴースト | testrun, flow, hud | done — `src/app/screens/run3d`。ステージの地形をスタートの線に合わせて荒野の試走コースへ平行移動(溝の底が帯の上面)、時計は 1 つ(testrun の SimClock が回数を決め、ステップは必ず LiveRun.step:速度・一時停止・スロー・結果へでも評価はヘッドレスとビット一致)、前回・相手のゴースト、軌跡・接地・重心、追従カメラ・モーター音・U-04、演出(scene/fx)の契約:registerTrackMachine・machineInFx の間は隠す・dt × getFxTimeScale()、試走前チェックで止まれば設計画面のまま問題を出す(`beginTestRun`)。HUD は testrun の操作盤+上の帯(hud の RunHud へ差し替えは TODO)。E2E `e2e/run3d.spec.ts` |
| INT-3 | 結果画面:ResultPanel、T-04、やり直し・設計へ・次へ | result, flow | done — 右に寄せた ResultPanel(カメラは機械を左寄りに)、もう一度・設計に戻る(T-05)・次のステージ(T-06 でステージ選択へ)・転倒の瞬間を ×0.5 で再生・共有。終わった瞬間に結果へ移り、評価の後は機体が余韻で歩き続けて T-04 のスロー(fx の倍率)を見せる。失敗の次の一手(adviceKey)も出す |
| INT-4 | ステージ選択:StageSelectPanel とコース模型のジオラマ、ステージ開始 | hud, flow | done(`src/app/screens/StageSelectScreen.tsx`:進行から解放・最高メダル・「次」にフォーカス、右下に寄せてジオラマと右上の通知を空ける。選ぶと startStage + go('design')(T-02)、Esc・閉じるでホーム。設計・試走・結果からホーム・ステージ選択へ出たら leaveStage。ジオラマへの流し込み `src/app/worldBridge.ts`(useWorld があるときだけ働く:進行・enterStage・noteRun・目印のクリック・選択の同期)。E2E `e2e/home.spec.ts`。残り:world 合流後にジオラマのカメラをパネルの左に収める) |
| INT-5 | ホーム:続きから=最後のステージ、作業台の見本機を自分の機械に、設定(保存つき)、図鑑の枠、サンドボックス | flow, hud | done(`bootApp()`(冪等、init・見た遷移の保存・共有リンクは T-00 の後に設計へ)、ホームは HUD の TextMenu を工房のホバーと共有、続きから=最後のスロット→最初の未クリア、設定は SettingsPanel+利用者の選択だけを `ashikumi/v1/prefs` に保存(自動判定は保存しない、AppSettings に muted・sources を追加)、JSON 入出力・2 段階リセット、図鑑は「準備中」の札、サンドボックスは設計画面へ、全画面共通の NoticeStack。作業台の見本機を自分の機械にするのは WORLD-2(machineDesign の保存は worldBridge の TODO)) |
| INT-6 | 演出:T-03 組み上げ(部品が立ち上がり脚列が複製されクレーンで降ろす)、T-05 逆再生、T-04 ゴールでスロー+半周 | testrun | done(`src/scene/fx`)— 図面の部品がクランクから順に立ち上がって厚みを持ち、脚は z = 0 から各組の位相までクランクを回しながら複製、胴体がはまり、手続き生成のクレーンが窓を抜けてコースのスタートへ降ろす。MachineModel と同じ配置・形・色・θ = 0 の姿勢に着地して引き継ぐ(行列の一致をテスト)。T-05・T-03 の逆再生は試走の今の姿勢から逆にたどる(割り込みは途中から)。T-04 は時間の倍率 1 → 0.2 → 0 と機械の周りの半周。スキップ・reduced-motion・音(はまる・クレーン・着地)。GPU で 16.7ms/フレーム。統合の約束は `src/scene/fx/index.ts`(registerTrackMachine・useFx の machineInFx・getFxTimeScale・onFxHandover・setPaperMapping)。統合前は代わりの機体(運動学の簡易 sim)がコースを歩く。`e2e/fx.spec.ts` |
| WORLD-1 | ステージ選択のジオラマ:章ごとの台地にステージの目印(未解放・クリア・メダル)、ホバーと選択、T-06 で機械が次のステージまで歩く | scene, game | done(stream `world`)— `src/scene/world`:台地+S 字の小道+橋、章 2 は地形から段と溝、目印はインスタンス描画(南京錠/光る/旗+軸ごとのメダル)、ホバーで輪郭とステージ名、クリックは `activateStage`(`setStageSelectHandler` で差し替え)。T-06 は模型が見え始める遷移の 80% から歩き出し、カメラが着いた後に次の目印へ(遷移の 0.75 倍、クリック・キーでスキップ)。ステージ選択のカメラは world が `setStationOverride('stageSelect')` で持つ(右下の一覧 `.app-dock--stage` を避けて遊べる章を左側に、T-06 は歩く区間に寄る)。ラベルはホバー中、なければ一覧で選んだステージ。統合は `src/app/worldBridge.ts`(`noteRun`・`enterStage`・`setProgress`・`selectStage`・`setStageSelectHandler`)。E2E `e2e/world.spec.ts` |
| WORLD-2 | 工房が育つ:クリアした章の機械が棚に並ぶ、図鑑の額(中身は MVP 外)、作業台の見本機を自分の機械に | scene | done(stream `world`)— 棚の空いた段に章ごとの台座(クリアした機械 `useWorld.chapterMachines`、未クリアは影絵、図鑑の画面で足踏み)、奥の壁に「?」の札の額 3×2(`progress.zukan` の数だけ紙に)、作業台は `BenchWalker` が `useWorld.machineDesign`(なければヤンセン型)を歩かせる。機械は `installWorldSave` で `ashikumi/v1/world` に保存・復元(設計ごとに validateDesign、worldBridge が起動時に呼ぶ) |
| INT-7a | 設計画面:チュートリアルの吹き出し(道具を順に渡す・動かせない点)、StageHeader、HintPanel と影、状況の一言(TipBubble)、試走ボタンと試走前チェックの一覧(RunLayer を置き換え)、操作一覧(?)、遊び方・用語、章 1 は脚列を固定 | flow, hud, guide | doing(stream `int-tutorial`) |
| INT-7b | ホーム:初回の WelcomeCard(チュートリアルから / 遊び方を見る)、遊び方の入口、試走画面の帯を HUD の RunHud に | hud, guide | doing(stream `int-polish`) |
| INT-8 | E2E 通しプレイ:章 1-1 の修理 → 試走 → クリア → 次が解放 | 全部 | 3D なしの版は done(`e2e/flow.spec.ts`)。3D の工房での版は stream `int-tutorial` |

## ウェーブ 2(予定:統合と性能)

- `integration`:設計画面(製図用紙に編集ビューを位置合わせ)、T-03 組み上げ演出、結果画面の配線、共有リンクとゴースト対戦、JSON 入出力 UI、自動保存の配線、ステージのメダル基準をヘッドレス試走で調整

### 性能と WASM(計測してから決める)

| ID | 内容 | 判定基準 | 状態 |
| --- | --- | --- | --- |
| PERF-1 | ブラウザで計測:編集 1 回あたりの解析時間、試走 1 フレームあたりの sim 時間、描画 fps。LOG.md に記録 | 予算:解析 < 8ms、sim < 4ms/フレーム、60fps | done:解析 0.1ms、sim 0.05ms/フレーム、Apple M5 Pro(通常モード)でホーム 59fps・試走 60fps(p95 17.7ms)。初回ロード約 410KB(gzip)、全体 2.2MB。内蔵 GPU の実機計測は未(低性能モードの自動選択で対応) |
| PERF-2 | stream `wasm`:Rust → WASM(wasm-pack、Rust 1.97 + wasm32 導入済み)で毎フレームの解法プラン実行(crank/rigid/dyad/newton)と接触ループを試作し、JS と同じテストを通したうえで Node とブラウザでベンチマーク | 100 ジョイントで JS の 2 倍以上速く、小さな機構で遅くならなければ同じ API の裏で採用。満たさなければ結果を記録して JS のまま | done — 不採用(JS のまま)。100 点のフレームで同じ API 1.5×・一括 1.9×、小さな機構 1.5×(Node)。`docs/perf/wasm-vs-js.md`。ブラウザ計測と接触ループは未実施 |
| PERF-3 | 試走のシミュレーションを Web Worker に移す(決定論を保つ) | メインスレッドの sim 負荷 0、結果が同一 | 見送り:sim は 1 フレーム 0.05ms で予算の 1/80。必要になったら再検討 |

## ウェーブ 3(予定:仕上げと公開)

| ID | 内容 | 状態 |
| --- | --- | --- |
| POLISH-1 | 設計ビューの全体表示に脚先軌道(と全ジョイントの軌道)の範囲を含める | done |
| SEC-1 | 本番ヘッダー:CSP(外部通信・外部スクリプト禁止、WASM は 'wasm-unsafe-eval' のみ)、X-Frame-Options、Permissions-Policy、COOP/CORP、HSTS。`pnpm serve:dist` で手元検証 | done |
| KIN-7 | 変位点(平行四辺形など)を通るときの組立モード選択 | done:前の 2 姿勢からの外挿で解を選ぶ(sampleCycle・脚列・試走・エディタのアニメーション)+ 余分なリンクの検査に失敗したら変位点付近の解を反転して解き直す。二重平行四辺形は一回転でき「特殊な寸法で動く」と表示、試走前チェックは警告のみ。章 2 の固めた機械は今まで通りエラー |
| E2E-1 | Playwright の E2E を導入:全画面の表示(CSP 違反・コンソールエラーなし)、セキュリティヘッダー、エディタで四節を組んで自由度 1、sim の段差コース(Rapier の遅延読み込み)、結果画面のスキップ。合流ゲートで毎回実行 | done |
| SEC-2 | sim・scene 合流後に本番ビルドを `pnpm serve:dist` で開き、CSP 違反がないこと(Rapier の WASM、drei の外部アセット読み込みがないこと)を確認 | done:E2E で自動化。3D の工房(`/`)も CSP 違反なし |


- タイトルロゴ(T-00)、図鑑と設定のパネル、性能監査(60fps、初回ロード 15MB 以下)、ブラウザでの通しプレイ確認
- DEPLOY:`cf` CLI で Cloudflare に配信(`docs/deploy.md`)。設定は済み(`pnpm deploy:dry` 合格)。本番デプロイには利用者の `cf auth login` が必要
