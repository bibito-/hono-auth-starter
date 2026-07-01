export type AuthErrorCode = "FAIL_CREATE_ACCOUNT" | "FAIL_LOGIN"
export class AuthError extends Error {
  code: AuthErrorCode
  constructor(code: AuthErrorCode) {
    super(code)
    this.code = code
  }
}