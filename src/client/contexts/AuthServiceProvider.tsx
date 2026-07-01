import { useMutation } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { use, useEffect, useState } from "react";
import type { AuthUser } from "../entities/AuthUser";
import type { AuthService } from "../services/AuthService";
import { showErrorToast } from "../utils/toastHelpers";
import { AuthContext } from "./AuthContext";
import { AuthErrorContext } from "./AuthErrorContext";
import { AuthError } from "@client/entities/AuthErrors";

type Props = {
  children: ReactNode;
  authService: AuthService;
};

const LOADING_TIME_OUT = 3000; // loadingの初期状態がtrueの為、タイムアウトで解除経路を設ける

const AuthServiceProvider = ({ children, authService }: Props) => {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { handleError } = use(AuthErrorContext);

  useEffect(() => {
    let isUnMounted = false;

    const subscription = authService.onAuthStateChange(
      (user) => {
        if (isUnMounted) return;
        setAuthUser(user);
        if (user) {
          setPendingEmail(null);
          // role:null はプロフィール取得中の一時状態のため、取得完了まで loading を維持する
          if (user.role !== null) setLoading(false);
        } else {
          setLoading(false);
        }
      },
      () => {
        showErrorToast("プロフィールの取得に失敗しました");
      }
    );

    authService
      .getSession()
      .then((user) => {
        if (isUnMounted) return;
        if (user) setAuthUser(user);
        setLoading(false);
      })
      .catch(() => {
        if (!isUnMounted) setLoading(false);
      });

    const watchdog = setTimeout(() => {
      if (!isUnMounted) setLoading(false);
    }, LOADING_TIME_OUT);

    return () => {
      isUnMounted = true;
      clearTimeout(watchdog);
      subscription.unsubscribe();
    };
  }, [authService]);

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authService.login(email, password),
    onSuccess: (user) => setAuthUser(user),
    onError: (_error: Error) => {
      // showErrorToast("ログイン失敗", error.message);
      handleError(new AuthError("FAIL_LOGIN"));
    },
  });

  const signinMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authService.signin(email, password),
    onSuccess: (result, variables) => {
      switch (result.status) {
        case "pending":
          setPendingEmail(variables.email);
          break;
        case "verified":
          setAuthUser(result.user);
          break;
        case "failure":
          handleError(new AuthError("FAIL_CREATE_ACCOUNT"));
          break;
      }
    },
    onError: (error: Error) =>
      showErrorToast("アカウント作成中にエラーが発生しました", error.message),
  });

  const logoutMutation = useMutation({
    mutationFn: () => authService.logout(),
    onSuccess: () => setAuthUser(null),
  });

  return (
    <AuthContext.Provider
      value={{
        authUser,
        pendingEmail,
        loading,
        loginMutation,
        signinMutation,
        logoutMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthServiceProvider;
