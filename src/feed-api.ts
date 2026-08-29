// getFeedSkeleton の中核: fan-out → dedupe → 判定 → 整列 → キャッシュ。
import type { FeedConfig } from "./types";
import { matchPost } from "./match";
import { getAuthorFeed, searchPosts, type UpstreamPost } from "./bsky";

const CACHE_TTL_SECONDS = 90;
const MAX_MERGED = 100; // キャッシュに載せる上限（limit の最大値ぶん）

// マージ後の結果をrkey単位で90秒キャッシュする。
// キーにrkeyを含める — フィード間で結果が混ざると事故になる。
function cacheKey(rkey: string): string {
  return `https://tayori.cache/feed/${encodeURIComponent(rkey)}`;
}

// 上流を叩いてマージ・判定・整列した URI 列（最大 MAX_MERGED 件）を作る。
async function buildMerged(
  appview: string,
  cfg: FeedConfig,
): Promise<string[]> {
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
    .slice(0, MAX_MERGED)
    .map((p) => p.uri);
}

// getFeedSkeleton のレスポンス body を返す。キャッシュヒット時は上流に出ない。
export async function getFeedSkeleton(
  appview: string,
  cfg: FeedConfig,
  limit: number,
): Promise<{ feed: { post: string }[] }> {
  const cache = caches.default;
  const key = cacheKey(cfg.rkey);

  let uris: string[] | null = null;
  const hit = await cache.match(key);
  if (hit) {
    uris = (await hit.json()) as string[];
  } else {
    uris = await buildMerged(appview, cfg);
    const res = new Response(JSON.stringify(uris), {
      headers: {
        "content-type": "application/json",
        "cache-control": `max-age=${CACHE_TTL_SECONDS}`,
      },
    });
    await cache.put(key, res);
  }

  return { feed: uris.slice(0, limit).map((post) => ({ post })) };
}
