# セキュリティ方針と脅威モデル

アシクミはサーバーを持たない静的サイト(Cloudflare Workers の静的アセット)。ログイン・秘密情報・
サーバー側の保存はない。守るのは **遊ぶ人のブラウザ(このオリジン)と、その人の保存データ**、
そして **配信物の完全性**。SEC-1〜SEC-4 の点検結果と決定をここにまとめる。

## 1. 脅威モデル

| 攻撃者 | できること | 入口 |
| --- | --- | --- |
| 共有リンクを作る誰でも | 任意の `#s=<token>` を作って送る(チャット、SNS) | URL のフラグメント |
| 設計ファイルを渡す人 | 任意の内容の `.ashikumi.json` を読み込ませる | ファイルの読み込み(U-03) |
| 同じオリジンのデータを書き換えられる者 | localStorage を書き換える(拡張機能、手での編集、古い・新しい版のアプリ) | localStorage(U-01) |
| リンクを踏ませる人 | 任意のクエリ・パスを開かせる | `?dev=…`、パス |
| 依存パッケージの乗っ取り | 悪意のある版を npm に出す | `pnpm install`、ビルド |
| 同じ LAN の他人 | 手元の検証サーバーに接続する | `scripts/serve-dist.mjs` |

守ること:

1. **XSS させない** — 外から来た文字列が HTML・スクリプトとして解釈されない
2. **固まらせない(DoS)** — どんな入力でも、読み込み・解析・試走が有限の時間とメモリで終わる
3. **データを壊さない** — 壊れた入力で保存データを上書きしない。プロトタイプ汚染で状態を化けさせない
4. **外へ送らない** — 設計や記録を第三者に送信しない(CSP で外部通信を禁止)

範囲外:端末そのものの乗っ取り、ブラウザの脆弱性、Cloudflare のアカウント管理(`cf auth login` の資格情報は各自で管理)。

## 2. 外から来るデータの通り道

すべて `src/core/model` の関数を通す。**生の `lz-string`・`JSON.parse` を直接使わない**。

```
#s=<token> ─ decodeShare ─┬ トークン長の上限(% 込みで ×3 → そのままで 24000)
                          ├ 上限つきの展開(lz.ts、展開後 100 万文字まで)
                          ├ safeJsonParse(__proto__ / constructor / prototype のキーを捨てる)
                          ├ 短縮形式の配列の長さを先に確認(物を作る前)
                          └ migrate → validateDesign、ゴースト・記録も検査
JSON ファイル ─ readDesignFile / parseDesignFile ─ サイズ上限 → safeJsonParse → migrate → validateDesign
localStorage ─ createPersistence ─ 値の長さ上限 → safeJsonParse → readDesign / validateProgress / guard
```

検査(`validateDesign`)の約束:

- **新しいオブジェクトを作って返す**。入力のオブジェクトを展開・コピーしないので、知らないキーや
  `__proto__` が結果に混ざらない(`Object.assign` に未検査の値を渡さないこと)
- **id**:1〜64 文字、重複なし、`Object.prototype` のメンバー名(`__proto__`, `constructor`,
  `toString` など、`RESERVED_IDS`)と制御文字・双方向制御文字・壊れたサロゲートは拒否。
  下流で id をオブジェクトのキーにしても衝突しない(それでも id のキーには `Map` を使うこと)
- **名前**:制御文字・双方向の上書き文字(RLO など、表示順をごまかしてファイル名を `…exe` に見せられる)を
  取り除き、壊れたサロゲートは U+FFFD にして 40 文字に切る。ダウンロード名(`designFileName`)も同様
- **数**:有限(`1e999` は Infinity になるので拒否)、座標 ±10000cm、`-0` と非正規化数は 0、
  rpm は ±120、クランクの位相は ±2π に戻す(巨大な位相は共有リンクの量子化で Infinity になっていた)
- **理由の配列**は 50 件まで(巨大な入力で膨らまない)
- 例外を投げない(getter や Proxy が投げても `ok: false`)

画面への表示:React のテキストとして出す(自動でエスケープ)。`dangerouslySetInnerHTML`・`innerHTML`・
`eval` は使わない(コードベースに 0 件。Trusted Types で実行時にも止まる)。

### 上限の一覧

| 定数 | 値 | 理由 |
| --- | --- | --- |
| `MAX_SHARE_TOKEN_LENGTH` | 24000 文字 | 見本機は 2000 未満、ゴースト込みでも 6000 未満 |
| `MAX_SHARE_JSON_LENGTH` | 100 万文字 | lz-string は辞書が 1 文字ずつ伸びるので展開後が入力の 2 乗まで膨らむ。2.3 万文字のトークンが 6000 万文字(Node で約 350MB)になった。正しいリンクは上限いっぱいのゴーストでも 60 万文字未満 |
| `MAX_DESIGN_FILE_LENGTH` | 200 万文字 | ファイル |
| `MAX_STORED_ITEM_LENGTH` | 100 万文字 | localStorage の 1 つの値。超えたら壊れたデータとして既定値 |
| `MAX_JOINTS` | 64(以前 256) | 下の「計算量」 |
| `MAX_LINKS` | 96 | |
| `MAX_LINK_JOINTS` | 16 | 1 枚の剛体プレートの点 |
| `MAX_LINK_MEMBERSHIPS` | 256 | 全リンクの点の合計。距離拘束は点の数の 2 乗で増える |
| `MAX_CRANKS` | 16 | |
| `MAX_GHOST_FRAMES` | 6000 | 10Hz で 10 分 |
| `MAX_PROGRESS_LIST` | 256 | 章・図鑑・見た遷移・記録の件数 |

エディタはまだこの上限を強制していない(sandbox で上限を超えて作ると、自動保存は書けても再読み込みで
読めない)。エディタで部品を足すときに同じ定数で止めること(残課題)。

### 計算量(展開爆弾以外の DoS)

検査を通った設計は、設計ビューの解析(`analyzeMechanism`、180 姿勢)と試走(`Walker`)にそのまま渡る。
解けない部分はニュートン法(密行列、点の数の 3 乗)に回るので、ジョイント数が計算量を決める。

| 設計 | 以前(上限 256) | 現在(上限 64) |
| --- | --- | --- |
| 鎖(全点がニュートン法) | 1 姿勢 0.77 秒、解析 約 110 秒、試走 1 秒分に 81 秒 | 解析 0.16 秒、試走 1 ステップ 1.1ms(16 組で 17ms) |
| 16 点プレートを 95 枚重ねる | — | 解析 2.1 秒 → 点の合計の上限で 0.3 秒 |
| 重なった点・長さ 0・±100m・1e-9cm・自己参照リンク・全部固定 など | NaN・例外なし | 同じ(`hostile.test.ts`) |

残るリスク:上限いっぱいの意地の悪い設計を脚列 16 組で試走すると 1 ステップ 17ms かかり、
描画は遅くなる(止まりはしない)。ヘッドレス評価(30 秒 = 7200 ステップ)は最悪 2 分ほどかかる。
ソルバー側でニュートン法のブロックの大きさに上限を置く(超えたら「複雑すぎる」として試走前チェックで止める)のが
根本対策(運動学の担当への申し送り)。

## 3. ブラウザ側の防御(`public/_headers`)

| ヘッダー | 値 | 理由 |
| --- | --- | --- |
| CSP `default-src` | `'self'` | 外部の読み込み・通信を一切しない |
| `script-src` | `'self' 'wasm-unsafe-eval'` | Rapier・meshopt の WASM だけ許可。`eval`・`new Function`・文字列のタイマーは止まる |
| `require-trusted-types-for` / `trusted-types` | `'script'` / `'none'` | `innerHTML`・`script.src`・`new Worker(文字列)` などに文字列を渡すと例外。ポリシーも作らせない。全画面(`?dev=` 含む)で違反ゼロを E2E で確認 |
| `style-src` | `'self' 'unsafe-inline'` | `?dev=result` のプレイグラウンドだけが `<style>` 要素を使う。それを外部 CSS にすれば `'self'` にできる(他の全画面は `'self'` で違反なしを確認済み) |
| `img-src` | `'self' data: blob:` | GLB に埋め込まれたテクスチャを GLTFLoader が Blob URL で読む |
| `connect-src` / `font-src` / `media-src` / `worker-src` | `'self'` | |
| `frame-src` / `object-src` / `base-uri` / `form-action` / `frame-ancestors` | `'none'` | 埋め込み・プラグイン・`<base>`・フォーム送信を使わない。他サイトへの埋め込み禁止 |
| `upgrade-insecure-requests` | | 本番は https のみ |
| `X-Frame-Options` | `DENY` | 古いブラウザ向けのクリックジャッキング対策 |
| `X-Content-Type-Options` | `nosniff` | |
| `Referrer-Policy` | `no-referrer` | 外へのリンクはない。共有データはフラグメントなので元々送られない |
| `Permissions-Policy` | カメラ・マイク・位置・決済・USB・センサー・画面共有・XR など全部 `()` | 使わない機能を無効化。クリップボードの書き込み(共有リンクのコピー)と全画面は残す |
| `Cross-Origin-Opener-Policy` | `same-origin` | 別ウィンドウからの参照を切る |
| `Cross-Origin-Resource-Policy` | `same-origin` | 他サイトから資源を読ませない |
| `Strict-Transport-Security` | `max-age=31536000` | |

採らなかったもの:

- **COEP(`require-corp`)**:CSP で外部読み込みをすでに禁止しているので得るものが少なく、
  有効にすると `crossOriginIsolated` になり高精度タイマー・SharedArrayBuffer が使えるようになる(不要)
- **CSP の報告先(report-to)**:受け取るサーバーがない
- Draco・KTX2 の圧縮 GLB:デコーダーが Blob URL の Worker と外部 CDN を使うため、Trusted Types と CSP で止まる。
  GLB は圧縮なしにする(ART-2 の条件)。必要になったら自前で配信し、Trusted Types のポリシーを 1 つだけ足す

共有リンクは URL の**フラグメント**(`#s=`)に置く。フラグメントはサーバーに送られないので、
Cloudflare のログ(observability)やリファラに設計は残らない。

## 4. 手元の配信サーバー(`scripts/serve-dist.mjs`)

E2E と `pnpm serve:dist` が使う。本番(Cloudflare)ではない。

- 既定で `127.0.0.1` だけで待ち受ける(以前は全インターフェース。LAN から読めた・落とせた)。`HOST` で変更可
- 不正な `%` エスケープ・NUL は 400(以前は `URIError` でプロセスが落ちた)。壊れた HTTP も 400
- 実体パス(シンボリックリンクを解決した後)が配信ディレクトリの外なら配信しない(以前は外を指すリンクを読めた)。
  エスケープした `/`(`..%2f`)による `..` も拒否
- GET・HEAD だけ(ほかは 405)。`_headers` などの設定ファイルは配信しない
- ポート 0 で空きポート(実際のポートを表示)

## 5. 供給網(依存パッケージ)

| 設定 | 場所 | 意味 |
| --- | --- | --- |
| `minimumReleaseAge` | pnpm 11 の既定(1440 分 = 1 日) | 公開から 1 日たっていない版は入れない(乗っ取られた版が見つかって消されるまで待つ) |
| `minimumReleaseAgeExclude` | `pnpm-workspace.yaml` | 版を固定したベータ(`cf`、`@cloudflare/vite-plugin` と依存)だけ例外。**新しい版を足すときは中身を確認してから**。不要になったら消す |
| `trustPolicy: no-downgrade` | `pnpm-workspace.yaml` | 以前の版より信頼の証拠(provenance・trusted publishing)が弱い版を拒否(パッケージの乗っ取り対策) |
| `allowBuilds` | `pnpm-workspace.yaml` | インストール時のスクリプトは `workerd` だけ許可(pnpm 11 の既定 `strictDepBuilds: true` で、ほかは失敗する) |
| `blockExoticSubdeps` | pnpm 11 の既定(true) | 依存の依存が git や URL を指すのを拒否 |
| `pnpm-lock.yaml` | リポジトリ | 解決した版を固定。CI・合流は `--frozen-lockfile` |
| `pnpm deps:check` | `scripts/deps.mjs` | `pnpm audit` の既知の脆弱性 0 件と、直接依存が最新(固定したベータは同じ系列の最新)であることを確認 |
| 実行時の外部読み込み | なし | すべてバンドルする。CDN を使わない(CSP で禁止) |

依存を足さない(CLAUDE.md)。足す・上げるときは `pnpm deps:update` → `pnpm verify --e2e` → 差分のロックファイルを読む。

## 6. デプロイ前にやること

1. `pnpm deps:check` が PASS(脆弱性 0、最新)。FAIL なら `pnpm deps:update` → 動作確認
2. `pnpm verify --e2e` が PASS(ファズ・改ざん・ヘッダー・Trusted Types の E2E を含む)
3. `public/_headers` を変えたなら、本番相当で全画面を開いてコンソールに CSP・Trusted Types の違反がないこと(E2E が自動で確認)
4. `pnpm-workspace.yaml` の `minimumReleaseAgeExclude` に不要な項目が残っていないこと
5. `pnpm deploy`(`deps:check` と `verify`(E2E なし)を自動で実行してから `cf deploy`。E2E は 2 で済ませておく)
6. 配信後、本番 URL で `curl -sI https://<host>/` を実行してヘッダーが付いていることを確かめる

## 7. テスト

| ファイル | 内容 |
| --- | --- |
| `src/core/model/lz.test.ts` | 上限つき展開が lz-string と同じ結果を返す(差分テスト 5000 件以上)、展開爆弾を上限で止める |
| `src/core/model/security.test.ts` | 見つけた問題ごとの回帰テスト(展開爆弾、巨大な配列、予約 id、プロトタイプのキー、名前の制御文字、位相、Infinity) |
| `src/core/model/fuzz.test.ts` | シード付きファズ:正しい共有リンク・ファイルをバイト単位と構造で壊す、任意の JSON、10 万段の入れ子、例外を投げる Proxy。例外なし・時間の上限・読めたものは検査済みで往復で変わらない |
| `src/core/model/hostile.test.ts` | 検査を通る意地の悪い設計で、ソルバー・解析・試走が有限時間で NaN なし |
| `src/core/storage/tamper.test.ts` | localStorage の改ざん・破損・巨大な値・新しい版のデータで起動が落ちない |
| `e2e/security.spec.ts` | 配信サーバーのパス走査・シンボリックリンク・壊れた URL、本番ヘッダー、全画面の Trusted Types、XSS の入口と eval が止まること、展開爆弾のリンクで固まらないこと |

ファズは `createRng(seed)`(`src/core/model/fuzzing.ts`)で決定論的。失敗したら表示されるシードと番号で再現できる。
新しい入口(読み込む形式)を足したら、`fuzz.test.ts` の `everyEntryPoint` に加える。

## 8. 申し送り(このストリームの範囲外で見つけたもの)

| 重さ | 場所 | 内容 | 直し方 |
| --- | --- | --- | --- |
| 低 | `src/main.tsx:27` | `routes[name] ?? routes.app` の `name` は `?dev=` の値。`?dev=constructor` などで `Object` のメンバーを読み、ページが真っ白になる(例外) | `Object.hasOwn(routes, name) ? routes[name]! : routes.app!` |
| 中 | `src/editor`(部品の追加・貼り付け) | 設計の上限(`MAX_JOINTS` など)をエディタが強制しない。超えた設計は再読み込みで読めず、作業が消える | `validate.ts` の定数で追加・貼り付けを止め、理由を表示する |
| 低 | `src/core/kinematics/solve.ts`(`runNewton`)・`compile.ts` | 密行列のニュートン法は未知点の数の 3 乗。上限いっぱいで 1 ステップ 17ms(16 組) | ニュートン法のブロックの大きさに上限(例:24 点)を置き、超えたら compile の issue にして試走前チェックで止める |
| 低 | `src/testrun/clock.ts` | 1 フレームの上限はステップ数(40)だけ。重い設計だと 1 フレーム 0.7 秒 | 実時間の予算(例:12ms)を超えたら残りを捨てる |
| 低 | `src/game/run.ts`(`runStage`)| ヘッドレス試走は同期で最大 7200 ステップ。最悪 2 分メインスレッドを止める | 分割実行か Worker、実時間の打ち切り |
| 低 | `src/dev/ResultPlayground.tsx:62` | `<style>{CSS}</style>` が CSP の `style-src 'unsafe-inline'` を必要にしている唯一の箇所 | CSS ファイルに移し、`_headers` を `style-src 'self'` にする |
| 情報 | `scripts/wt.sh gate` | `--frozen-lockfile` が失敗すると通常の install に落ちて、合流中に解決済みの版が変わりうる | 失敗させる(ロックファイルを直してから合流) |
| 情報 | `src/i18n/index.ts` | `dictionaries[current][key]` と `hasKey`(`in`)はプロトタイプのキーも引く。キーはコード内の定数なので今は無害 | `Object.hasOwn` を使う |
| 情報 | FLOW-3・FLOW-5(未実装) | 共有リンク・ファイルの読み込みの配線 | 必ず `decodeShare` / `readDesignFile` を通す。`loadSettings` の guard は既知のフィールドだけで新しいオブジェクトを作る |
