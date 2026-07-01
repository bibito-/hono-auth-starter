import type { UserRole } from "./UserRole";

/**
 * 認証されたユーザーの情報を表す型
 */
export type AuthUser = {
    id: string;
    name: string;
    email: string | undefined;
    role: UserRole | null;
    username: string | null;
}