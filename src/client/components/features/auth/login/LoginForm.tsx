import {
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@client/components/ui/field";
import { AuthTextField } from "../AuthTextField";
import type { LoginFormValues } from "./scheme";

export const FORM_ID = "login-form-rhf";

type FormProps = {
  formId: string;
  onSubmit: () => void;
};

export function LoginForm({ formId, onSubmit }: FormProps) {
  return (
    <form id={formId} onSubmit={onSubmit}>
      <FieldSet>
        <FieldLegend className="font-semibold pb-4">Login</FieldLegend>
        <FieldGroup>
          <AuthTextField<LoginFormValues>
            name="mail"
            fieldName="メールアドレス"
            placeholder="sample@email.com"
          />
          <AuthTextField<LoginFormValues>
            name="password"
            fieldName="パスワード"
            type="password"
            placeholder="****"
          />
        </FieldGroup>
      </FieldSet>
    </form>
  );
}
