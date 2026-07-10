import * as z from "zod";

export const resendConfirmationFormScheme = z.object({
  mail: z.email({ error: "メールアドレスの形式で入力してください" }),
});

export type ResendConfirmationFormValues = z.infer<typeof resendConfirmationFormScheme>;
