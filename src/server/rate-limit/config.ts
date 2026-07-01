/**
 * レート制限の上限値（開始値）を1箇所に集約する。
 * 運用結果（CF ダッシュボードの実 neurons）を見て1行変更＋再デプロイで締められる。
 * 根拠は `.claude/specs/rate-limiting/rate-limiting-spec-01.md` を参照。
 */

/** per-user 連打ガード: 60 秒あたりの許可回数 */
export const USER_PER_MINUTE_LIMIT = 10;

/** per-user ローリング固定窓の長さ（ms・最初のリクエスト時刻起点） */
export const USER_WINDOW_MS = 60_000;

/** account 無料枠天井ガード: 1 UTC 日あたりの許可回数（概算 25 neurons/req × 300 ≒ 無料枠の 75%） */
export const ACCOUNT_DAILY_LIMIT = 300;

/** 1 リクエストの概算 neurons（実測 12〜22 の安全側上限）。account 上限の根拠 */
export const EST_NEURONS_PER_REQUEST = 25;

/** Workers AI 無料枠（公式値・アカウント全体で 1 日）。account 上限の妥当性チェック用 */
export const FREE_DAILY_NEURONS = 10_000;
