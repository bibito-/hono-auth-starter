import { Agent } from "agents";
import {
  ACCOUNT_DAILY_LIMIT,
  USER_PER_MINUTE_LIMIT,
  USER_WINDOW_MS,
} from "./config";
import {
  decideAccountWindow,
  decideUserWindow,
  type AccountRow,
  type UserRow,
} from "./decideFixedWindow";

export type ConsumeResult =
  | { allowed: true }
  | { allowed: false; scope: "user" | "account"; retryAfter: number };

/**
 * 2層固定窓レート制限のカウンタを集約するシングルトン DO。
 * `env.RateLimiter.idFromName("global")` で 1 インスタンスに直列化し、
 * per-user 行と account 行を strong consistency で atomically 判定する。
 * 判定ロジックは decideFixedWindow の純粋関数に委譲し、本クラスは I/O のみ担う。
 */
export class RateLimiter extends Agent<CloudflareBindings> {
  #initialized = false;

  #init() {
    if (this.#initialized) return;
    this.sql`
      CREATE TABLE IF NOT EXISTS user_window (
        user_id      TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        count        INTEGER NOT NULL
      )
    `;
    this.sql`
      CREATE TABLE IF NOT EXISTS account_window (
        id    INTEGER PRIMARY KEY CHECK (id = 1),
        day   TEXT NOT NULL,
        count INTEGER NOT NULL
      )
    `;
    this.#initialized = true;
  }

  /**
   * per-user・account を増分せずに評価し、両方 allow のときだけ両カウンタを増分する。
   * どちらかが deny なら増分せず deny を返す。両方 deny のときは user を優先する
   * （短命で自己解消するため、より行動可能なメッセージになる）。
   */
  async tryConsume(userId: string): Promise<ConsumeResult> {
    this.#init();
    const now = Date.now();

    const userRows = this.sql<UserRow>`
      SELECT window_start, count FROM user_window WHERE user_id = ${userId}
    `;
    const accountRows = this.sql<AccountRow>`
      SELECT day, count FROM account_window WHERE id = 1
    `;
    const userRow = userRows[0] ?? null;
    const accountRow = accountRows[0] ?? null;

    const userDecision = decideUserWindow(
      now,
      userRow,
      USER_PER_MINUTE_LIMIT,
      USER_WINDOW_MS,
    );
    const accountDecision = decideAccountWindow(
      now,
      accountRow,
      ACCOUNT_DAILY_LIMIT,
    );

    // どちらかが deny なら増分せず deny。両方 deny のときは account を優先する
    // （account は 00:00 UTC まで続く拘束で実際の天井。user-scope を先に見せると
    //  ユーザーは 60 秒後に再試行→再び account deny で日次上限を後出しで知り、
    //  無駄なリトライループに入る。長く効く制約を先に伝える方が actionable）。
    if (!accountDecision.allowed) {
      return {
        allowed: false,
        scope: "account",
        retryAfter: accountDecision.retryAfter,
      };
    }
    if (!userDecision.allowed) {
      return {
        allowed: false,
        scope: "user",
        retryAfter: userDecision.retryAfter,
      };
    }

    // 両方 allow のときのみ永続化
    const u = userDecision.nextRow;
    this.sql`
      INSERT INTO user_window (user_id, window_start, count)
      VALUES (${userId}, ${u.window_start}, ${u.count})
      ON CONFLICT(user_id) DO UPDATE SET
        window_start = ${u.window_start},
        count = ${u.count}
    `;
    const a = accountDecision.nextRow;
    this.sql`
      INSERT INTO account_window (id, day, count)
      VALUES (1, ${a.day}, ${a.count})
      ON CONFLICT(id) DO UPDATE SET
        day = ${a.day},
        count = ${a.count}
    `;

    return { allowed: true };
  }
}
