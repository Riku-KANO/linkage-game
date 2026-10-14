# デプロイ(Cloudflare、cf CLI)

Cloudflare の新しい統合 CLI `cf`(Wrangler の次期版、テクニカルプレビュー)で配信する。
`cf init .` の自動設定で、Vite のビルド結果を **Workers の静的アセット**(Pages の後継となる静的配信。
サーバー側の処理は持たない)として配信する構成にした。

| ファイル | 内容 |
| --- | --- |
| `cloudflare.config.ts` | Worker 名 `ashikumi`、互換日付、`assets.notFoundHandling: single-page-application` |
| `vite.config.ts` | `@cloudflare/vite-plugin` を追加(`cf build` がこれを使って Build Output を作る) |
| `public/_headers` | `/assets/*` を immutable で長期キャッシュ |
| `pnpm-workspace.yaml` | pnpm 11 で `workerd` のビルドスクリプトを許可 |

## 手順

```sh
pnpm exec cf auth login      # 初回のみ(ブラウザで OAuth)。CI では CLOUDFLARE_API_TOKEN を使う
pnpm deploy:dry              # ビルドと検査だけ(アップロードしない)
pnpm deploy                  # = cf deploy(ビルドしてアップロード)
```

- テレメトリを送りたくない場合は `DO_NOT_TRACK=1` を付けるか `pnpm exec cf cli telemetry disable`
- `cf` はベータのため `1.0.0-beta.17` に固定している。上げるときは `pnpm deploy:dry` で確認する
- `cf pages deploy <dir>` で従来の Pages に出すこともできるが、`cf` の標準経路(`cf deploy`)に合わせた
