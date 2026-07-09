import type { Context } from "hono";
import type { HonoVariables } from "@shared/types/hono";
import { createAuthClient } from "../../lib/supabaseClients";

type HandlerContext = Context<{
  Bindings: CloudflareBindings;
  Variables: HonoVariables;
}>;

type ForgotPasswordBody = {
  email?: unknown;
};

/**
 * `POST /api/auth/forgot-password`。authMiddleware・csrfMiddleware いずれの対象外
 * （ログイン前で access_token・csrf_secret は存在し得ない）。
 * 常に 200 `{ status: "sent" }` を返す（メールアドレスの登録有無・入力形式の別に関わらず
 * レスポンスを変えない。ユーザー列挙対策）。Supabase 側のエラーは console.error のみ。
 */
export async function forgotPasswordHandler(c: HandlerContext) {
  const body = await c.req.json<ForgotPasswordBody>().catch(() => ({}) as ForgotPasswordBody);
  const { email } = body;

  if (typeof email === "string") {
    const supabase = createAuthClient(c.env);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      console.error("[forgotPassword] resetPasswordForEmail に失敗", error.message);
    }
  }

  return c.json({ status: "sent" }, 200);
}
