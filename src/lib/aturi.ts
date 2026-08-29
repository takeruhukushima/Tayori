// AT-URI (at://did/collection/rkey) のヘルパー。

export interface AtUriParts {
  did: string;
  collection: string;
  rkey: string;
}

export function parseAtUri(uri: string): AtUriParts | null {
  const m = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!m) return null;
  return { did: m[1], collection: m[2], rkey: m[3] };
}

/** 投稿レコードの at:// URI を、人が開ける bsky.app のリンクに変換する。 */
export function bskyPostUrl(uri: string): string | null {
  const p = parseAtUri(uri);
  if (!p) return null;
  return `https://bsky.app/profile/${p.did}/post/${p.rkey}`;
}
