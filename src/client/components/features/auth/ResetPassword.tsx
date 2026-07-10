import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { AuthContext } from "@client/contexts/AuthContext";
import { useTokenHashParam } from "@client/hooks/useTokenHashParam";
import { zodResolver } from "@hookform/resolvers/zod";
import { use } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Link } from "react-router";
import { ResetPasswordFooter } from "./reset-password/ResetPasswordFooter";
import { FORM_ID, ResetPasswordForm } from "./reset-password/ResetPasswordForm";
import { resetPasswordFormScheme, type ResetPasswordFormValues } from "./reset-password/schema";

function InvalidLinkNotice({ message }: { message: string }) {
  return (
    <main className="bg-background text-foreground min-h-screen">
      <div className="container mx-auto px-3 py-11">
        <div className="max-w-md mx-auto">
          <Card className="text-sm border border-border p-6">
            <CardHeader>
              <CardTitle>パスワードを変更できませんでした</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p>{message}</p>
              <Link to="/forgot-password" className="text-primary mx-auto w-fit">
                パスワード再設定をやり直す
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

export const ResetPassword = () => {
  const tokenHash = useTokenHashParam();
  const { resetPasswordMutation } = use(AuthContext);
  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordFormScheme),
    defaultValues: { password: "" },
  });

  const onSubmit = (data: ResetPasswordFormValues) => {
    if (!tokenHash) return;
    resetPasswordMutation.mutate({ tokenHash, password: data.password });
  };

  if (!tokenHash) {
    return (
      <InvalidLinkNotice message="リンクが無効です。もう一度パスワード再設定を申請してください。" />
    );
  }

  const result = resetPasswordMutation.data;

  if (resetPasswordMutation.isSuccess && result?.status === "failure") {
    return <InvalidLinkNotice message={result.error} />;
  }

  if (resetPasswordMutation.isSuccess && result?.status === "reset") {
    return (
      <main className="bg-background text-foreground min-h-screen">
        <div className="container mx-auto px-3 py-11">
          <div className="max-w-md mx-auto">
            <Card className="text-sm border border-border p-6">
              <CardHeader>
                <CardTitle>パスワードを変更しました</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p>変更しました。ログインしてください。</p>
                <Link to="/login" className="text-primary mx-auto w-fit">
                  ログインへ
                </Link>
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
              <ResetPasswordForm
                formId={FORM_ID}
                onSubmit={form.handleSubmit(onSubmit)}
              />
              <ResetPasswordFooter
                isPending={resetPasswordMutation.isPending}
                formId={FORM_ID}
              />
            </FormProvider>
            {resetPasswordMutation.isError && (
              <p className="text-destructive text-sm text-center">
                変更に失敗しました。もう一度お試しください。
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};

export default ResetPassword;
