import { AuthContext } from "@client/contexts/AuthContext";
import { zodResolver } from "@hookform/resolvers/zod";
import { use } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { EmailConfirmationNotice } from "./EmailConfirmationNotice";
import { OrLogin } from "./signup/OrLogin";
import { SignUpFooter } from "./signup/SignUpFooter";
import { FORM_ID, SignUpForm } from "./signup/SignUpForm";
import { signupFormScheme, type SignUpFormValues } from "./signup/schema";

export const SignUp = () => {
  // SignUp情報を送って、ユーザーによる確認待ちになった状態
  const { pendingEmail, signinMutation } = use(AuthContext)
  const form = useForm<SignUpFormValues>({
    resolver: zodResolver(signupFormScheme),
    defaultValues: { mail: "", password: "" },
  });

  if (pendingEmail) return <EmailConfirmationNotice email={pendingEmail} />

  const onSubmit = (data: SignUpFormValues) => {
    signinMutation.mutate({ email: data.mail, password: data.password })
  }

  return (
    <main className="bg-background text-foreground min-h-screen">
      <div className="container mx-auto px-3 py-11">
        <div className="max-w-md mx-auto">
          <div className="flex flex-col gap-4 rounded-2xl bg-card border border-border p-4">
            <FormProvider {...form}>
              <SignUpForm
                formId={FORM_ID}
                onSubmit={form.handleSubmit(onSubmit)}
              />
              {/* <SignUpFooter formId={FORM_ID} reset={form.reset} /> */}
              <SignUpFooter isPending={signinMutation.isPending} formId={FORM_ID} />
            </FormProvider>
            <OrLogin />
          </div>
        </div>
      </div>
    </main>
  );
};

export default SignUp;
