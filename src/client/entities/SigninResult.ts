import type { AuthError } from "@client/entities/AuthErrors";
import type { AuthUser } from "./AuthUser";

export type SigninResult =
  | {
      status: "verified"; // 作成・認証済み
      user: AuthUser;
    }
  | {
      status: "pending"; // メール認証待ち
    }
  | {
      status: "failure";
      code : AuthError
    };
