import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@client/components/ui/field";
import { Input } from "@client/components/ui/input";
import { Controller, useFormContext, type FieldValues, type Path } from "react-hook-form";

type AuthTextFieldProps<T extends FieldValues> = {
  name: Path<T>;
  fieldName: string;
  type?: string;
  placeholder?: string;
  description?: string;
};

export function AuthTextField<T extends FieldValues>({
  name,
  fieldName,
  type,
  placeholder,
  description,
}: AuthTextFieldProps<T>) {
  const { control } = useFormContext<T>();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={field.name}>{fieldName}</FieldLabel>
          <Input
            {...field}
            id={field.name}
            type={type}
            autoComplete="off"
            placeholder={placeholder}
          />
          <FieldDescription className="text-muted-foreground">
            {description}
          </FieldDescription>
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}
