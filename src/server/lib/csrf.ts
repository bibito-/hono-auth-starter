const textEncoder = new TextEncoder();

/**
 * `csrf_secret` Cookie に格納するランダム値を生成する。
 * ユーザー識別能力を持たない乱数であり、それ単体では何も保証しない
 * （「同一オリジンの正規セッションを経て発行されたリクエストか」を保証するのは
 * HMAC 署名側の役割）。
 */
export function generateCsrfSecret(): string {
  return crypto.randomUUID();
}

async function importHmacKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * `secret`（csrf_secret Cookie の値）を Workers Secret（`key` = CSRF_HMAC_SECRET）で
 * HMAC-SHA256 署名し、hex 文字列として返す。レスポンスボディ経由で JS へ渡す `csrf_token`
 * はこの値。
 */
export async function deriveCsrfToken(secret: string, key: string): Promise<string> {
  const hmacKey = await importHmacKey(key);
  const signature = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    textEncoder.encode(secret),
  );
  return toHex(signature);
}

/**
 * 定数時間文字列比較。タイミング攻撃対策として `===` を使わず、文字長の違いも
 * 早期 return せず最後まで走査してから判定する。
 * Workers ランタイムには `crypto.subtle.timingSafeEqual`（node:crypto 由来のAPI）が
 * 存在しないため手動実装する。
 */
function timingSafeEqual(a: string, b: string): boolean {
  const maxLength = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLength; i++) {
    const charA = i < a.length ? a.charCodeAt(i) : 0;
    const charB = i < b.length ? b.charCodeAt(i) : 0;
    diff |= charA ^ charB;
  }
  return diff === 0;
}

/**
 * `csrf_secret` Cookie（`secret`）から再計算した HMAC と、クライアントが
 * `X-CSRF-Token` ヘッダーで送ってきた `token` を定数時間で照合する。
 */
export async function verifyCsrfToken(
  secret: string,
  token: string,
  key: string,
): Promise<boolean> {
  const expected = await deriveCsrfToken(secret, key);
  return timingSafeEqual(expected, token);
}
