import { defineConfig } from "astro/config";

// Tayori のページは完全な静的サイト。データ取得はブラウザが同一オリジンの
// Worker APIを叩くので SSR アダプタは不要（output: 'static'）。
// ビルド成果物 dist/ は Worker が Static Assets として配信する。
export default defineConfig({
  output: "static",
  server: {
    host: "127.0.0.1",
    port: 4321,
  },
});
