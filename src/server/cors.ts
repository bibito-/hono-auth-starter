import { cors } from "hono/cors";

/**
 * CORS 許可オリジン（固定列挙）。
 *
 * - ワイルドカード（`*.vercel.app` 等）は使わない。任意のデプロイから
 *   API を叩けてしまい脅威面が広がるため、確定 URL のみを列挙する。
 * - `http://localhost:5173` は完全分離 dev（素 Vite + `wrangler dev`）で
 *   クロスオリジン通信を実地確認するとき用。統合 dev（同一オリジン）では不要。
 * - 本番オリジンはこのプロジェクトのデプロイ先が確定次第ここへ追記する
 *   （未追記だと本番からの実リクエストが弾かれる）。
 */
export const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  // TODO: 新プロジェクトの本番オリジンに差し替える（確定 URL のみ。プレビュー用ワイルドカードは許可しない）
];

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
  origin: ALLOWED_ORIGINS,
  credentials: true,
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Authorization", "Content-Type", "X-CSRF-Token"],
});
