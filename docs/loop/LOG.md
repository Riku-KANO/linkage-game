# LOG(外側ループの記録)

## ウェーブ 0 — 基盤(main)

- 雛形:Vite 8 / React 19 / TypeScript 7 / R3F 9 / drei 10 / Vitest 5 / pnpm 11
- 検証ゲート `pnpm verify`(format → typecheck → test → build)を導入
- 運動学ソルバーの核を実装。ヤンセンの脚先は y ≈ -91.8cm で約 1/3 周期平ら(歩幅 ≈ 40cm)、
  チェビシェフ(ホーケン配置)は y ≈ -40 でクランク 180° の間ほぼ直線(偏差 < 0.15cm)
- 観測:ホーケン/ラムダ配置では直線区間が常にピボット側に来る(どの同源機構でも同じ)。
  そのためチェビシェフ型を脚にすると、膨らんだ側が接地する。歩行の安定性検証(マイルストーン 2)で要確認

## ウェーブ 1 — 並行 7 ストリーム(進行中)

- ワークツリー:kinematics / model / editor / sim / scene / game / audio(`.worktrees/<name>`、`feat/<name>`)
- 利用者の指示で配信を `cf` CLI(1.0.0-beta.17)に変更。`cf init .` の自動設定で Workers 静的アセット + SPA フォールバック。
  `cf build` と `cf deploy --dry-run` は認証なしで合格。Vite プラグイン追加後も `pnpm verify` 合格
- WASM:Rust 1.97(wasm32 ターゲット)と wasm-pack が利用可能。KIN-5 / SIM-6 のベンチマーク結果を見て PERF-2 で判断する
- 利用者の方針「セキュリティのため依存はできるだけ最新」を受けて `pnpm deps:check` / `deps:update`(scripts/deps.mjs)を追加。
  `cf init` が固定した `@cloudflare/vite-plugin` の古いベータが miniflare 経由で undici(<7.29.1)と sharp(<0.35.5)の
  既知の脆弱性 11 件(high 3)を持ち込んでいたので最新ベータへ更新 → 0 件。`trustPolicy: no-downgrade` を有効化。
  外側ループの手順 0 と `pnpm deploy` の前提に deps:check を入れた
