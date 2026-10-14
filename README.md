# アシクミ

棒・ジョイント・モーターだけで脚の機構を発明し、その機械を 3D の障害コースで歩かせる Web パズルゲーム。
クランクの回転が「歩き」に変わる瞬間を、自分の手で発見する。

- 要件定義書:[docs/draft.md](docs/draft.md)
- 開発の進め方(ループエンジニアリング):[docs/loop/README.md](docs/loop/README.md)、タスク:[docs/loop/BACKLOG.md](docs/loop/BACKLOG.md)、記録:[docs/loop/LOG.md](docs/loop/LOG.md)
- 配信:[docs/deploy.md](docs/deploy.md)

## 必要なもの

- Node.js 22 以上、pnpm 11
- (任意)Rust と wasm-pack — WASM 版ソルバーを作り直すときだけ

## はじめかた

```sh
pnpm install
pnpm dev          # http://localhost:5173
```

開発用のプレイグラウンド:`?dev=editor`(2D 設計ビュー)、`?dev=sim`(歩行シミュレーション)、`?dev=scene`(3D の工房)、
`?dev=testrun`(試走ビュー)、`?dev=result`(結果画面)、`?dev=audio`(効果音)。

## コマンド

| コマンド | 内容 |
| --- | --- |
| `pnpm verify` | 検証ゲート:整形 → 型 → テスト → ビルド。マージの合否はこれで決める |
| `pnpm test` | テストだけ |
| `pnpm deps:check` / `pnpm deps:update` | 依存の脆弱性と鮮度の確認 / 最新へ更新 |
| `pnpm build && pnpm serve:dist` | 本番ビルドを本番と同じセキュリティヘッダーで手元配信(http://localhost:4173) |
| `pnpm deploy:dry` / `pnpm deploy` | Cloudflare への配信(`cf` CLI) |

## 構成

TypeScript・Vite・React・React Three Fiber。サーバーは持たず、静的ファイルだけで動く。

| ディレクトリ | 内容 |
| --- | --- |
| `src/core/kinematics` | 運動学ソルバー(解析解+ニュートン法)、自由度・グラスホフ・死点の解析、脚列の複製 |
| `src/core/sim` | 歩行の動力学(剛体+自前の接触モデル、地形判定は Rapier) |
| `src/core/model` / `src/core/storage` | 設計データ、プリセット、コスト、検証・移行、共有リンク、自動保存 |
| `src/editor` | 2D 設計ビュー |
| `src/scene` / `src/testrun` / `src/result` | 3D の工房と画面遷移、試走ビュー、結果画面 |
| `src/game` | ステージ、評価、進行、ヒント、チュートリアル |
| `src/audio` | 合成の機械音 |

## セキュリティ方針

- 依存はできるだけ最新、既知の脆弱性 0(`pnpm deps:check`)。pnpm の供給網対策(公開直後の版を待つ、信頼度の低下を拒否、ビルドスクリプトの許可制)を有効にしている
- 本番は厳しい CSP で配信する(外部への通信・外部スクリプトなし)。共有は URL のフラグメントだけで行い、サーバーに何も送らない
