import { describe, expect, test } from "vitest";
import { matchPost } from "./match";
import type { FeedConfig } from "./types";
import { miyakonojo } from "../feeds/miyakonojo";

const SOURCE_DID = "did:plc:localshop";
const cfg: FeedConfig = { ...miyakonojo, sources: [SOURCE_DID] };

const NOT_SOURCE = "did:plc:stranger";

describe("matchPost", () => {
  test("「都城の焼酎うまい」は通る", () => {
    expect(matchPost("都城の焼酎うまい", NOT_SOURCE, cfg)).toBe(true);
  });

  test("「藤原京の都城制について」は除外", () => {
    expect(matchPost("藤原京の都城制について", NOT_SOURCE, cfg)).toBe(false);
  });

  test("「都城の遺構の発掘調査」は除外（ルール3。取りこぼすが許容）", () => {
    expect(matchPost("都城の遺構の発掘調査", NOT_SOURCE, cfg)).toBe(false);
  });

  test("「霧島酒造の工場、都城の遺構の近く」は通る（他の語がヒット）", () => {
    expect(
      matchPost("霧島酒造の工場、都城の遺構の近く", NOT_SOURCE, cfg),
    ).toBe(true);
  });

  test("sources のDIDによる「今日はいい天気」は通る", () => {
    expect(matchPost("今日はいい天気", SOURCE_DID, cfg)).toBe(true);
  });
});
