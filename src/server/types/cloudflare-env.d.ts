// `wrangler types` が生成する worker-configuration.d.ts はまだ CSRF_HMAC_SECRET を
// 含まない（自動生成物のため直接編集禁止）。このファイルは宣言マージのみを行う
// 素のグローバルスクリプトとして、CloudflareBindings に不足分を追加する。
// import/export は書かないこと（書くとこのファイルがモジュールとして扱われ、
// グローバルの `interface CloudflareBindings` に対する宣言マージにならない）。

interface CloudflareBindings {
  CSRF_HMAC_SECRET: string;
}
