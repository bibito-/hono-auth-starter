import {
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@client/components/ui/field";
import { AuthTextField } from "../AuthTextField";
import type { SignUpFormValues } from "./schema";

export const FORM_ID = "sign-up-form-rhf";

type FormProps = {
  formId: string;
  onSubmit: () => void;
};

export function SignUpForm({ formId, onSubmit }: FormProps) {
  return (
    <form id={formId} onSubmit={onSubmit}>
      <FieldSet>
        <FieldLegend className="font-semibold pb-4">SignUp</FieldLegend>
        <FieldGroup>
          <AuthTextField<SignUpFormValues>
            name="mail"
            fieldName="メールアドレス"
            placeholder="sample@email.com"
            description="メールアドレスを入力してください"
          />
          <AuthTextField<SignUpFormValues>
            name="password"
            fieldName="パスワード"
            type="password"
            placeholder="****"
            description="パスワードを入力してください"
          />
        </FieldGroup>
      </FieldSet>
    </form>
  );
}
