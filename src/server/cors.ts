import { cors } from "hono/cors";

/**
 * CORS 許可オリジン（ローカル開発用・固定列挙）。
 *
 * - ワイルドカード（`*.vercel.app` 等）は使わない。任意のデプロイから
 *   API を叩けてしまい脅威面が広がるため、確定 URL のみを列挙する。
 * - `http://localhost:5173` は完全分離 dev（素 Vite + `wrangler dev`）で
 *   クロスオリジン通信を実地確認するとき用。統合 dev（同一オリジン）では不要。
 * - 本番オリジンはここに含めない。`wrangler.jsonc` の `vars.PROD_VERCEL_ORIGIN`
 *   経由で `c.env` から参照する（ドメイン切替時にコード変更不要にするため）。
 */
export const LOCAL_ORIGINS = ["http://localhost:5173"];

/**
 * Vercel プレビューデプロイの許可オリジンパターン。
 *
 * 既定では `null`（プレビューオリジンは一切許可しない）。有効化する場合は、
 * 自分の Vercel チームスコープ（`<deployment-name>-<team-slug>.vercel.app` の
 * team slug）で絞った正規表現に差し替えること。他チーム・他アカウント配下の
 * デプロイまで許可してしまう完全なワイルドカード（`*.vercel.app` 全体にマッチする
 * パターン）にはしないこと。
 *
 * 例: `/^https:\/\/[a-z0-9-]+-your-team-slug\.vercel\.app$/`
 */
const PREVIEW_ORIGIN_PATTERN: RegExp | null = null;

/**
 * リクエストごとに許可オリジンかどうかを判定する。
 *
 * `LOCAL_ORIGINS`（固定のローカル開発用オリジン）に加えて、
 * `c.env.PROD_VERCEL_ORIGIN`（本番 Vercel オリジン、`wrangler.jsonc` の `vars` 経由）が
 * truthy な場合のみ許可候補に加える。`PROD_VERCEL_ORIGIN` は型上必須文字列だが、
 * 未設定・空文字列で渡ってくる実行時ケース（ローカル `wrangler dev` で `vars` を
 * 渡さない場合など）を考慮し、falsy な値は候補に加えない防御的な扱いにする。
 *
 * 上記の完全一致チェックで許可されなかった場合は、`PREVIEW_ORIGIN_PATTERN` が
 * 設定されていればフォールバックとして一致確認する（`null` の場合は常に不許可）。
 */
function resolveAllowedOrigin(origin: string, env: CloudflareBindings): string | undefined {
  const allowedOrigins = env?.PROD_VERCEL_ORIGIN
    ? [...LOCAL_ORIGINS, env.PROD_VERCEL_ORIGIN]
    : LOCAL_ORIGINS;
  if (allowedOrigins.includes(origin)) {
    return origin;
  }
  return PREVIEW_ORIGIN_PATTERN?.test(origin) ? origin : undefined;
}

/**
 * `/api/*` 向け CORS ミドルウェア。
 *
 * 認証は httpOnly Cookie（access_token/refresh_token/csrf_secret）方式のため
 * `credentials: true`（ブラウザが Cookie を送受信できるようにする）。
 * CSRF 対策の Signed Double-Submit Cookie で使う `X-CSRF-Token` ヘッダーも
 * 許可しないと、ブラウザがプリフライトで実リクエストを弾いてしまう。
 *
 * 重要: このミドルウェアは authGuard より**前**に適用すること。
 * cors は OPTIONS プリフライトを 204 で短絡して `next()` を呼ばないため、
 * 後ろに置くとプリフライト（Cookie 未送信）が auth に届いて
 * 401 になり、ブラウザが実リクエストを送れなくなる。
 */
export const corsMiddleware = cors({
  origin: (origin, c) => resolveAllowedOrigin(origin, c.env),
  credentials: true,
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Authorization", "Content-Type", "X-CSRF-Token"],
});
