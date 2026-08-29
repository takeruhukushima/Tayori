// ページ側のデータ取得・描画。ブラウザから直接 public appview を叩く
// （自分の Worker の /xrpc は叩かない — レート制限枠を分離するため）。
// 判定は src/match.ts をそのまま使う（Worker とロジックを共有）。
import { matchPost } from "../match";
import { bskyPostUrl } from "./aturi";
import { feeds } from "../../feeds/index";
import { APPVIEW } from "./appview";

interface Post {
  uri: string;
  text: string;
  did: string;
  handle: string;
  createdAt: string;
}

// searchPosts / getAuthorFeed の投稿ビューを共通形に正規化する。
function normalize(view: any): Post | null {
  if (!view?.uri || !view.author?.did || !view.record) return null;
  return {
    uri: view.uri,
    text: view.record.text ?? "",
    did: view.author.did,
    handle: view.author.handle ?? view.author.did,
    createdAt: view.record.createdAt ?? "",
  };
}

async function searchPosts(query: string): Promise<Post[]> {
  const url = `${APPVIEW}/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(
    query,
  )}&sort=latest&limit=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`searchPosts ${res.status}`);
  const data = (await res.json()) as any;
  return (data.posts ?? []).map(normalize).filter(Boolean) as Post[];
}

async function getAuthorFeed(did: string): Promise<Post[]> {
  const url = `${APPVIEW}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(
    did,
  )}&limit=30&filter=posts_no_replies`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`getAuthorFeed ${res.status}`);
  const data = (await res.json()) as any;
  // reason があるアイテム＝リポストは除外
  return (data.feed ?? [])
    .filter((item: any) => !item.reason)
    .map((item: any) => normalize(item.post))
    .filter(Boolean) as Post[];
}

// 都城関連の投稿を集めてマージ・判定・整列する。
async function collect(rkey: string): Promise<Post[]> {
  const cfg = feeds[rkey];
  const tasks: Promise<Post[]>[] = [
    ...cfg.queries.map(searchPosts),
    ...cfg.sources.map(getAuthorFeed),
  ];

  // 上流1本の失敗で全体を落とさない
  const results = await Promise.allSettled(tasks);
  const merged: Post[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") merged.push(...r.value);
    else console.warn("upstream failed:", r.reason);
  }

  // URIで重複排除
  const byUri = new Map<string, Post>();
  for (const p of merged) if (!byUri.has(p.uri)) byUri.set(p.uri, p);

  const cutoff = Date.now() + 60_000; // 1分以上未来の投稿は除外
  return [...byUri.values()]
    .filter((p) => matchPost(p.text, p.did, cfg))
    .filter((p) => {
      const t = Date.parse(p.createdAt);
      return !Number.isNaN(t) && t <= cutoff;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 50);
}

function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "たった今";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}日前`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon}ヶ月前`;
  return `${Math.floor(mon / 12)}年前`;
}

function el(tag: string, props: Record<string, string> = {}, text?: string) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderPosts(container: HTMLElement, posts: Post[]) {
  container.replaceChildren();
  if (posts.length === 0) {
    container.append(el("p", { class: "state" }, "まだ投稿がありません。"));
    return;
  }
  const list = el("ul", { class: "posts" });
  for (const p of posts) {
    const li = el("li", { class: "post" });
    const link = bskyPostUrl(p.uri);

    const meta = el("div", { class: "meta" });
    meta.append(el("span", { class: "handle" }, `@${p.handle}`));
    meta.append(el("span", { class: "time" }, relativeTime(p.createdAt)));
    li.append(meta);

    li.append(el("p", { class: "text" }, p.text));

    if (link) {
      li.append(
        el(
          "a",
          { class: "open", href: link, target: "_blank", rel: "noopener" },
          "Blueskyで開く →",
        ),
      );
    }
    list.append(li);
  }
  container.append(list);
}

// ページから呼ぶエントリポイント。
export async function renderFeed(rkey: string, container: HTMLElement) {
  container.replaceChildren(el("p", { class: "state" }, "読み込み中…"));
  try {
    const posts = await collect(rkey);
    renderPosts(container, posts);
  } catch (err) {
    console.error(err);
    container.replaceChildren();
    container.append(el("p", { class: "state" }, "取得できませんでした。"));
    const retry = el("button", { class: "retry", type: "button" }, "再試行");
    retry.addEventListener("click", () => renderFeed(rkey, container));
    container.append(retry);
  }
}
