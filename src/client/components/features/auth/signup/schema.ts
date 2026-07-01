import * as z from "zod";

// formのscheme v4にあるzod-mini(zodの軽量版)は関数方式が推奨。今回はそのまま
// パスワードは英数字/大文字小文字/記号有り
export const signupFormScheme = z.object({
  mail: z.email({ error: "メールアドレスの形式で入力してください" }),
  password: z
    .string()
    .min(6, "パスワードは6文字以上で入力してください")
    .max(32, "パスワードは32文字以内に納めてください")
    .regex(/[A-Z]/, "英大文字を少なくとも１文字は含めてください")
    .regex(/[a-z]/, "英小文字を少なくとも１文字含めてください")
    .regex(/[0-9]/, "数字を少なくとも１文字を含めてください"),
  // .regex(/\[!@#$%^&*(),.?":{}|<>/, "特殊記号を少なくとも１つは含めてください")
});

export type SignUpFormValues = z.infer<typeof signupFormScheme>;
