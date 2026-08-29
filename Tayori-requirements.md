# Tayori 要件定義

Blueskyのカスタムフィードを複数まとめてホストする。最初のフィードは都城（`miyakonojo`）。

## 構成

**Cloudflare Workers 1本にすべてを載せる。**同じWorkerが静的ページ、フィードAPI、DIDドキュメントを配る。デプロイ先もドメインも1つ。

| パス | 返すもの |
|---|---|
| `/`, `/{rkey}/` | Astroでビルドした静的ページ |
| `/xrpc/app.bsky.feed.getFeedSkeleton` | フィードのスケルトン |
| `/xrpc/app.bsky.feed.describeFeedGenerator` | フィード一覧 |
| `/.well-known/did.json` | `did:web` のDIDドキュメント |

ホスト名は当面 `tayori.{account}.workers.dev` を使う。カスタムドメインは後から差し替えられるようにしておく（`HOSTNAME` 環境変数で切り替わること）。

**`did:web` はホスト名しか解決しない。**サブパスは使えないため、GitHub Pagesのプロジェクトページは選択肢にならない。この制約が構成を決めている。

## 技術

- Cloudflare Workers（Static Assets機能で `dist/` を配信）
- Hono（ルーティング）
- Astro（静的ページの生成）
- TypeScript

## 全体の制約

- **データベースを使わない。**D1、KV、R2、いずれも使わない。状態を持たない
- 状態を持たないため、以下は実装しない
  - 履歴が必要なランキング（初参加ブースト、未回答質問ブースト等）
  - ページネーション（カーソル）
  - 統計・計測エンドポイント
  - Bot、スクレイピング、自動投稿（→ 後述の「C. Bot」を参照。MVPでは作らない）
- 並び順は `createdAt` の降順のみ
- テストは判定ロジックにのみ書く

---

## 1. フィード定義

**1つのサービスDIDの下に複数のアルゴリズムを載せられる**のがATProtoの仕様なので、Tayoriはその置き場として作る。フィードを増やすときは `feeds/` にファイルを1つ足し、publishスクリプトを流すだけで済むこと。

`feeds/miyakonojo.ts`:

```ts
import type { FeedConfig } from '../src/types';

export const miyakonojo: FeedConfig = {
  rkey: 'miyakonojo',
  displayName: '都城のいま',
  description: 'Bluesky上で都城について書かれた投稿を集めています。都城市とは関係のない個人プロジェクトです。',

  // searchPosts に投げる語。増やすほど上流コストが上がるので絞る
  queries: ['都城', '都城市', '霧島酒造'],

  // 本文に含まれれば通す語
  strongTerms: [
    '都城', 'みやこのじょう', 'ミヤコノジョウ', '霧島酒造', '黒霧島',
    '都城島津', '関之尾', '母智丘', '早水公園', '都城高専',
    '高城町', '山之口', '志和池', '庄内町', '高崎町',
  ],

  // 曖昧な語と、それを打ち消す文脈語
  ambiguous: {
    term: '都城',
    excludeWhen: [
      '都城制', '条坊', '平城京', '平安京', '藤原京', '藤原宮', '難波宮',
      '長安', '洛陽', '新羅', '百済', '渤海', '考古学', '遺構', '発掘調査',
    ],
  },

  // 「都城」と書かない地元アカウント。無条件で通す
  sources: [
    // 'did:plc:xxxx', // example.bsky.social — 地元の飲食店
  ],
};
```

`feeds/index.ts` で全フィードを `Record<rkey, FeedConfig>` としてexportする。

## 2. 判定ロジック

`src/match.ts` に純関数として置く。WorkerがBlueskyフィード用とWeb表示用の両方に適用する。

1. 著者DIDが `sources` に含まれる → **本文に関係なく通す**。これがキーワード検索との差分であり、この機能の存在理由
2. 本文が `strongTerms` のいずれも含まない → 除外
3. ヒットが `ambiguous.term` **のみ**で、本文が `excludeWhen` のいずれかを含む → 除外
4. それ以外 → 通す

**3が重要。**「都城」は古代都市を指す一般名詞でもある（都城制、藤原京の都城、唐の都城）。弾かないとフィードが日本史クラスタで埋まる。他の固有名詞（霧島酒造など）が同時にヒットしていれば地名で確定なので、この除外はかけない。

### テスト

`src/match.test.ts`。最低限これらの期待値を固定する。

| 入力 | 期待 |
|---|---|
| 「都城の焼酎うまい」 | 通る |
| 「藤原京の都城制について」 | 除外 |
| 「都城の遺構の発掘調査」 | 除外（3の規則通り。取りこぼすが許容する） |
| 「霧島酒造の工場、都城の遺構の近く」 | 通る（他の語がヒットしている） |
| `sources` のDIDによる「今日はいい天気」 | 通る |

---

## 3. フィードAPI

上流は `APPVIEW` 環境変数で指定する（未認証）。

### `GET /.well-known/did.json`

```json
{
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "did:web:{HOSTNAME}",
  "service": [{
    "id": "#bsky_fg",
    "type": "BskyFeedGenerator",
    "serviceEndpoint": "https://{HOSTNAME}"
  }]
}
```

### `GET /xrpc/app.bsky.feed.describeFeedGenerator`

`feeds/index.ts` の全エントリを列挙する。ハードコードしない。

```json
{
  "did": "did:web:{HOSTNAME}",
  "feeds": [
    { "uri": "at://{PUBLISHER_DID}/app.bsky.feed.generator/miyakonojo" }
  ]
}
```

### `GET /xrpc/app.bsky.feed.getFeedSkeleton`

- クエリ: `feed`（at:// URI）, `limit`（省略時30、最大100）, `cursor`（**受け取るが無視する**）
- `feed` の末尾セグメントをrkeyとして取り出し、`feeds/index.ts` から設定を引く
- 該当rkeyが無ければ **400**
- レスポンス: `{ "feed": [{ "post": "at://..." }, ...] }`
- `cursor` は返さない（ページングなし）
- `Authorization` ヘッダは検証しない（公開フィード）

### 取得手順

1. `app.bsky.feed.searchPosts` を `queries` の各語で叩く（`sort=latest`, `limit=100`）
2. `app.bsky.feed.getAuthorFeed` を `sources` の各DIDで叩く（`limit=30`, `filter=posts_no_replies`。`reason` があるアイテム＝リポストは除外）
3. URIで重複排除し、判定を通し、`createdAt` 降順で並べ、`limit` 件返す

`createdAt` が現在時刻より1分以上未来の投稿は除外する（手動で日付を盛る投稿が実在する）。

### キャッシュ（必須）

リクエストごとに上流を叩くとレート制限に当たる。ブラウザと違い出口IPがCloudflareに集約されるため、省略できない。

- Cloudflare Cache API で**マージ後の結果を90秒キャッシュ**する
- **キャッシュキーにrkeyを含める。**フィード間で結果が混ざると事故になる
- キャッシュミス時のみ上流にfan-outする

上流1本の失敗で全体を落とさない。`Promise.allSettled` を使い、失敗分はログに出して残りで返す。

---

## 4. Webページ

同じWorkerから配信し、ブラウザは同一オリジンの `GET /api/feeds/{rkey}` から表示用投稿を取得する。

WorkerはBlueskyフィードとWeb表示でマージ後の90秒キャッシュを共有する。ブラウザを上流のWAF/CORSへ依存させず、Webアクセスごとの上流リクエスト増加も抑える。

### ルーティング

`feeds/index.ts` から `getStaticPaths` でページを生成する。

- `/` — フィード一覧。エントリが1つのときは `/miyakonojo/` に転送してよい
- `/{rkey}/` — そのフィードの投稿一覧

### 表示

- 本文、ハンドル、相対時刻、Blueskyの該当投稿へのリンク
- 50件程度。「もっと見る」は不要
- 判定済みの投稿をWorker APIから受け取る
- レスポンシブ。スマホで読めること
- Blueskyアカウント不要で誰でも見られること

### 状態

- 読み込み中: スケルトンまたは簡単なメッセージ
- 失敗: 「取得できませんでした」と再試行ボタン
- 0件: 「まだ投稿がありません」

謝罪しない。何が起きたかと、次にどうするかだけ書く。

### デザイン

- 日本語主体。フォントは Noto Sans JP 等
- 装飾は最小限。**中身はテキストの一覧**なので、可読性以外に投資しない
- ダークモード対応（`prefers-color-scheme`）

---

## 5. 設定と公開

### 環境変数（`wrangler.jsonc` の `vars`）

- `HOSTNAME` — 当面 `tayori.{account}.workers.dev`。カスタムドメイン移行時はここだけ変える
- `PUBLISHER_DID` — フィードレコードを置くアカウントのDID

### 公開スクリプト

`scripts/publish.ts` — `@atproto/api` を使い、`feeds/index.ts` の**全フィード**を `putRecord` する。既存レコードは上書きされるので、説明文の変更後に再実行できること。引数でrkeyを指定した場合はそれ1つだけ公開する。

環境変数 `BSKY_HANDLE` / `BSKY_APP_PASSWORD` / `HOSTNAME` から読む。

---

## 6. 完了条件

- `https://{HOSTNAME}/` をスマホのブラウザで開いて、都城関連の投稿が読める
- 各投稿をタップするとBlueskyの該当投稿が開く
- `curl 'https://{HOSTNAME}/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://{DID}/app.bsky.feed.generator/miyakonojo'` が at:// URI の配列を返す
- 存在しないrkeyを渡すと400が返る
- 2回目以降のフィードリクエストがキャッシュから返る（上流に出ない）
- Blueskyアプリのプロフィール > Feeds にフィードが表示され、開くと投稿が並ぶ

## 7. 実装順

1. `feeds/` の型定義と `miyakonojo.ts`
2. `src/match.ts` + テスト
3. Webページ — 動くものが早く手に入るのでこちらが先
4. フィードAPI

---

# C. Bot（MVPでは実装しない）

将来の拡張。**いま作らない。**着手時に迷わないよう方針だけ残す。

## なぜMVPに入れないか

- 重複防止（既に投稿したURLの記録）が必要で、状態を持たない方針と両立しない
- 外部依存が多い（相手サイトの構造、Blueskyアカウント、利用規約、cron）
- Botの投稿量が人の投稿を上回ると、フィードが告知板になり本来の目的を損なう。実際の投稿量を見てから判断すべき

## 追加時に必要なもの

- KV バインディング1つ（投稿済みURLの集合のみ。D1は過剰）
- cronトリガー1つ（1日1回）
- `src/bot.ts`
- シークレット `BOT_HANDLE` / `BOT_APP_PASSWORD`

**フィードとページのコードは変更しない。**Botは投稿を作る側、フィードは読む側で、両者はBluesky経由で繋がる。BotアカウントのDIDを `sources` に足すだけでフィードに流れる。

## 設計上の歯止め（実装時に必ず入れる）

- **初回実行では投稿しない。**記録のみ。初回スキャンで数百件を一斉投稿する事故を防ぐ
- **1回の実行で3件まで**
- **本文は転載せず、見出しとリンクのみ**
- Botアカウントのプロフィールに**非公式であることを明記する**。自治体名を冠したアカウントが公式に見えるのは実害が出る
- 取得元は**RSSを優先**。HTMLスクレイピングはサイト改修で壊れるため最後の手段
- `robots.txt` と利用規約を確認する
- リンクfacetの `byteStart`/`byteEnd` は**JSの文字インデックスではなくUTF-8バイト位置**。日本語混じりで必ず踏む

---

## やらないこと

念のため明示する。MVPで以下を実装しない。

- データベース、KV、R2、Cache API以外の永続化
- Bot、スクレイピング、自動投稿
- ページネーション、無限スクロール
- ユーザー認証、ログイン
- 統計・分析・管理画面
- リアルタイム更新（WebSocket、Jetstream、firehose）
