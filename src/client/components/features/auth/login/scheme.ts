import * as z from "zod";

// 空白チェックのみ
export const loginFormScheme = z.object({
  mail: z
    .string()
    .trim()
    .min(1, { message: "メールアドレスを入力してください" }),
  password: z
    .string()
    .trim()
    .min(1, { message: "パスワードを入力してください" }),
});

export type LoginFormValues = z.infer<typeof loginFormScheme>;
