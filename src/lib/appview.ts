// ページ側（ブラウザ）が直接叩く上流 appview のベースURL。
// ブラウザはユーザーのIPから出るため WAF に当たらない。既定は public appview。
// Worker 側は wrangler.jsonc の APPVIEW 環境変数で別途差し替えられる。
export const APPVIEW = "https://public.api.bsky.app";
