import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { Spinner } from "@client/components/ui/Spinner";
import { AuthContext } from "@client/contexts/AuthContext";
import { useTokenHashParam } from "@client/hooks/useTokenHashParam";
import { use, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { ResendConfirmationForm } from "./confirm/ResendConfirmationForm";

export const ConfirmEmail = () => {
  const tokenHash = useTokenHashParam();
  const navigate = useNavigate();
  const { verifyEmailMutation } = use(AuthContext);
  const hasTriggered = useRef(false);

  // マウント時に1度だけ verifyEmail を呼ぶ。verifyEmailMutation はレンダーごとに新しい
  // オブジェクトのため依存配列に含めず、ref で二重発火（Strict Mode 含む）を防ぐ。
  useEffect(() => {
    if (!tokenHash || hasTriggered.current) return;
    hasTriggered.current = true;
    verifyEmailMutation.mutate({ tokenHash });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenHash]);

  useEffect(() => {
    if (verifyEmailMutation.isSuccess && verifyEmailMutation.data?.status === "verified") {
      navigate("/todos", { replace: true });
    }
  }, [verifyEmailMutation.isSuccess, verifyEmailMutation.data, navigate]);

  // isError（apiFetch 自体が reject した真の通信例外）を含めないと isPending が
  // false に戻った後も isSuccess が永久に立たず、確認中 Spinner から抜け出せなくなる
  const showError =
    !tokenHash ||
    verifyEmailMutation.isError ||
    (verifyEmailMutation.isSuccess && verifyEmailMutation.data?.status === "failure");

  if (showError) {
    return (
      <main className="bg-background text-foreground min-h-screen">
        <div className="container mx-auto px-3 py-11">
          <div className="max-w-md mx-auto">
            <Card className="text-sm border border-border p-6">
              <CardHeader>
                <CardTitle>メールアドレスの確認に失敗しました</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p>
                  リンクが無効か有効期限切れ、または通信エラーの可能性があります。再送信してください。
                </p>
                <ResendConfirmationForm />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-background text-foreground min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner className="size-8" />
        <p className="text-muted-foreground">メールアドレスを確認しています…</p>
      </div>
    </main>
  );
};

export default ConfirmEmail;
