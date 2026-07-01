// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_DAILY_LIMIT,
  USER_PER_MINUTE_LIMIT,
} from "./config";

// ── Agent 基底クラスのモック ──────────────────────────────
// 実 DO の `this.sql` タグ付きテンプレートを、インメモリの2テーブルで再現する。
// クエリ文字列のキーワードで read/write を振り分ける。
type UserRow = { window_start: number; count: number };
type AccountRow = { day: string; count: number };

vi.mock("agents", () => ({
  Agent: class {
    env: CloudflareBindings;
    _userRows = new Map<string, UserRow>();
    _accountRow: AccountRow | null = null;
    constructor(_ctx: unknown, env: CloudflareBindings) {
      this.env = env;
    }
    sql(strings: TemplateStringsArray, ...values: unknown[]) {
      const q = strings.join(" ? ");
      if (q.includes("CREATE TABLE")) return [];
      if (q.includes("SELECT") && q.includes("user_window")) {
        const row = this._userRows.get(values[0] as string);
        return row ? [row] : [];
      }
      if (q.includes("SELECT") && q.includes("account_window")) {
        return this._accountRow ? [this._accountRow] : [];
      }
      if (q.includes("INSERT INTO user_window")) {
        const [userId, window_start, count] = values as [string, number, number];
        this._userRows.set(userId, { window_start, count });
        return [];
      }
      if (q.includes("INSERT INTO account_window")) {
        const [day, count] = values as [string, number];
        this._accountRow = { day, count };
        return [];
      }
      return [];
    }
  },
}));

import { RateLimiter } from "./RateLimiter";

// 2026-06-25 12:00:00 UTC（次の 00:00 UTC まで 12h=43200s）
const NOW = Date.UTC(2026, 5, 25, 12, 0, 0);
const TODAY = "2026-06-25";
const USER_ID = "user-1";

// テスト用に内部ストアへ直接アクセスするヘルパー
type Internals = {
  _userRows: Map<string, UserRow>;
  _accountRow: AccountRow | null;
};
const internals = (agent: RateLimiter) => agent as unknown as Internals;

describe("RateLimiter.tryConsume", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("初回: 両方 allow で user・account 両カウンタを 1 に増分し allowed を返す", async () => {
    // 準備: 空状態の DO を初期化
    const agent = new RateLimiter({} as never, {} as CloudflareBindings);

    // Act
    const result = await agent.tryConsume(USER_ID);

    // Assert
    expect(result).toEqual({ allowed: true });
    expect(internals(agent)._userRows.get(USER_ID)).toEqual({
      window_start: NOW,
      count: 1,
    });
    expect(internals(agent)._accountRow).toEqual({ day: TODAY, count: 1 });
  });

  it("user 上限到達: scope=user で拒否し、いずれのカウンタも増分しない", async () => {
    // 準備: user は窓内で上限ちょうど・account は余裕あり
    const agent = new RateLimiter({} as never, {} as CloudflareBindings);
    internals(agent)._userRows.set(USER_ID, {
      window_start: NOW - 1_000,
      count: USER_PER_MINUTE_LIMIT,
    });
    internals(agent)._accountRow = { day: TODAY, count: 5 };

    // Act
    const result = await agent.tryConsume(USER_ID);

    // Assert
    expect(result).toEqual({ allowed: false, scope: "user", retryAfter: 59 });
    // 増分されていない
    expect(internals(agent)._userRows.get(USER_ID)?.count).toBe(
      USER_PER_MINUTE_LIMIT,
    );
    expect(internals(agent)._accountRow?.count).toBe(5);
  });

  it("account 上限到達（user OK）: scope=account で拒否し増分しない", async () => {
    // 準備: user は余裕・account が上限ちょうど
    const agent = new RateLimiter({} as never, {} as CloudflareBindings);
    internals(agent)._accountRow = { day: TODAY, count: ACCOUNT_DAILY_LIMIT };

    // Act
    const result = await agent.tryConsume(USER_ID);

    // Assert
    expect(result).toEqual({
      allowed: false,
      scope: "account",
      retryAfter: 43_200,
    });
    // user 行は書かれない（増分なし）
    expect(internals(agent)._userRows.get(USER_ID)).toBeUndefined();
    expect(internals(agent)._accountRow?.count).toBe(ACCOUNT_DAILY_LIMIT);
  });

  it("両方 deny: account を優先して scope=account を返す（拘束が長い方を先に伝える）", async () => {
    // 準備: user・account ともに上限
    const agent = new RateLimiter({} as never, {} as CloudflareBindings);
    internals(agent)._userRows.set(USER_ID, {
      window_start: NOW - 1_000,
      count: USER_PER_MINUTE_LIMIT,
    });
    internals(agent)._accountRow = { day: TODAY, count: ACCOUNT_DAILY_LIMIT };

    // Act
    const result = await agent.tryConsume(USER_ID);

    // Assert
    expect(result).toMatchObject({ allowed: false, scope: "account" });
  });
});
