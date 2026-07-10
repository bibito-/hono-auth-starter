import { Button } from "@client/components/ui/button";
import { Field } from "@client/components/ui/field";
import { Spinner } from "@client/components/ui/Spinner";

type ResetPasswordFooterProps = {
  formId: string;
  isPending: boolean;
};

export function ResetPasswordFooter({ formId, isPending }: ResetPasswordFooterProps) {
  return (
    <Field className="w-full" orientation="horizontal">
      <Button
        disabled={isPending}
        type="submit"
        variant="default"
        form={formId}
        className="w-full"
      >
        {isPending && <Spinner data-icon="inline-start" />}
        変更する
      </Button>
    </Field>
  );
}
