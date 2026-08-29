// ページ側のデータ取得・描画。同一オリジンのWorker APIを叩く。
import { bskyPostUrl } from "./aturi";

interface Post {
  uri: string;
  text: string;
  did: string;
  handle: string;
  createdAt: string;
}

async function fetchPosts(rkey: string): Promise<Post[]> {
  const res = await fetch(`/api/feeds/${encodeURIComponent(rkey)}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`feed API ${res.status}`);
  const data = (await res.json()) as { posts?: Post[] };
  return data.posts ?? [];
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
    const posts = await fetchPosts(rkey);
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
