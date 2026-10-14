# アシクミ(リンク機構歩行機械ゲーム)

棒・ジョイント・モーターで脚の機構を発明し、3D の障害コースで歩かせる Web パズルゲーム。
要件は `docs/draft.md`(要件定義書)。要件 ID(E-xx, S-xx, U-xx, T-xx)で参照する。

## コマンド

| コマンド | 内容 |
| --- | --- |
| `pnpm dev` | 開発サーバー。`?dev=editor|sim|scene|testrun|result|audio` で各プレイグラウンド |
| `pnpm verify` | **検証ゲート**:format → typecheck → test → build。合否はこれだけで決める |
| `pnpm verify --quick` | build を省く(内側ループ用) |
| `pnpm verify --fix` | prettier で整形してから検証 |
| `pnpm e2e` / `pnpm verify --e2e` | Playwright の E2E:本番ビルドを本番ヘッダー(CSP)つきで配信し、実 Chromium で開く(`e2e/`)。並行実行時は `E2E_PORT=<空きポート>` |
| `pnpm test -- <path>` | 一部のテストだけ実行 |
| `scripts/wt.sh new/sync/gate/rm <name>` | ワークツリーの作成・同期・合流(`docs/loop/README.md`) |
| `pnpm deps:check` / `pnpm deps:update` | 依存の脆弱性と鮮度のゲート / 最新へ更新(セキュリティ方針:できるだけ最新) |
| `pnpm deploy:dry` / `pnpm deploy` | Cloudflare への配信(`cf` CLI、`docs/deploy.md`)。`deploy` は deps:check と verify に合格したときだけ実行 |

パッケージマネージャは pnpm。`claude` コマンドは使わない。

## アーキテクチャ(モジュールと担当)

| ディレクトリ | 内容 | 要件 |
| --- | --- | --- |
| `src/core/math` | ベクトル等の数学 | |
| `src/core/model` | 設計データ(DesignDoc)、プリセット、コスト、保存・共有・移行 | E-07, U-01〜U-03 |
| `src/core/kinematics` | 運動学ソルバー、自由度・グラスホフ・死点の解析、脚列の複製 | S-01, S-02, E-04〜E-06 |
| `src/core/sim` | 歩行の動力学(剛体+自前接触モデル)、Rapier の地形判定、モーター | S-03〜S-05 |
| `src/editor` | 2D 設計ビュー(SVG)と編集操作 | E-02〜E-08 |
| `src/scene` | 3D の工房、カメラリグ、画面遷移、ホーム | UI・演出、T-00〜T-08 |
| `src/game` | ステージ定義、評価・メダル、進行、チュートリアル、ヒント | 章 1・2、U-05 |
| `src/app` | 画面状態(zustand)と全体の組み立て | |
| `src/ui` | デザイントークン(イージング・遷移時間)、共通 UI 部品 | |
| `src/i18n/ja/<module>.ts` | 文言。**モジュールごとに自分のファイルだけ編集する** | U-07 |
| `src/dev` | 開発用プレイグラウンド | |

**契約(型)ファイル**:`src/core/model/types.ts`, `src/core/sim/types.ts`, `src/game/types.ts`,
`src/ui/tokens.ts`, `src/app/store.ts`, `src/editor/store.ts`。
並行開発中はここを壊さない。変更が必要なら**後方互換な追加だけ**にし、報告に書く。

## 規約

- TypeScript strict。`any` は使わない。`noUncheckedIndexedAccess` が有効
- コメントと UI 文言は日本語。ユーザーに見える文字列は必ず `t('key')` 経由(`src/i18n`)
- 座標:設計ビューは cm、+x 前進、+y 上。3D は m、+x 前進、+y 上、z 奥行き(`CM = 0.01`)
- シミュレーションは決定論的に:固定タイムステップ、`Math.random` 禁止(必要ならシード付き乱数)、反復順序を固定
- 純粋なロジック(core, game)は React・three に依存しない。テストは Vitest(`*.test.ts` を対象ファイルの隣に置く)
- 依存パッケージは追加しない(必要なものは導入済み)。どうしても必要なら理由を報告する。追加・更新するときは常に最新版(セキュリティ方針)
- 性能目標:複製後 100 ジョイントで運動学ソルバー 4ms/フレーム以内、内蔵 GPU で 60fps

## 内側ループ(各エージェントの作業手順)

1. `docs/loop/BACKLOG.md` の自分のタスクと受け入れ条件を読む
2. 受け入れ条件をテストに落とす(先に失敗するテストを書く)
3. 実装する
4. `pnpm verify --quick` を回し、失敗したら直して 4 に戻る(合格するまで繰り返す)
5. 区切りごとに小さくコミットする(Conventional Commits、例:`feat(kinematics): grashof check`)
6. 最後に `pnpm verify`(build 込み)を通し、BACKLOG の自分のタスクの状態を更新してコミット
7. 報告:やったこと、契約の変更、残課題、次にやるべきこと

検証を通らない状態でコミットを終えない。テストを消したり弱めたりして通さない。

見た目の確認:共有のブラウザ画面は使わず、Playwright で自分のポート(`E2E_PORT`)に本番ビルドを出し、
`page.screenshot()` で PNG を保存して Read で見る。画面に関わる変更は E2E テスト(`e2e/`)も足す。
