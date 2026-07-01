import { AuthError } from "@client/entities/AuthErrors";
import { supabase } from "../clients/supabaseClient";
import type { AuthService } from "./AuthService";
import type { SigninResult } from "../entities/SigninResult";
import type { UserRole } from "@client/entities/UserRole";
import type { AuthUser } from "@client/entities/AuthUser";

/**
 * Supabaseを使用して認証を管理するサービスクラス
 */
export class SupabaseAuthService implements AuthService {
  // セッション中のプロフィールをキャッシュ。再発火時の fetchProfile スキップと、ハング防止のフォールバックに使う。ロール情報はsupabaseのAuthenicationのテーブルからではなく、publicのprofilesから取得している為。
  private profileCache = new Map<string, { role: UserRole | null; username: string | null }>();
  private profileInFlight = new Map<string, Promise<{ role: UserRole | null; username: string | null }>>();

  private fetchProfile(userId: string): Promise<{ role: UserRole | null; username: string | null }> {
    if (this.profileCache.has(userId)) {
      return Promise.resolve(this.profileCache.get(userId)!);
    }

    const inFlight = this.profileInFlight.get(userId);
    if (inFlight) return inFlight;

    const promise = Promise.resolve(
      supabase
        .from("profiles")
        .select("role, username")
        .eq("id", userId)
        .single()
    ).then(({ data }) => {
      const profile = { role: data?.role ?? null, username: data?.username ?? null };
      if (data) this.profileCache.set(userId, profile);
      this.profileInFlight.delete(userId);
      return profile;
    }).then(undefined, (error: unknown) => {
      this.profileInFlight.delete(userId);
      throw error;
    });

    this.profileInFlight.set(userId, promise);
    return promise;
  }


  async signin(email: string, password: string): Promise<SigninResult> {
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    if (error) {
      throw new Error(error.message);
    } else if (data.user?.identities?.length === 0) {
      return {
        status: "failure",
        code: new AuthError("FAIL_CREATE_ACCOUNT"),
      };
    }
    // メール確認が有効な場合data.sessionががnullになる
    if (data.session == null) {
      return { status: "pending" };
    }
    const { role, username } = await this.fetchProfile(data.user!.id);

    return {
      status: "verified",
      user: {
        id: data.user!.id,
        name: data.user!.user_metadata.name,
        email: data.user!.email,
        role,
        username,
      },
    };
  }
  async login(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw new Error(error.message);
    }
    const { role, username } = await this.fetchProfile(data.user!.id);

    return {
      id: data.user.id,
      name: data.user.user_metadata.name,
      email: data.user.email,
      role,
      username,
    };
  }
  async logout(): Promise<void> {
    this.profileCache.clear();
    this.profileInFlight.clear();
    await supabase.auth.signOut();
  }
  async getSession(): Promise<AuthUser | null> {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) {
      return null;
    }
    const { role, username } = await this.fetchProfile(user.id);
    return {
      id: user.id,
      name: user.user_metadata.name,
      email: user.email,
      role,
      username,
    };
  }
  /**
   * 認証状態の変化を購読する。
   *
   * Supabaseの仕様上、以下のタイミングでコールバックが発火する：
   * - サインアップ時（メール確認が必要な場合）: signUp レスポンスの data.user は非 null だが
   *   data.session が null のため、onAuthStateChange の session パラメータも null で発火
   * - メール確認完了・ログイン成功時: session に user が含まれるため user は非 null で発火
   * - ログアウト時: session が null のため user は null で発火
   *
   * @param callback 認証状態が変化するたびに呼ばれる。user は session 由来のため、
   *                 メール未確認のサインアップ直後は null になる点に注意。
   * @returns unsubscribe() を持つオブジェクト。不要になった時点で必ず呼ぶこと。
   */
  onAuthStateChange(callback: (user: AuthUser | null) => void, onError?: (error: unknown) => void) {
    return supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        callback(null);
        return;
      }
      const u = session.user;
      const makeUser = (role: UserRole | null, username: string | null): AuthUser => ({
        id: u.id,
        name: u.user_metadata.name,
        email: u.email,
        role,
        username,
      });

      // キャッシュ済みなら即座に解決
      if (this.profileCache.has(u.id)) {
        const cached = this.profileCache.get(u.id)!;
        callback(makeUser(cached.role, cached.username));
        return;
      }

      // Supabase の onAuthStateChange コールバック内で DB クエリを await すると
      // クライアントの内部処理がブロックしてハングするため、まず role:null で loading を解除し、
      // setTimeout で JS イベントループに戻ってからロールを取得する
      callback(makeUser(null, null));
      setTimeout(() => {
        this.fetchProfile(u.id)
          .then(({ role, username }) => callback(makeUser(role, username)))
          .catch((error) => {
            console.error("[SupabaseAuthService] fetchProfile failed:", error);
            onError?.(error);
          });
      }, 0);
    }).data.subscription;
  }
}
