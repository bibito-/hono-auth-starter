import { AuthContext } from "@client/contexts/AuthContext";
import { zodResolver } from "@hookform/resolvers/zod";
import { use, useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { LoginFooter } from "./login/LoginFooter";
import { FORM_ID, LoginForm } from "./login/LoginForm";
import { loginFormScheme, type LoginFormValues } from "./login/scheme";
import { Separator } from "@client/components/ui/separator";

export const LoginWithEmail = () => {
  const navigate = useNavigate();
  const { loginMutation, authUser } = use(AuthContext);
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormScheme),
    defaultValues: { mail: "", password: "" },
  });

  const onSubmit = (data: LoginFormValues) => {
    loginMutation.mutate({ email: data.mail, password: data.password });
  };

  useEffect(() => {
    if (authUser) navigate("/", { replace: true });
  }, [navigate, loginMutation.isSuccess, authUser]);

  return (
    <main className="bg-background text-foreground min-h-screen">
      <div className="container mx-auto px-3 py-11">
        <div className="max-w-md mx-auto">
          <div className="flex flex-col gap-4 rounded-2xl bg-card border border-border p-4">
            <FormProvider {...form}>
              <LoginForm
                formId={FORM_ID}
                onSubmit={form.handleSubmit(onSubmit)}
              />
              <LoginFooter
                isPending={loginMutation.isPending}
                formId={FORM_ID}
              />
            </FormProvider>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 mx-auto px-0.5 w-full">
                <Separator className="flex-1" />
                <h4 className="shrink-0">アカウントをお持ちでない方</h4>
                <Separator className="flex-1" />
              </div>
              <Link to="/signup" className="text-primary mx-auto w-fit">
                アカウント作成へ
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default LoginWithEmail;
