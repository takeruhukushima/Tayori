// フィード取得の中核: fan-out → dedupe → 判定 → 整列 → キャッシュ。
import type { FeedConfig } from "./types";
import { matchPost } from "./match";
import { getAuthorFeed, searchPosts, type UpstreamPost } from "./bsky";

const CACHE_TTL_SECONDS = 90;
const MAX_MERGED = 100; // キャッシュに載せる上限（limit の最大値ぶん）

// マージ後の結果をrkey単位で90秒キャッシュする。
// キーにrkeyを含める — フィード間で結果が混ざると事故になる。
function cacheKey(rkey: string): string {
  return `https://tayori.cache/feed-v2/${encodeURIComponent(rkey)}`;
}

// 上流を叩いてマージ・判定・整列した投稿（最大 MAX_MERGED 件）を作る。
async function buildMerged(
  appview: string,
  cfg: FeedConfig,
): Promise<UpstreamPost[]> {
  const tasks: Promise<UpstreamPost[]>[] = [
    ...cfg.queries.map((q) => searchPosts(appview, q)),
    ...cfg.sources.map((did) => getAuthorFeed(appview, did)),
  ];

  // 上流1本の失敗で全体を落とさない
  const results = await Promise.allSettled(tasks);
  const merged: UpstreamPost[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") merged.push(...r.value);
    else console.warn("upstream failed:", r.reason);
  }

  // URIで重複排除
  const byUri = new Map<string, UpstreamPost>();
  for (const p of merged) if (!byUri.has(p.uri)) byUri.set(p.uri, p);

  const cutoff = Date.now() + 60_000; // 1分以上未来の投稿は除外
  return [...byUri.values()]
    .filter((p) => matchPost(p.text, p.did, cfg))
    .filter((p) => {
      const t = Date.parse(p.createdAt);
      return !Number.isNaN(t) && t <= cutoff;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_MERGED);
}

// キャッシュヒット時は上流に出ず、Bluesky用とWeb表示用で結果を共有する。
async function getMergedPosts(
  appview: string,
  cfg: FeedConfig,
): Promise<UpstreamPost[]> {
  const cache = caches.default;
  const key = cacheKey(cfg.rkey);

  const hit = await cache.match(key);
  if (hit) {
    return (await hit.json()) as UpstreamPost[];
  }

  const posts = await buildMerged(appview, cfg);
  const res = new Response(JSON.stringify(posts), {
    headers: {
      "content-type": "application/json",
      "cache-control": `max-age=${CACHE_TTL_SECONDS}`,
    },
  });
  await cache.put(key, res);
  return posts;
}

export async function getFeedSkeleton(
  appview: string,
  cfg: FeedConfig,
  limit: number,
): Promise<{ feed: { post: string }[] }> {
  const posts = await getMergedPosts(appview, cfg);
  return {
    feed: posts.slice(0, limit).map(({ uri: post }) => ({ post })),
  };
}

export async function getFeedPosts(
  appview: string,
  cfg: FeedConfig,
  limit: number,
): Promise<{ posts: UpstreamPost[] }> {
  const posts = await getMergedPosts(appview, cfg);
  return { posts: posts.slice(0, limit) };
}
