# Tayori

Blueskyのカスタムフィードを複数まとめてホストする単一 Cloudflare Worker。最初のフィードは都城（`miyakonojo`）。

同じ Worker が静的ページ・フィードAPI・DIDドキュメントを配る。**データベースを持たない**（状態なし）。

## 構成

| パス | 返すもの | 担当 |
|---|---|---|
| `/`, `/{rkey}/` | Astroでビルドした静的ページ | Static Assets (`dist/`) |
| `/xrpc/app.bsky.feed.getFeedSkeleton` | フィードのスケルトン | Worker (Hono) |
| `/xrpc/app.bsky.feed.describeFeedGenerator` | フィード一覧 | Worker (Hono) |
| `/.well-known/did.json` | `did:web` のDIDドキュメント | Worker (Hono) |

ページのデータ取得は**ブラウザが直接** `public.api.bsky.app` を叩く（自分の `/xrpc` は叩かない）。ページのアクセス増で Worker のレート制限枠を消費しないための意図的な分離。

## 開発

```sh
pnpm install
pnpm dev        # Astro dev サーバ（ページのみ）
pnpm preview    # wrangler dev（Worker + Static Assets 一体）
pnpm test       # 判定ロジック（src/match.ts）のテスト
pnpm check      # astro check + Worker側 tsc
```

`pnpm preview` で上流が WAF に当たる場合は `--var APPVIEW:https://api.bsky.app` を付ける。

## フィードを増やす

1. `feeds/<rkey>.ts` を1つ足す（`FeedConfig`）
2. `feeds/index.ts` の `feeds` に登録
3. `pnpm publish-feeds <rkey>` で公開

判定ロジックは `src/match.ts` を Worker とページの両方が import する（コピーしない）。

## 設定

`wrangler.jsonc` の `vars`:

- `HOSTNAME` — 当面 `tayori.{account}.workers.dev`。カスタムドメイン移行時はここだけ変える（`did:web` はこの値で解決）
- `PUBLISHER_DID` — フィードレコードを置くアカウントの DID
- `APPVIEW` — 上流 appview のベースURL（既定 `https://public.api.bsky.app`）

## 公開

```sh
cp .dev.vars.example .dev.vars   # BSKY_HANDLE / BSKY_APP_PASSWORD / HOSTNAME を埋める
pnpm publish-feeds               # 全フィードを putRecord（rkey引数で単体）
pnpm deploy                      # astro build && wrangler deploy
```

`publish-feeds` は publish 先アカウントの DID を出力する。これを `wrangler.jsonc` の `PUBLISHER_DID` に設定する。

## デプロイ直後の確認（重要）

Worker の egress はデータセンターIPのため、上流の WAF に当たることがある。初回デプロイ後にフィードが空でないか確認する：

```sh
curl 'https://{HOSTNAME}/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://{PUBLISHER_DID}/app.bsky.feed.generator/miyakonojo'
```

- at:// URI の配列が返る → OK
- `feed: []` が返り続ける → `public.api.bsky.app` が WAF で弾かれている可能性。`APPVIEW` を `https://api.bsky.app` に変えて再デプロイ。
  - 既知: `public.api.bsky.app/xrpc/app.bsky.feed.searchPosts` はデータセンターIPからHTMLの403を返すことがある（認証エラーではなくWAF）。`api.bsky.app` は同じ appview で通ることが多い。`getAuthorFeed` は両ホストとも通る。

## 技術

Cloudflare Workers (Static Assets) / Hono / Astro (`output: static`) / TypeScript / pnpm
