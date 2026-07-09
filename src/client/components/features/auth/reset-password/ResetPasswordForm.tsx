import {
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@client/components/ui/field";
import { AuthTextField } from "../AuthTextField";
import type { ResetPasswordFormValues } from "./schema";

export const FORM_ID = "reset-password-form-rhf";

type FormProps = {
  formId: string;
  onSubmit: () => void;
};

export function ResetPasswordForm({ formId, onSubmit }: FormProps) {
  return (
    <form id={formId} onSubmit={onSubmit}>
      <FieldSet>
        <FieldLegend className="font-semibold pb-4">新しいパスワードの設定</FieldLegend>
        <FieldGroup>
          <AuthTextField<ResetPasswordFormValues>
            name="password"
            fieldName="新しいパスワード"
            type="password"
            placeholder="****"
          />
        </FieldGroup>
      </FieldSet>
    </form>
  );
}
