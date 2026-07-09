import * as z from "zod";

// signup と同じパスワードポリシー（英大文字/小文字/数字を各1文字以上、6〜32文字）
export const resetPasswordFormScheme = z.object({
  password: z
    .string()
    .min(6, "パスワードは6文字以上で入力してください")
    .max(32, "パスワードは32文字以内に納めてください")
    .regex(/[A-Z]/, "英大文字を少なくとも１文字は含めてください")
    .regex(/[a-z]/, "英小文字を少なくとも１文字含めてください")
    .regex(/[0-9]/, "数字を少なくとも１文字を含めてください"),
});

export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormScheme>;
