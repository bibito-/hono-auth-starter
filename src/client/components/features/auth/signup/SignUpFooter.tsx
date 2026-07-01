import { Button } from "@client/components/ui/button";
import { Field } from "@client/components/ui/field";
import { Spinner } from "@client/components/ui/Spinner";
// import type { UseFormReset } from "react-hook-form";
// import type { SignUpFormValues } from "./schema";

type SignUpFooterProps = {
  formId: string;
  isPending: boolean;
  // reset: UseFormReset<SignUpFormValues>; Restのサンプル
};

export function SignUpFooter({ formId, isPending }: SignUpFooterProps) {
  return (
    <Field orientation="horizontal">
      {/* 
      <div className="flex items-center justify-between w-full">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            reset();
          }}
        >
          Reset
        </Button>
        <Button type="submit" form={formId}>
          作成
        </Button>
      </div>
       */}
        <Button disabled={isPending} type="submit" form={formId} className="w-full">
          {isPending && (
            <Spinner data-icon="inline-start" />
          )}
          作成
        </Button>
    </Field>
  );
}
