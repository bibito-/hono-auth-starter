import * as z from "zod";

export const forgotPasswordFormScheme = z.object({
  mail: z.email({ error: "メールアドレスの形式で入力してください" }),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordFormScheme>;
