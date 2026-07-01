/**
 * 固定窓レート制限の純粋判定関数。SQLite I/O を含まない。
 * DO 側はこの結果（allowed / retryAfter / nextRow）を使って読み書きするだけにする。
 * allow 時のみ呼び出し側が nextRow を永続化する（deny 時は枠を消費しない）。
 */

export type UserRow = { window_start: number; count: number };
export type AccountRow = { day: string; count: number };

export type Decision<Row> = {
  allowed: boolean;
  /** deny 時に窓が空くまでの秒（切り上げ）。allow 時は 0 */
  retryAfter: number;
  /** allow して永続化する場合に書き込む行（増分後） */
  nextRow: Row;
};

/**
 * per-user ローリング 60 秒固定窓。窓開始は最初のリクエスト時刻。
 * `now - window_start >= windowMs` で窓をリセットする。
 */
export function decideUserWindow(
  now: number,
  row: UserRow | null,
  limit: number,
  windowMs: number,
): Decision<UserRow> {
  const expired = !row || now - row.window_start >= windowMs;
  const start = expired ? now : row.window_start;
  const count = expired ? 0 : row.count;

  if (count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.ceil((start + windowMs - now) / 1000),
      nextRow: { window_start: start, count },
    };
  }
  return {
    allowed: true,
    retryAfter: 0,
    nextRow: { window_start: start, count: count + 1 },
  };
}

/** epoch ms を UTC カレンダー日 "YYYY-MM-DD" に変換する */
function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** 次の 00:00 UTC までの秒（切り上げ） */
function secondsToNextUtcMidnight(now: number): number {
  const d = new Date(now);
  const next = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1,
  );
  return Math.ceil((next - now) / 1000);
}

/**
 * account 日次固定窓（UTC カレンダー日アライン・00:00 UTC リセット）。
 * `day` が今日と違えばカウントをリセットする。
 */
export function decideAccountWindow(
  now: number,
  row: AccountRow | null,
  limit: number,
): Decision<AccountRow> {
  const today = utcDay(now);
  const count = row && row.day === today ? row.count : 0;

  if (count >= limit) {
    return {
      allowed: false,
      retryAfter: secondsToNextUtcMidnight(now),
      nextRow: { day: today, count },
    };
  }
  return {
    allowed: true,
    retryAfter: 0,
    nextRow: { day: today, count: count + 1 },
  };
}
