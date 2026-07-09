import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { AuthContext } from "@client/contexts/AuthContext";
import { zodResolver } from "@hookform/resolvers/zod";
import { use } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Link } from "react-router";
import { ForgotPasswordFooter } from "./forgot-password/ForgotPasswordFooter";
import { FORM_ID, ForgotPasswordForm } from "./forgot-password/ForgotPasswordForm";
import {
  forgotPasswordFormScheme,
  type ForgotPasswordFormValues,
} from "./forgot-password/schema";

export const ForgotPassword = () => {
  const { forgotPasswordMutation } = use(AuthContext);
  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordFormScheme),
    defaultValues: { mail: "" },
  });

  const onSubmit = (data: ForgotPasswordFormValues) => {
    forgotPasswordMutation.mutate({ email: data.mail });
  };

  if (forgotPasswordMutation.isSuccess) {
    return (
      <main className="bg-background text-foreground min-h-screen">
        <div className="container mx-auto px-3 py-11">
          <div className="max-w-md mx-auto">
            <Card className="text-sm border border-border p-6">
              <CardHeader>
                <CardTitle>メールを送信しました</CardTitle>
              </CardHeader>
              <CardContent>
                入力されたメールアドレス宛にパスワード再設定用のリンクを送信しました。受信メールを確認してください。
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-background text-foreground min-h-screen">
      <div className="container mx-auto px-3 py-11">
        <div className="max-w-md mx-auto">
          <div className="flex flex-col gap-4 rounded-2xl bg-card border border-border p-4">
            <FormProvider {...form}>
              <ForgotPasswordForm
                formId={FORM_ID}
                onSubmit={form.handleSubmit(onSubmit)}
              />
              <ForgotPasswordFooter
                isPending={forgotPasswordMutation.isPending}
                formId={FORM_ID}
              />
            </FormProvider>
            {forgotPasswordMutation.isError && (
              <p className="text-destructive text-sm text-center">
                送信に失敗しました。もう一度お試しください。
              </p>
            )}
            <Link to="/login" className="text-primary mx-auto w-fit">
              ログインへ戻る
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
};

export default ForgotPassword;
