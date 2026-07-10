import { useMutation } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { use, useEffect, useState } from "react";
import type { AuthUser } from "../entities/AuthUser";
import type { AuthService } from "../services/AuthService";
import { showErrorToast, showSuccessToast } from "../utils/toastHelpers";
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

  // アプリケーションレベルの成功（サーバーは常に200を返す設計）は各ページが「送信しました」
  // 表示へ切り替えるため onSuccess で Toast は呼ばない。一方 apiFetch 自体が reject する
  // 真の通信例外（オフライン等）はページ側の isSuccess が立たず画面が変わらないため、
  // onError で Toast を出す（ux-feedback-policy.md の集約方針）
  const forgotPasswordMutation = useMutation({
    mutationFn: ({ email }: { email: string }) => authService.forgotPassword(email),
    onError: (error: Error) =>
      showErrorToast("パスワード再設定メールの送信に失敗しました", error.message),
  });

  // 成功・失敗いずれもページ側が表示を切り替えるため onSuccess で Toast は呼ばない。
  // 通信例外時は画面が変わらないため onError で Toast を出す
  const resetPasswordMutation = useMutation({
    mutationFn: ({ tokenHash, password }: { tokenHash: string; password: string }) =>
      authService.resetPassword(tokenHash, password),
    onError: (error: Error) => showErrorToast("パスワードの変更に失敗しました", error.message),
  });

  // verified 時は login と同様にそのままログイン状態にする。通信例外時は画面が変わらない
  // （ConfirmEmail 側で isError を見て確認中 Spinner から抜ける）ため onError で Toast を出す
  const verifyEmailMutation = useMutation({
    mutationFn: ({ tokenHash }: { tokenHash: string }) => authService.verifyEmail(tokenHash),
    onSuccess: (result) => {
      if (result.status === "verified") setAuthUser(result.user);
    },
    onError: (error: Error) => showErrorToast("メールアドレスの確認に失敗しました", error.message),
  });

  // EmailConfirmationNotice・ConfirmEmail いずれも画面遷移を伴わない同一画面上の操作のため、
  // 成功・失敗どちらも Toast で通知する（ux-feedback-policy.md の集約方針）
  const resendConfirmationMutation = useMutation({
    mutationFn: ({ email }: { email: string }) => authService.resendConfirmation(email),
    onSuccess: () => showSuccessToast("確認メールを再送信しました"),
    onError: (error: Error) => showErrorToast("確認メールの再送信に失敗しました", error.message),
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
        forgotPasswordMutation,
        resetPasswordMutation,
        verifyEmailMutation,
        resendConfirmationMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthServiceProvider;
