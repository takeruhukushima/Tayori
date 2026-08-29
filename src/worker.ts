// Worker 1本ですべてを配る:
//   /.well-known/did.json                       → did:web の DIDドキュメント
//   /xrpc/app.bsky.feed.describeFeedGenerator    → フィード一覧
//   /xrpc/app.bsky.feed.getFeedSkeleton          → フィードのスケルトン
//   それ以外                                      → Static Assets(dist/) にフォールバック
import { Hono } from "hono";
import { feeds } from "../feeds/index";
import { getFeedSkeleton } from "./feed-api";

interface Env {
  ASSETS: Fetcher;
  HOSTNAME: string;
  PUBLISHER_DID: string;
  APPVIEW: string;
}

const app = new Hono<{ Bindings: Env }>();

const FEED_COLLECTION = "app.bsky.feed.generator";

// did:web の DIDドキュメント。ホスト名しか解決しない（サブパス不可）。
app.get("/.well-known/did.json", (c) => {
  const { HOSTNAME } = c.env;
  return c.json({
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: `did:web:${HOSTNAME}`,
    service: [
      {
        id: "#bsky_fg",
        type: "BskyFeedGenerator",
        serviceEndpoint: `https://${HOSTNAME}`,
      },
    ],
  });
});

// feeds/index.ts の全エントリを列挙する（ハードコードしない）。
app.get("/xrpc/app.bsky.feed.describeFeedGenerator", (c) => {
  const { HOSTNAME, PUBLISHER_DID } = c.env;
  return c.json({
    did: `did:web:${HOSTNAME}`,
    feeds: Object.values(feeds).map((f) => ({
      uri: `at://${PUBLISHER_DID}/${FEED_COLLECTION}/${f.rkey}`,
    })),
  });
});

// フィードのスケルトン。cursor は受け取るが無視し、返さない（ページングなし）。
app.get("/xrpc/app.bsky.feed.getFeedSkeleton", async (c) => {
  const feedUri = c.req.query("feed");
  if (!feedUri) {
    return c.json({ error: "InvalidRequest", message: "feed is required" }, 400);
  }

  // feed の末尾セグメントを rkey として取り出す
  const rkey = feedUri.split("/").pop() ?? "";
  const cfg = feeds[rkey];
  if (!cfg) {
    return c.json(
      { error: "UnknownFeed", message: `unknown feed: ${rkey}` },
      400,
    );
  }

  // limit: 省略時30、最大100
  const raw = Number.parseInt(c.req.query("limit") ?? "30", 10);
  const limit = Number.isNaN(raw) ? 30 : Math.min(Math.max(raw, 1), 100);

  const body = await getFeedSkeleton(c.env.APPVIEW, cfg, limit);
  return c.json(body);
});

// 静的ページ（/, /{rkey}/）は Static Assets が配信する。
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
