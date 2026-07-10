import { createContext } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import type { AuthUser } from "../entities/AuthUser";
import type { SigninResult } from "../entities/SigninResult";
import type { ResetPasswordResult } from "../entities/ResetPasswordResult";
import type { VerifyEmailResult } from "../entities/VerifyEmailResult";

type AuthVars = { email: string; password: string };
type EmailVars = { email: string };
type ResetPasswordVars = { tokenHash: string; password: string };
type VerifyEmailVars = { tokenHash: string };

export type AuthServiceType = {
  authUser: AuthUser | null;
  pendingEmail: string | null;
  loading: boolean;
  loginMutation: UseMutationResult<AuthUser, Error, AuthVars>;
  signinMutation: UseMutationResult<SigninResult, Error, AuthVars>;
  logoutMutation: UseMutationResult<void, Error, void>;
  forgotPasswordMutation: UseMutationResult<void, Error, EmailVars>;
  resetPasswordMutation: UseMutationResult<ResetPasswordResult, Error, ResetPasswordVars>;
  verifyEmailMutation: UseMutationResult<VerifyEmailResult, Error, VerifyEmailVars>;
  resendConfirmationMutation: UseMutationResult<void, Error, EmailVars>;
};

export const AuthContext = createContext<AuthServiceType>(null!);
