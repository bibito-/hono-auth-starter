import { getCsrfToken, setCsrfToken } from "../services/HonoAuthService";

const STATE_CHANGING_METHODS = new Set(["POST", "PATCH", "DELETE"]);

// これらのパスへのリクエストが 401 を返しても自動リフレッシュを発火させない。
// - login/signup の 401 はパスワード誤り等の正常な失敗であり、リフレッシュは無意味
// - refresh 自身の 401 は「リフレッシュトークンが無効」を意味し、再試行すると無限再帰になる
const NO_REFRESH_RETRY_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/refresh",
]);

function isNoRefreshRetryPath(input: RequestInfo | URL): boolean {
  return typeof input === "string" && NO_REFRESH_RETRY_PATHS.has(input);
}

// refresh が失敗しても /login へ強制遷移しないパス。
// /api/auth/me は「ログイン状態を確認するための呼び出し」（HonoAuthService.getSession）が
// 使うため、401・refresh 失敗は「未ログイン」という正常な結果に過ぎない。ここで強制遷移すると
// 呼び出し元がすでに /login を表示中でもリロードが発生し、getSession() が再実行されて
// 401 → refresh 失敗 → 強制遷移 が繰り返される無限リロードループになる。
const NO_REDIRECT_ON_REFRESH_FAILURE_PATHS = new Set(["/api/auth/me"]);

function isNoRedirectOnRefreshFailurePath(input: RequestInfo | URL): boolean {
  return typeof input === "string" && NO_REDIRECT_ON_REFRESH_FAILURE_PATHS.has(input);
}

function buildHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  if (STATE_CHANGING_METHODS.has(method)) {
    const token = getCsrfToken();
    if (token) headers.set("X-CSRF-Token", token);
  }
  return headers;
}

/**
 * Vercel(SPA) と Worker(API) が別オリジンになる本番では、相対パスでは
 * SPA 自身のオリジンに飛んでしまうため、VITE_API_BASE_URL を前置して
 * 絶対 URL 化する。未設定時（統合 dev / 段階カットオーバー中）は相対パスのまま動かす。
 */
function resolveUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input !== "string") return input;
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  return `${base}${input}`;
}

async function doFetch(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const headers = buildHeaders(init);
  const url = resolveUrl(input);
  // Cookie（access_token/refresh_token/csrf_secret）は httpOnly のため JS からは
  // 読めない・付与できない。credentials: "include" によりブラウザが自動送信する。
  return fetch(url, { ...init, headers, credentials: "include" });
}

/**
 * Hono API を呼ぶための fetch ラッパー。今後の Hono API 呼び出しはすべてここを経由させる。
 *
 * - Cookie は credentials: "include" でブラウザに自動送信させる（Authorization ヘッダーは使わない）
 * - 状態変更メソッド（POST/PATCH/DELETE）には HonoAuthService が保持する CSRF トークンを
 *   X-CSRF-Token ヘッダーで付与する
 * - 401 受信時（login/signup/refresh 自身へのリクエストを除く）は /api/auth/refresh を
 *   1 回試行し、成功すれば元のリクエストを 1 回だけリトライする。失敗時はログイン画面へ遷移する
 *   （ただし /api/auth/me は例外で、遷移せず 401 レスポンスをそのまま返す）
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const response = await doFetch(input, init);

  if (response.status !== 401 || isNoRefreshRetryPath(input)) {
    return response;
  }

  const refreshResponse = await apiFetch("/api/auth/refresh", { method: "POST" });
  if (!refreshResponse.ok) {
    setCsrfToken(null);
    if (!isNoRedirectOnRefreshFailurePath(input)) {
      window.location.href = "/login";
    }
    return response;
  }

  // refresh は csrf_secret Cookie を毎回ローテートするため、以前の csrf_token は
  // このタイミングで無効になる。リトライ（や以降のリクエスト）が新しいトークンを
  // 使えるよう、レスポンスから取得して更新しておく。
  let refreshBody: { csrf_token?: string } | null = null;
  try {
    refreshBody = (await refreshResponse.json()) as { csrf_token?: string };
  } catch {
    refreshBody = null;
  }
  if (refreshBody?.csrf_token) {
    setCsrfToken(refreshBody.csrf_token);
  }

  return doFetch(input, init);
}
