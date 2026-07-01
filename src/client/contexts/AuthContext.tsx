import { createContext } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import type { AuthUser } from "../entities/AuthUser";
import type { SigninResult } from "../entities/SigninResult";

type AuthVars = { email: string; password: string };

export type AuthServiceType = {
  authUser: AuthUser | null;
  pendingEmail: string | null;
  loading: boolean;
  loginMutation: UseMutationResult<AuthUser, Error, AuthVars>;
  signinMutation: UseMutationResult<SigninResult, Error, AuthVars>;
  logoutMutation: UseMutationResult<void, Error, void>;
};

export const AuthContext = createContext<AuthServiceType>(null!);
