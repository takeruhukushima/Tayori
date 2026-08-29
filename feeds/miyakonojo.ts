import type { FeedConfig } from "../src/types";

export const miyakonojo: FeedConfig = {
  rkey: "miyakonojo",
  displayName: "都城のいま",
  description:
    "Bluesky上で都城について書かれた投稿を集めています。都城市とは関係のない個人プロジェクトです。",

  // searchPosts に投げる語。増やすほど上流コストが上がるので絞る
  queries: ["都城", "都城市", "霧島酒造"],

  // 本文に含まれれば通す語
  strongTerms: [
    "都城", "みやこのじょう", "ミヤコノジョウ", "霧島酒造", "黒霧島",
    "都城島津", "関之尾", "母智丘", "早水公園", "都城高専",
    "高城町", "山之口", "志和池", "庄内町", "高崎町",
  ],

  // 曖昧な語と、それを打ち消す文脈語
  ambiguous: {
    term: "都城",
    excludeWhen: [
      "都城制", "条坊", "平城京", "平安京", "藤原京", "藤原宮", "難波宮",
      "長安", "洛陽", "新羅", "百済", "渤海", "考古学", "遺構", "発掘調査",
    ],
  },

  // 「都城」と書かない地元アカウント。無条件で通す
  sources: [
    // 'did:plc:xxxx', // example.bsky.social — 地元の飲食店
  ],
};
