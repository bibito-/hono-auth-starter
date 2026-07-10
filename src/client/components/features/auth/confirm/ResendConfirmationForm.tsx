import { Button } from "@client/components/ui/button";
import { Field, FieldGroup } from "@client/components/ui/field";
import { Spinner } from "@client/components/ui/Spinner";
import { AuthContext } from "@client/contexts/AuthContext";
import { zodResolver } from "@hookform/resolvers/zod";
import { use } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { AuthTextField } from "../AuthTextField";
import { resendConfirmationFormScheme, type ResendConfirmationFormValues } from "./schema";

const FORM_ID = "resend-confirmation-form-rhf";

/**
 * `/auth/confirm` の確認失敗時に表示する再送フォーム。verify-email は失敗時にメールアドレスを
 * 返さないため（token_hash しか送っていない）、EmailConfirmationNotice と異なりメールアドレスを
 * ユーザーに再入力してもらう。
 */
export function ResendConfirmationForm() {
  const { resendConfirmationMutation } = use(AuthContext);
  const form = useForm<ResendConfirmationFormValues>({
    resolver: zodResolver(resendConfirmationFormScheme),
    defaultValues: { mail: "" },
  });

  const onSubmit = (data: ResendConfirmationFormValues) => {
    resendConfirmationMutation.mutate({ email: data.mail });
  };

  return (
    <FormProvider {...form}>
      <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)}>
        <FieldGroup>
          <AuthTextField<ResendConfirmationFormValues>
            name="mail"
            fieldName="メールアドレス"
            placeholder="sample@email.com"
          />
        </FieldGroup>
      </form>
      <Field className="w-full mt-4" orientation="horizontal">
        <Button
          disabled={resendConfirmationMutation.isPending}
          type="submit"
          form={FORM_ID}
          className="w-full"
        >
          {resendConfirmationMutation.isPending && <Spinner data-icon="inline-start" />}
          確認メールを再送信
        </Button>
      </Field>
    </FormProvider>
  );
}
