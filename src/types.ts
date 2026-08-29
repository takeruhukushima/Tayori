// フィード1本ぶんの設定。feeds/ 以下に1ファイル1フィードで置く。
export interface FeedConfig {
  /** at:// URI の末尾セグメント。URL とレコードキーになる */
  rkey: string;
  /** Bluesky アプリに表示される名前 */
  displayName: string;
  /** Bluesky アプリに表示される説明文 */
  description: string;

  /** searchPosts に投げる語。増やすほど上流コストが上がるので絞る */
  queries: string[];

  /** 本文に含まれれば通す語 */
  strongTerms: string[];

  /** 曖昧な語と、それを打ち消す文脈語 */
  ambiguous: {
    term: string;
    excludeWhen: string[];
  };

  /** 「都城」と書かない地元アカウント。本文に関係なく無条件で通す DID の集合 */
  sources: string[];
}
