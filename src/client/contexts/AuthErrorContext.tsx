import type { AuthError } from "@client/entities/AuthErrors";
import { createContext } from "react";

export type AuthErrorContextType = {
  authError: AuthError | null;
  handleError: (authError: AuthError) => void;
};

export const AuthErrorContext = createContext<AuthErrorContextType>(null!);
