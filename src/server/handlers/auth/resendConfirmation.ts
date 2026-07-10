import type { Context } from "hono";
import type { HonoVariables } from "@shared/types/hono";
import { createAuthClient } from "../../lib/supabaseClients";

type HandlerContext = Context<{
  Bindings: CloudflareBindings;
  Variables: HonoVariables;
}>;

type ResendConfirmationBody = {
  email?: unknown;
};

/**
 * `POST /api/auth/resend-confirmation`。authMiddleware・csrfMiddleware いずれの対象外
 * （signup 後の未ログイン状態から呼ばれるため access_token・csrf_secret は存在し得ない）。
 * 常に 200 `{ status: "sent" }` を返す（forgotPassword と同じ列挙対策）。
 */
export async function resendConfirmationHandler(c: HandlerContext) {
  const body = await c.req
    .json<ResendConfirmationBody>()
    .catch(() => ({}) as ResendConfirmationBody);
  const { email } = body;

  if (typeof email === "string") {
    const supabase = createAuthClient(c.env);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) {
      console.error("[resendConfirmation] resend に失敗", error.message);
    }
  }

  return c.json({ status: "sent" }, 200);
}
