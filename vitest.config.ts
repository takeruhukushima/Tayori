import { defineConfig } from "vitest/config";

// テストは判定ロジック（src/match.ts）にのみ書く。
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
