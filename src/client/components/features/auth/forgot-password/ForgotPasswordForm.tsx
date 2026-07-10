import {
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@client/components/ui/field";
import { AuthTextField } from "../AuthTextField";
import type { ForgotPasswordFormValues } from "./schema";

export const FORM_ID = "forgot-password-form-rhf";

type FormProps = {
  formId: string;
  onSubmit: () => void;
};

export function ForgotPasswordForm({ formId, onSubmit }: FormProps) {
  return (
    <form id={formId} onSubmit={onSubmit}>
      <FieldSet>
        <FieldLegend className="font-semibold pb-4">パスワード再設定</FieldLegend>
        <FieldGroup>
          <AuthTextField<ForgotPasswordFormValues>
            name="mail"
            fieldName="メールアドレス"
            placeholder="sample@email.com"
            description="登録済みのメールアドレスに再設定用リンクを送信します"
          />
        </FieldGroup>
      </FieldSet>
    </form>
  );
}
