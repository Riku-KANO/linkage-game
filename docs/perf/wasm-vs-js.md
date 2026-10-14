# WASM と JS の比較(PERF-2)

2026-10-15、stream `wasm`(ブランチ `feat/wasm`)。毎フレームの運動学(解法プランの実行:crank / rigid / dyad / newton)を
Rust → WASM に移植し、同じ API の裏で今の TypeScript 版(`src/core/kinematics/solve.ts`、main の 76e92e5 時点)と比べた。
接触ループの移植とブラウザでの計測はこのストリームでは行っていない(下の「未計測」を参照)。

## 結論:採用しない(JS のまま)

BACKLOG の判定基準は「100 ジョイントで JS の 2 倍以上速く、小さな機構で遅くならなければ同じ API の裏で採用」。
3 回の計測(下の表は最後の 1 回)で:

| 基準 | 結果(JS ÷ WASM、中央値の比) | 判定 |
| --- | --- | --- |
| 100 点の 1 フレームが 2 倍以上 | 同じ API(`solvePose` を脚ごとに呼ぶ):**1.45〜1.49×**<br>一括 API(`solveBatch` × 2、前姿勢を渡す):**1.89〜1.94×**<br>一括 API + 前姿勢を WASM 側に置いたまま(`prevs: 'last'`):2.06〜2.11× | **未達**。同じ API の裏では 1.5 倍。2 倍を超えるのは、API を一括型に変え、状態を WASM 側に持たせた場合だけで、それも 2 倍ちょうど付近 |
| 小さな機構で遅くならない | ヤンセン脚 1 本の `solvePose`:1.48〜1.50× 速い | 達成 |

基準を別にしても、採用しない理由:

1. **絶対値が小さすぎる。** JS で 100 点の 1 フレームは約 2.6 µs(予算 4 ms の 0.07%)。試走 1 秒ぶん
   (240 Hz × 6 脚 × θ, θ±h = 4320 回)でも約 0.9 ms、60 fps の 1 フレームあたり約 15 µs。WASM で浮くのは 1 フレーム数 µs。
2. **ニュートン法の差(4.6〜4.7×)の大半は JS のままで取れる。** 同じ手順を割り当てなしで書いた「JS(平坦プラン)」は
   0.88 µs(solve.ts 2.9〜3.1 µs、WASM 0.64 µs)。solve.ts の `runNewton` が反復ごとに作る `Map`・`entries` 配列・`backup` 配列と、
   `solveDamped` の `Float64Array` が主因なので、kinematics ストリームの最適化で解消できる。
3. **比べる相手が動いている。** kinematics ストリームが solve.ts を最適化中。速くなれば比はさらに下がる。
4. **採用のコストが続く。** ソルバーが二重実装になり、solve.ts を変えるたびに Rust 版・`flattenPlan`・等価テストも直す必要がある。
   ほかに Rust / wasm-pack のツールチェーン、非同期の初期化(`await initKinematicsWasm()`)、配信 +17 KB(gzip、グルー +2.8 KB)。

「一括の経路(軌道・試走)だけ採用」も見送る。軌道 `sampleCycle(180)` は 2.5〜2.6× 速い(約 55 → 21 µs)、
編集 1 回ぶん(コンパイル + 軌道)は 2.2×(約 58 → 26 µs)だが、解析の予算 8 ms(PERF-1)の 1% 未満で、体感の差にならない。

### 再評価する条件

- PERF-1 のブラウザ計測で、運動学が 1 フレーム 1 ms を超えたとき(今の数百倍)
- 大きなニュートン・ブロック(未知点 5 個以上)の設計が普通になり、solve.ts の割り当てを減らしてもなお重いとき
- 再計測は `pnpm wasm:bench`。solve.ts の最適化がマージされたら回し直すこと(下の表が自動で書き換わる)

## 計測結果

`pnpm wasm:bench`(`src/core/kinematics-wasm/bench.test.ts` → `bench.ts` の `runKinematicsBench()`)が自動で書く表:

<!-- bench:start -->
計測環境:Node 26.7.0(V8 14.6.202.34-node.28)、darwin/arm64、Apple M5 Pro。Vitest のワーカー内。実装ごとに 500 ms 温めてから、約 2 ms のサンプルを 200 個(実装を交互に)。値は 1 op あたりの時間の中央値 / p95。

| シナリオ | 1 op | JS(solve.ts) | WASM 1 回ずつ(solvePose) | WASM まとめて(solveBatch / sampleCycle) | WASM まとめて(prevs: 'last') | JS(平坦プラン) | JS ÷ WASM(中央値の比) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| (a) 小さな機構 1 個(ヤンセン脚 8 点)の solvePose 1 回 | solvePose 1 回(prev・out あり) | 0.21 µs / 0.22 µs | 0.14 µs / 0.15 µs | — | — | 0.24 µs / 0.25 µs | 1 回ずつ 1.49× |
| (b) 100 点級の機械(ヤンセン脚 12 本 = 96 点、反転脚 6 本を含む)の 1 フレーム | 12 脚をすべて解く(1 回ずつ = solvePose × 12、まとめて = solveBatch × 2) | 2.62 µs / 2.79 µs | 1.78 µs / 1.92 µs | 1.39 µs / 1.45 µs | 1.27 µs / 1.35 µs | 2.97 µs / 3.11 µs | 1 回ずつ 1.47×<br>まとめて 1.89×<br>last 2.07× |
| (c) 軌道 sampleCycle 180 ステップ(エディタ) | sampleCycle(180) 1 回(結果の配列の作成を含む) | 54.1 µs / 60.2 µs | — | 21.5 µs / 22.5 µs | — | 39.5 µs / 42.0 µs | まとめて 2.51× |
| (c2) 編集 1 回ぶん:compileMechanism + sampleCycle 180 | コンパイル(WASM はプランの平坦化とソルバー生成・解放も)+ 軌道 | 60.7 µs / 85.6 µs | — | 27.4 µs / 35.5 µs | — | 47.7 µs / 69.4 µs | まとめて 2.22× |
| (d) 試走相当:240 Hz × 1 秒 × 6 脚(見本機)× 3 回(θ, θ±h) | 1 秒ぶん = 240 ティック = 4320 回の解法(まとめて = 1 ティックに solveBatch × 2) | 912 µs / 975 µs | 612 µs / 649 µs | 508 µs / 531 µs | — | 1.03 ms / 1.11 ms | 1 回ずつ 1.49×<br>まとめて 1.80× |
| (e) ニュートン法ブロックを持つ機構(三連節)の solvePose 1 回 | solvePose 1 回(0〜50° を往復、prev あり) | 3.10 µs / 4.87 µs | 0.66 µs / 0.99 µs | — | — | 0.90 µs / 1.35 µs | 1 回ずつ 4.73× |

| 配信サイズ | 生 | gzip -9 | brotli 11 |
| --- | ---: | ---: | ---: |
| kinematics_wasm_bg.wasm | 39.9 KB | 17.3 KB | 14.7 KB |
| kinematics_wasm.js(グルー) | 10.2 KB | 2.8 KB | 2.5 KB |

初期化(initKinematicsWasm:ファイル読み込み + コンパイル + インスタンス化、Node):0.8 ms
<!-- bench:end -->

3 回の計測の幅(JS ÷ WASM):(a) 1.48〜1.50×、(b) 1 回ずつ 1.45〜1.49× / まとめて 1.89〜1.94× / last 2.06〜2.11×、
(c) 2.51〜2.62×、(c2) 2.22〜2.25×、(d) 1 回ずつ 1.43〜1.49× / まとめて 1.75〜1.80×、(e) 4.57〜4.73×。

各列:

- **JS(solve.ts)**:今の `solvePose` / `sampleCycle` をそのまま呼ぶ(`prev` と `out` を使い回す)
- **WASM 1 回ずつ**:`createWasmSolver(mech).solvePose(theta, { prev, out })`。solve.ts と同じ呼び方・同じ戻り値
- **WASM まとめて**:`solveBatch(thetas, out, { prevs })` を機構ごとに 1 回(12 脚の機械は通常脚と反転脚の 2 回)。
  `sampleCycle` は 1 回の呼び出しで 180 ステップ解く
- **WASM まとめて(prevs: 'last')**:前フレームの結果を WASM 側に置いたまま前姿勢にする(前姿勢のコピーを省く)
- **JS(平坦プラン)**:WASM と同じ平坦なプランと同じ手順を JS で実行したもの(`createFlatJsSolver`)。
  「WASM だから速い分」と「データ配置・割り当てを変えたから速い分」を分けるための基準。WASM と同じラッパー(コピーと結果の組み立て)を通る

### 公平にするための約束

- どの実装も同じ θ の列・同じ前姿勢の連鎖で同じ仕事をする。通常の `pnpm verify` で、全実装の検査用の和が一致することを確かめている
- 出力と前姿勢のバッファはどの実装でも使い回す
- WASM の数字は境界のコストを含む:θ と前姿勢を WASM メモリへ書く、結果を JS の `Float64Array` へコピーする、
  `SolveResult` と失敗点の配列を作る(`'last'` 列だけ前姿勢のコピーを省く。出力のコピーは含む)
- 実装ごとに 500 ms 温めてから(JIT と WASM の段階的な最適化を済ませる)、約 2 ms のサンプルを 200 個、実装を交互に回して取る。
  1 回が 1 µs 未満なのでタイマーの分解能の都合で 1 回ずつは測らず、サンプル内の平均の分布から中央値と p95 を出す
- (b) は `jansenLeg` を 6 組・位相 60°・`mirrorX` で複製(`legInstances`)した 12 脚 = 96 点。反転脚は `mirrorDesignX` をコンパイルした別の機構。
  (d) は見本機 `jansenWalker`(6 脚)を設計の回転数(40 rpm)で 240 Hz 進め、各脚 θ と θ±1e-4 を前ティックの姿勢を前姿勢にして解く

### 未計測

- **ブラウザ**:このストリームではブラウザを使っていない。`runKinematicsBench()` はブラウザでも動くので、開発用ページから呼べば測れる(PERF-1 で)。
  Chrome は Node と同じ V8 なので近い比になるはず。Safari(JSC)と Firefox は JS と WASM の得手が違うので未知数
- **接触ループ**:sim がまだ無い(`src/core/sim` は型だけ)ので移植していない。運動学の結果から見て、接触だけを WASM にする価値も薄い

## 中身と、試して効かなかったこと

- 時間の内訳:ヤンセン脚 1 回の解法は WASM で約 100 ns、solve.ts で約 210 ns。WASM 側の約 3 分の 1 は sin/cos(wasm32 の Rust の libm はソフトウェア実装)
- `Math.sin` / `Math.cos` を WASM に import:wasm-bindgen のグルー関数を経由すると逆に遅くなり(12 脚 1.27 → 1.45 µs)、
  グルーを `Math.sin` 直結に書き換えても変わらなかった → 採用せず
- 添字検査を外す(`get_unchecked`):1〜2% しか変わらない → unsafe に見合わず採用せず
- 平坦プランを JS で実行:単純な機構では solve.ts より少し遅い(V8 が solve.ts の小さな割り当てをうまく処理しているうえ、こちらはラッパーのコピーを払う)。
  ニュートン法では 3.4 倍速い(上の理由 2)

## 正しさ

`src/core/kinematics-wasm/solver.test.ts`(WASM 版と JS 平坦プラン版の両方で、solve.ts と比べる。許容 1e-9):

- `jansenLeg`、反転した `jansenLeg`、`chebyshevLambda`、`fourBar`、`fourBar(28, 35, 30, 40)`(組立不能)、三連節(ニュートン法):
  `sampleCycle`(360 ステップ / 180 ステップ逆回転・開始角つき / 7 ステップ)、前姿勢を連鎖させた `solvePose` 721 回(組立モードの連続性)、
  遠い前姿勢と前姿勢なしでの交点の選び方
- 組立不能の四節:`ok`・`failedJoints`・`failedLinks`・`minSlack`・`minSlackJoint`・`residual` まで一致
- 三連節:0〜90°(55° 付近から先はロック)と、3600 ステップの 1 回転(ロックが 1000 ステップ以上続く)で、収束しない反復の妥協位置まで一致。
  `maxIterations` の指定も同じに効く
- 12 脚の機械 120 フレームの `solveBatch`(前姿勢あり / `'last'`)が脚ごとの `solvePose` と一致
- 別のソルバーが WASM メモリを伸ばした後も正しく動く(切り離されたビューを作り直す)
- 観測した最大差(3600 ステップの 1 回転):組み立てられる姿勢で 9e-14 以下、ロック中の妥協位置で 2.3e-12。JS 平坦プラン版は 7e-14 以下(ニュートン法の部分はビット単位で一致)
- 長さの丸め:ニュートン法と組立不能時の長さは V8 の `Math.hypot` と同じ式(大きい方で割ってから 2 乗)で計算する。
  `sqrt(x² + y²)` だと最下位ビットのずれ(4 割の入力で起きる)が収束しない LM の反復で育ち、ロックが数百ステップ続くと 1e-3 cm ずれた

## API(`src/core/kinematics-wasm`、アプリには未接続)

```ts
import { compileMechanism } from '@/core/kinematics/compile';
import { createWasmSolver, initKinematicsWasm } from '@/core/kinematics-wasm';

await initKinematicsWasm(); // 1 回だけ。ブラウザは fetch(Vite が .wasm をアセットにする)、Node / Vitest は fs + initSync
const s = createWasmSolver(compileMechanism(design)); // PlanSolver。機構(と反転した機構)ごとに 1 つ

s.solvePose(theta, { prev, out, maxIterations }); // solve.ts の solvePose と同じ SolveResult
s.sampleCycle(180, { direction, startTheta }); // sampleCycle と同じ CycleSample
const failed = s.solveBatch(thetas, out, { prevs }); // prevs: Float64Array | null | 'last'。戻り値は組み立てられなかった個体数
s.batchOk(i); // 直前の一括の個体 i が組み立てられたか
s.batchResult(i); // 個体 i の SolveResult
s.dispose(); // WASM のメモリを解放(しなくても GC で解放される)
```

- `flattenPlan(mech): FlatPlan`:解法プランを `ops`(Int32Array)と `consts`(Float64Array)に平坦化する。形式は `flatten.ts` と `crates/kinematics-wasm/src/lib.rs` の冒頭
- `createFlatJsSolver(mech)`:同じ API の JS 実装(比較用)
- `runKinematicsBench(options)` / `kinematicsScenarios()`:ベンチマーク本体(Node でもブラウザでも動く)

### 統合するなら(採用しないが、再評価のときのために)

- 初期化が非同期:アプリの起動時に `initKinematicsWasm()` を待つ。sim を Web Worker に移す(PERF-3)なら Worker の中でも初期化する
- WASM のメモリが伸びると古い `ArrayBuffer` は切り離される。ラッパーが呼び出しごとに検出してビューを作り直す
- 機構を作り直すたび(編集のたび)にソルバーを作る(平坦化 + 確保 + 解放で 1〜2 µs)。古いものは `dispose()`
- solve.ts に手を入れたら(ステップの種類や `SolveResult` の項目が増えたら)、Rust 版・`flattenPlan`・等価テストも直す。
  `SolveStep` に種類が増えると `flattenPlan` の網羅性検査で型エラーになる
- Vite:`new URL('./pkg/kinematics_wasm_bg.wasm', import.meta.url)` がアセットになる(使い捨ての `vite build` で 40.6 KB のアセットが出て、
  `node:fs` が束に入らないことを確認)。アプリの `pnpm build` はこのモジュールを読まないので、今の配信物は変わらない

## ビルドと版

- `pnpm wasm:build`:wasm-pack 0.15.0、`--target web`、wasm-opt `-O3`(binaryen 117、wasm-pack のキャッシュ)。
  生成物 `src/core/kinematics-wasm/pkg/` はコミット済みで、`pnpm build` に Rust は要らない。同じソースからのビルドは同じバイト列になった
- Rust 1.97.1(edition 2024)、`opt-level = 3`、LTO、`codegen-units = 1`、`panic = "abort"`
- 依存は wasm-bindgen だけ。2026-10-15 に `cargo search` で最新版を確認し、`cargo update` 済み。`Cargo.lock` の版:

  | crate | 版 |
  | --- | --- |
  | wasm-bindgen / wasm-bindgen-macro / wasm-bindgen-macro-support / wasm-bindgen-shared | 0.2.129(最新) |
  | bumpalo | 3.20.3 |
  | cfg-if | 1.0.5 |
  | once_cell | 1.21.4 |
  | proc-macro2 | 1.0.107 |
  | quote | 1.0.47 |
  | rustversion | 1.0.23 |
  | syn | 3.0.9 |
  | unicode-ident | 1.0.27 |

  wasm-bindgen 以外は wasm-bindgen が引き込むもの(マクロのビルド時に使う)。npm の依存は追加していない

## 合流について(オーケストレーター向け)

採用しないので、次のどちらか:

- **記録だけ合流**:このファイルと BACKLOG の PERF-2 の行だけを main に入れ、`feat/wasm` は試作として残す。
  solve.ts を変えるたびに等価テストが落ちて Rust 版の手直しを迫る、という結合を main に持ち込まない(おすすめ)
- **まるごと合流**:`pnpm wasm:bench` で再計測できる状態を main に置く。代わりに kinematics ストリームは solve.ts を変えるたび
  `src/core/kinematics-wasm` の等価テストと Rust 版を追従させる必要がある
