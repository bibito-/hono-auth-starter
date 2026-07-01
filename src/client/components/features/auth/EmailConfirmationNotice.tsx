import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";

type Props = {
  email: string;
};

export const EmailConfirmationNotice = ({ email }: Props) => {
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
            <CardContent>
              <span className="font-semibold text-card-foreground">{email}</span>
              に送信しました。受信メールを確認してください。
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
};
