import { Button } from "@client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { Spinner } from "@client/components/ui/Spinner";
import { AuthContext } from "@client/contexts/AuthContext";
import { use } from "react";

type Props = {
  email: string;
};

export const EmailConfirmationNotice = ({ email }: Props) => {
  const { resendConfirmationMutation } = use(AuthContext);

  const handleResend = () => {
    resendConfirmationMutation.mutate({ email });
  };

  return (
    <main className="bg-background text-foreground min-h-screen">
      <div className="container mx-auto px-3 py-11">
        <div className="max-w-md mx-auto">
          <Card className="text-sm border border-border p-6">
            <CardHeader>
              <CardTitle>アカウントの作成はまだ完了していません</CardTitle>
              {/* <CardDescription></CardDescription> */}
              {/* <CardAction>Card Action</CardAction> */}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p>
                <span className="font-semibold text-card-foreground">{email}</span>
                に送信しました。受信メールを確認してください。
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={resendConfirmationMutation.isPending}
                onClick={handleResend}
                className="w-full"
              >
                {resendConfirmationMutation.isPending && (
                  <Spinner data-icon="inline-start" />
                )}
                確認メールを再送信
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
};
