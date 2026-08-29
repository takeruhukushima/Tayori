import type { FeedConfig } from "../src/types";
import { miyakonojo } from "./miyakonojo";

// 全フィードの置き場。フィードを増やすときはこの Record に1エントリ足すだけ。
// describeFeedGenerator とページ生成はここを列挙する（ハードコードしない）。
export const feeds: Record<string, FeedConfig> = {
  [miyakonojo.rkey]: miyakonojo,
};
