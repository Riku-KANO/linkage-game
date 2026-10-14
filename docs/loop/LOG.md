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
- [合流] model(MOD-1〜5)→ main。86 テスト。共有 URL:見本機+スコア 334 文字、30 秒ゴースト込み 2949 文字。
  統合時の注意:LoadFailReason / SaveFailReason を i18n キーに写す、ゴーストは 8 値/フレーム(姿勢+モーター角)
- [合流] audio(AU-1〜3)→ main。`installAudio()` を main.tsx で呼ぶ。`?dev=audio`。音は未試聴(要確認)
- [合流] kinematics(KIN-1〜6)→ main。ヤンセン脚先:歩幅 49.7cm、平らさ 0.31cm、足上げ 22.5cm、デューティ 0.37。
  性能:100 ジョイント×4 サブステップ(微分込み)0.02ms/フレーム(予算 4ms)、解析 180 サンプル 0.1ms(予算 10ms)。
  → JS で予算の 1/200。WASM(PERF-2)は計測結果を見て判断するが、運動学に限れば必要性は低い見込み
  挙動変更:冗長リンクがあると solvePose が ok=false。チェビシェフのプリセットは直線区間が上側(要対応)
- 調査:チェビシェフの寸法(地節 2、クランク 1、揺動節 2.5、カップラー 2.5)で、カップラー上の点・組立モード・地節の向きを
  総当たりしたが、機体を上に置いて「平らな区間が下に来る」良い脚は見つからなかった(最良でも歩幅 13.5cm・デューティ 0.30)。
  直線区間はどの配置でもピボット側に来る。`chebyshevLambda` は軌道(直線運動)の見本と図鑑用に残し、歩行の安定性検証では
  「不格好な機構」側の例として扱う
- [合流] game(GAME-1〜6)→ main。191 テスト。10 ステージ(章 1:壊れた機械 2 つ+白紙から+長距離 2、章 2:段差・脚列・
  詰まった機械・溝・予算つき)。全ステージに参照解(四節脚 2 種とヤンセン機)。メダル基準・制限時間は仮値
  → 統合ウェーブで参照解を runHeadless に通して調整する
