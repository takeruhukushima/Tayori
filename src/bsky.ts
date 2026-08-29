// Worker 側の上流 appview 取得。接続先は APPVIEW 環境変数で指定する。

export interface UpstreamPost {
  uri: string;
  text: string;
  did: string;
  handle: string;
  createdAt: string;
}

// searchPosts / getAuthorFeed の投稿ビューを共通形に正規化する。
function normalize(view: any): UpstreamPost | null {
  if (!view?.uri || !view.author?.did || !view.record) return null;
  return {
    uri: view.uri,
    text: view.record.text ?? "",
    did: view.author.did,
    handle: view.author.handle ?? view.author.did,
    createdAt: view.record.createdAt ?? "",
  };
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

export async function searchPosts(
  appview: string,
  query: string,
): Promise<UpstreamPost[]> {
  const url = `${appview}/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(
    query,
  )}&sort=latest&limit=100`;
  const data = await getJson(url);
  return (data.posts ?? []).map(normalize).filter(Boolean) as UpstreamPost[];
}

export async function getAuthorFeed(
  appview: string,
  did: string,
): Promise<UpstreamPost[]> {
  const url = `${appview}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(
    did,
  )}&limit=30&filter=posts_no_replies`;
  const data = await getJson(url);
  // reason があるアイテム＝リポストは除外
  return (data.feed ?? [])
    .filter((item: any) => !item.reason)
    .map((item: any) => normalize(item.post))
    .filter(Boolean) as UpstreamPost[];
}
