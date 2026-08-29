// フィードレコードを Bluesky に publish する。
//   pnpm publish-feeds            … 全フィードを putRecord
//   pnpm publish-feeds miyakonojo … 指定rkeyだけ
//
// 認証情報は環境変数 BSKY_HANDLE / BSKY_APP_PASSWORD / HOSTNAME から読む。
// 手元では .dev.vars に置いておけば自動で読み込む。
import { readFileSync } from "node:fs";
import { AtpAgent } from "@atproto/api";
import { feeds } from "../feeds/index";

const FEED_COLLECTION = "app.bsky.feed.generator";

// .dev.vars（KEY=VALUE 形式）を process.env に流し込む（既存の env を優先）。
function loadDevVars() {
  try {
    const text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // .dev.vars が無ければ環境変数のみで動く
  }
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`環境変数 ${name} が未設定です`);
  return v;
}

async function main() {
  loadDevVars();
  const handle = required("BSKY_HANDLE");
  const appPassword = required("BSKY_APP_PASSWORD");
  const hostname = required("HOSTNAME");
  const serviceDid = `did:web:${hostname}`;

  const only = process.argv[2]; // 指定があればそのrkeyだけ
  const targets = Object.values(feeds).filter((f) => !only || f.rkey === only);
  if (only && targets.length === 0) {
    throw new Error(`rkey "${only}" は feeds/index.ts に存在しません`);
  }

  const agent = new AtpAgent({ service: "https://bsky.social" });
  await agent.login({ identifier: handle, password: appPassword });
  const repo = agent.session!.did;

  for (const feed of targets) {
    await agent.com.atproto.repo.putRecord({
      repo,
      collection: FEED_COLLECTION,
      rkey: feed.rkey,
      record: {
        $type: FEED_COLLECTION,
        did: serviceDid,
        displayName: feed.displayName,
        description: feed.description,
        createdAt: new Date().toISOString(),
      },
    });
    console.log(`published: ${feed.rkey} → at://${repo}/${FEED_COLLECTION}/${feed.rkey}`);
  }

  console.log(`\ndid:web = ${serviceDid}`);
  console.log("PUBLISHER_DID に設定する値:", repo);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
