import type { FeedConfig } from "./types";

// 判定ロジック。Worker 側とページ側の両方がここを import する（コピーしない）。
//
// ルール（順に評価する）:
//   1. 著者DIDが sources に含まれる → 本文に関係なく通す。
//      これがキーワード検索との差分であり、この機能の存在理由。
//   2. 本文が strongTerms のいずれも含まない → 除外。
//   3. ヒットが ambiguous.term のみで、本文が excludeWhen のいずれかを含む → 除外。
//      「都城」は古代都市を指す一般名詞でもある（都城制、藤原京の都城、唐の都城）。
//      他の固有名詞が同時にヒットしていれば地名で確定なので、この除外はかけない。
//   4. それ以外 → 通す。
export function matchPost(
  text: string,
  authorDid: string,
  cfg: FeedConfig,
): boolean {
  // 1. sources は本文無関係で通す
  if (cfg.sources.includes(authorDid)) return true;

  // 2. strongTerms のヒットを集める
  const hits = cfg.strongTerms.filter((term) => text.includes(term));
  if (hits.length === 0) return false;

  // 3. ヒットが ambiguous.term のみ かつ excludeWhen に該当 → 除外
  const onlyAmbiguous =
    hits.length === 1 && hits[0] === cfg.ambiguous.term;
  if (onlyAmbiguous && cfg.ambiguous.excludeWhen.some((w) => text.includes(w))) {
    return false;
  }

  // 4. 通す
  return true;
}
