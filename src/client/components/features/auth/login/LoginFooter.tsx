import { Button } from "@client/components/ui/button";
import { Field } from "@client/components/ui/field";
import { Spinner } from "@client/components/ui/Spinner";
import { Link } from "react-router";

type LoginFooterProps = {
  formId: string;
  isPending: boolean;
};

export function LoginFooter({ formId, isPending }: LoginFooterProps) {
  return (
    <Field className="w-full gap-2" orientation="vertical">
      <Field orientation="horizontal">
        <Button
          disabled={isPending}
          type="submit"
          variant="default"
          form={formId}
          className="w-full"
        >
          {isPending && (
            <Spinner data-icon="inline-start" />
          )}
          ログイン
        </Button>
      </Field>
      <Link to="/forgot-password" className="text-primary text-sm mx-auto w-fit">
        パスワードを忘れた場合
      </Link>
    </Field>
  );
}
