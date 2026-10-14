# デプロイ(Cloudflare、cf CLI)

Cloudflare の新しい統合 CLI `cf`(Wrangler の次期版、テクニカルプレビュー)で配信する。
`cf init .` の自動設定で、Vite のビルド結果を **Workers の静的アセット**(Pages の後継となる静的配信。
サーバー側の処理は持たない)として配信する構成にした。

| ファイル | 内容 |
| --- | --- |
| `cloudflare.config.ts` | Worker 名 `ashikumi`、互換日付、`assets.notFoundHandling: single-page-application` |
| `vite.config.ts` | `@cloudflare/vite-plugin` を追加(`cf build` がこれを使って Build Output を作る) |
| `public/_headers` | セキュリティヘッダー(CSP:外部通信・外部スクリプト禁止、WASM は `'wasm-unsafe-eval'` のみ許可、フレーム埋め込み禁止など)と、`/assets/*` の immutable キャッシュ |
| `pnpm-workspace.yaml` | pnpm 11 で `workerd` のビルドスクリプトを許可 |

## 手元での本番相当の確認

```sh
pnpm build && pnpm serve:dist   # _headers を適用して http://localhost:4173 で配信(CSP 違反はブラウザのコンソールに出る)
```

## 手順

```sh
pnpm exec cf auth login      # 初回のみ(ブラウザで OAuth)。CI では CLOUDFLARE_API_TOKEN を使う
pnpm deploy:dry              # ビルドと検査だけ(アップロードしない)
pnpm deploy                  # deps:check(脆弱性 0・最新)→ verify → cf deploy
```

- テレメトリを送りたくない場合は `DO_NOT_TRACK=1` を付けるか `pnpm exec cf cli telemetry disable`
- `cf` と `@cloudflare/vite-plugin` はベータを版固定している。`pnpm deps:update` が同じベータ系列の最新へ上げる
  (`cf init` が入れた古いベータのプラグインは miniflare 経由で undici・sharp の既知の脆弱性 11 件を含んでいたため、最新ベータへ更新して 0 件にした)
- `cf pages deploy <dir>` で従来の Pages に出すこともできるが、`cf` の標準経路(`cf deploy`)に合わせた
