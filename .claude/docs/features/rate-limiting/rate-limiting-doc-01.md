# レート制限（Phase 6）実装仕様書

最終更新: 2026-06-25
ステータス: 完了
ロードマップ: `.claude/docs/features/auth/auth-hardening-roadmap-doc-01.md` Phase 6（roadmap-v2 最終フェーズ）

## 概要

認証済みユーザーの連打・濫用から AI 推論コスト（Workers AI Neuron 無料枠）と DO 負荷を守る。`POST /api/todos/analyze`（唯一の AI 起動経路）に対し、**ユーザー単位（連打ガード）**と**アカウント全体（無料枠の天井ガード）**の2層の固定窓レート制限を課し、上限超過時に 429 を返す。クライアントは scope に応じた Toast でフィードバックする。

## 前提（確定済みの土台）

- Phase 1 で JWT 認証導入済み。`c.get("user").id`（JWT `sub`）で「誰が叩いているか」を特定できる
- `POST /api/todos/analyze` は `userId` でキーした `TodoAgent` DO に `waitUntil(agent.enrich(...))` で委譲し **即 202** を返す（`src/server.ts`）
- enrich 失敗時の UX は既存の null-tag アフォーダンス（`TagBadge` の「＋ タグを付ける」）で回復可能（Phase 4 item2）

## 公式確認済みの事実（Cloudflare Workers AI Pricing）

- Workers Free / Paid とも **無料枠はアカウント全体で 10,000 Neurons/日**。超過分は Paid で $0.011/1,000 Neurons、Free は以降エラーで失敗
- **毎日 00:00 UTC にリセット**
- 分類モデル `@cf/qwen/qwen3-30b-a3b-fp8`: 入力 4,625 neurons/Mtok・出力 30,475 neurons/Mtok
- 1リクエスト実測 **12〜22 neurons**（ユーザー目視確認・タイトル 20〜30 文字）。見積り `25 neurons/req`（安全側）に収まる

## 設計方針

| 項目 | 決定内容 | 理由 |
|---|---|---|
| 制御フロー | 判定 RPC `tryConsume(userId)` を `waitUntil` の**前**に `await`。超過で 429、許可で従来どおり `waitUntil(enrich)` ＋ 202 | enrich 内部に置くと 202 即返しのため 429 をクライアントに返せない。判定は SQLite 更新のみで軽量・AI 推論を待たない |
| 保護の射程（scope） | **2層: per-user（連打）＋ account（無料枠天井）** | per-user だけでは全ユーザー合算が 10,000/日を超えるのを止められない。account 層を追加 |
| アルゴリズム | **固定窓カウンタ** | 無料枠の天井が「10,000/日・00:00 UTC リセット」= 日次固定窓で、仕様に1対1で対応。状態が最小（窓開始＋カウント）で掃除不要 |
| カウンタの置き場所 | **シングルトン DO（新クラス `RateLimiter`）1つ**に per-user 行と account 行を集約 | KV は atomic increment がなく結果整合で取りこぼす。単一 DO は直列化され strong consistency。正確な計数には直列化が望ましい |
| 判定 API | ハンドラは `tryConsume(userId)` 1 RPC で per-user・account を **atomically 判定** | 判定が1箇所・1往復。どちらの上限に当たったかを1レスポンスで返せ、クライアント文言を出し分けられる |
| account のカウント単位 | **リクエスト数**（実 neurons 実測ではなく概算 25/req ベース） | 実行時に1呼び出しの実 neurons を取る API がなく直接計数は重い。保守的見積りで枠の 75% に抑え、スモークで補正 |
| 上限値の管理 | 全上限を**1つの設定モジュール（定数）に集約** | 運用結果（ダッシュボードの実 neurons）を見て1行変更＋再デプロイで締められる |
| リミッタ障害時 | **fail-open**（通す＝enrich 実行・202）＋ fail-open 経路で `console.error` | タグ付けは補助機能でリミッタは保護層。CF が 10,000 で hard-stop するため fail-open でも最悪 CF エラーに縮退。リミッタ障害の感知は運用者向け＝ログ、ユーザー回復は既存 null-tag アフォーダンス |
| クライアント表示 | 429 を scope で出し分け、**user/account とも自動消滅 Toast**（v1） | 画面遷移しないため Toast 必要（ux-feedback-policy）。account の永続表示は別 spec（後述スコープ外） |

## 上限値（開始値・設定モジュールに集約）

対象: `src/server/rate-limit/config.ts`

| 定数 | 値 | 根拠 |
|---|---|---|
| `USER_PER_MINUTE_LIMIT` | `10` | 人手の todo 追加は1件ずつ。10/分は正常利用に余裕・機関銃連打は止まる |
| `USER_WINDOW_MS` | `60_000` | per-user は 60 秒のローリング固定窓（最初のリクエスト時刻起点） |
| `ACCOUNT_DAILY_LIMIT` | `300` | `EST_NEURONS_PER_REQUEST` × 300 = 7,500 ≒ 無料枠 10,000 の 75%（実測 22/req なら 66%）。25% バッファ |
| `EST_NEURONS_PER_REQUEST` | `25` | 実測 12〜22 の安全側上限。account 上限の根拠を明示し再計算可能にする |
| `FREE_DAILY_NEURONS` | `10_000` | 公式値。account 上限の妥当性チェック用 |

> account 窓は **UTC カレンダー日アライン**（00:00 UTC リセット＝CF の無料枠リセットと一致）。per-user 窓は最初のリクエストからのローリング 60 秒。reset 規則が異なるため別管理。

## データモデル（DO SQLite・新クラス `RateLimiter`）

シングルトン: `env.RateLimiter.idFromName("global")`。

```sql
-- per-user ローリング 60 秒窓
CREATE TABLE IF NOT EXISTS user_window (
  user_id      TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,  -- epoch ms（窓の最初のリクエスト時刻）
  count        INTEGER NOT NULL
);

-- account 日次窓（UTC カレンダー日アライン・単一行）
CREATE TABLE IF NOT EXISTS account_window (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  day   TEXT NOT NULL,           -- "YYYY-MM-DD"（UTC）
  count INTEGER NOT NULL
);
```

> DB スキーマ変更（Supabase マイグレーション）は**不要**。状態は DO 内 SQLite に閉じる。Supabase の `todos` 等には触れない。
> 公式確認済み: Agents SDK `Agent`（v0.16.1）は `sql<T>(strings, ...values): T[]` タグ付きテンプレートを公開し DO の SQLite を実行する。`wrangler.jsonc` の `migrations` で `new_sqlite_classes: ["RateLimiter"]` を宣言して初めて SQLite ストレージが有効化される。

## `tryConsume(userId)` の判定ロジック（DO 単一スレッドで atomic）

返り値: `{ allowed: true } | { allowed: false; scope: "user" | "account"; retryAfter: number }`（`retryAfter` は秒）。

1. **両方の判定を「増分せずに」評価する**（片方だけ増やして他方が deny だと枠を誤消費するため）
   - **user 判定**: `user_window` を読む。`now - window_start >= USER_WINDOW_MS` なら窓リセット（`window_start=now, count=0`）扱い。`count >= USER_PER_MINUTE_LIMIT` なら deny（scope=`user`, `retryAfter = ceil((window_start + USER_WINDOW_MS - now)/1000)`）
   - **account 判定**: `account_window` を読む。`day` が今日（UTC）と違えば `count=0` 扱い。`count >= ACCOUNT_DAILY_LIMIT` なら deny（scope=`account`, `retryAfter =` 次の 00:00 UTC までの秒）
2. **どちらかが deny なら増分せず deny を返す**。両方 deny のときは **account を優先**（account は 00:00 UTC まで続く実際の天井。user-scope を先に見せるとユーザーは 60 秒後に再試行→再び account deny で日次上限を後出しで知り、無駄なリトライループに入る。拘束が長い方を先に伝える方が actionable）
3. **両方 allow なら user・account 両カウンタを増分して永続化し allow を返す**

> fail-open: `tryConsume` 内で例外が出た場合は呼び出し側（ハンドラ）が catch して `console.error` し、enrich を実行して 202 を返す。

## 429 レスポンス契約

- HTTP `429`
- ヘッダ `Retry-After: <整数秒>`（標準）
- ボディ `{ "error": "rate_limited", "scope": "user" | "account", "retryAfter": <秒> }`

## 実装ステップ

### Step 1 — 固定窓の純粋判定関数
対象: `src/server/rate-limit/decideFixedWindow.ts`・`*.test.ts`
- `decideUserWindow(now, row, limit, windowMs)` / `decideAccountWindow(now, row, limit)` を純粋関数として実装（SQLite I/O を含まない）
- 返り値に `{ allowed, nextRow, retryAfter }` を含め、DO 側はこれを使って読み書きするだけにする
- 窓リセット境界・上限ちょうど・超過・retryAfter 算出をユニットテスト（testing-comment-rules のフェーズコメント順守）

### Step 2 — `RateLimiter` DO
対象: `src/server/rate-limit/RateLimiter.ts`・`*.test.ts`
- Agents SDK の `Agent<CloudflareBindings>` を継承（`this.sql` を使用。TodoAgent と同じ基底・テストモック方式を踏襲）
- テーブル初期化と `tryConsume(userId)` を実装。判定は Step 1 の純粋関数に委譲し、allow 時のみ両カウンタを増分
- **両方 deny 時の account 優先**・増分しない deny・両 allow 時のみ増分を検証（`TodoAgent.test.ts` の `vi.mock("agents")` パターンを流用）

### Step 3 — wrangler 登録 ＋ 型再生成
対象: `wrangler.jsonc`・`worker-configuration.d.ts`
- `durable_objects.bindings` に `{ "name": "RateLimiter", "class_name": "RateLimiter" }` を追加
- `migrations` に `{ "tag": "v2", "new_sqlite_classes": ["RateLimiter"] }` を追加
- `src/server.ts` で `export { RateLimiter }`
- `pnpm cf-typegen`（`--env-interface CloudflareBindings`）で `CloudflareBindings` を再生成
  - 注意: 素の `wrangler types` を実行すると env interface 名が `Env` に化ける。必ずプロジェクトの `cf-typegen` スクリプトを使う

### Step 4 — ハンドラに二段構えを組み込む
対象: `src/server.ts`
- `/api/todos/analyze` で `waitUntil(enrich)` の**前**に `RateLimiter.idFromName("global")` の `tryConsume(userId)` を `await`
- `try/catch` で囲み、例外時は fail-open（`console.error` ＋ enrich 実行 ＋ 202）
- deny 時は 429（`Retry-After` ヘッダ ＋ 上記ボディ）を返し、enrich を呼ばない
- allow 時は従来どおり `waitUntil(agent.enrich(todoId, title, token))` ＋ 202

### Step 5 — クライアントの 429 導線
対象: `src/client/hooks/useAddTodo.ts`・`src/client/utils/toastHelpers.tsx`
- `requestAiTagging` を、レスポンスを検査する形に変更：`res.status === 429` ならボディを parse し `showRateLimitToast(scope, retryAfter)` を呼ぶ（fetch 自体の reject は従来どおり握り潰し）
- `toastHelpers.tsx` に `showRateLimitToast(scope, retryAfter)` を新設。scope で文言を出し分け：
  - `user`: 「タグ付けの回数制限に達しました」/「少し待って再度お試しください（約N秒後）」
  - `account`: 「本日の AI タグ付け上限に達しました」/「時間をおいて再度お試しください」
- v1 は両 scope とも自動消滅 Toast（sonner 既定）

## マージゲート結果

- **grill**: 全6問通過。grill 由来で「両方 deny の scope 優先」を user→account に修正（下記「押さえるべき要点」4 に反映）
- **公式照合**: Workers AI 無料枠 10,000/日・00:00 UTC リセット・モデル neuron 単価を本 doc「公式確認済みの事実」に記載。Agents SDK `this.sql` API・migration による SQLite 有効化も公式確認済み
- **スモーク**（2026-06-25・本番 `ai-todo.workers.dev`）: `USER_PER_MINUTE_LIMIT` を一時的に `3` にして再デプロイ → 60 秒内に 4 件追加 → 4 件目で **429 を DevTools で確認・scope=user の Toast 表示を確認**。`wrangler tail` で `RateLimiter.tryConsume` が毎リクエスト起動・fail-open ログ無し（DO 内例外なし）を確認。確認後 `USER_PER_MINUTE_LIMIT` を `10` に戻して再デプロイ
  - 教訓: config はバンドルに焼き込まれるため、上限変更は `pnpm deploy`（`vite build && wrangler deploy`）の再デプロイで初めて本番反映される。per-user 窓は 60 秒ローリングのため、検証時は窓内に上限超の回数を**連続**で送る必要がある

## スコープ外（別 spec・後回し）

- **account-scope の永続フィードバック UX**（00:00 UTC まで継続する長時間状態を「消えない通知」で表示し続ける案）。`steering/current.md` 後回しタスクに記録。Phase 6 は 429 を scope 付きで返し scope で Toast 出し分けまで
- **per-user の日次上限（公平性）**: 1ユーザーが account 枠を独占し得る問題。実害が出たら per-user 日次カウンタを後付け
- **account のカウントを実 neurons 計測に変える**案（v1 はリクエスト数概算）

## 関連ファイル

```
src/
├── server.ts                              # tryConsume 二段構え・RateLimiter export・429 契約
└── server/
    └── rate-limit/
        ├── config.ts                      # 上限値の定数集約
        ├── decideFixedWindow.ts           # 純粋判定関数
        └── RateLimiter.ts                 # シングルトン DO（per-user 行＋account 行）
src/client/
├── hooks/useAddTodo.ts                    # requestAiTagging で 429 を検査
└── utils/toastHelpers.tsx                 # showRateLimitToast 追加
wrangler.jsonc                             # RateLimiter binding ＋ migration v2
worker-configuration.d.ts                  # 型再生成
```

## 開発者が押さえるべき要点（理解必須・grill 由来）

設計判断とその**非自明な帰結**だけを残す。プラットフォーム仕様（DO/KV/Workers AI）は 📌 で出所を添える。

1. **判定は `waitUntil(enrich)` の前に `await` する必然性。** `waitUntil` はバックグラウンド実行で、ハンドラは enrich 完了を待たず即 202 を返す。判定を enrich 内部に置くと、超過を検知した時点で 202 は確定済みのため **429 をクライアントに返せない**。前段で `await` して初めて 202/429 を分岐できる。

2. **fail-open でもコストが青天井にならない理由。** リミッタは唯一のコスト上限ではなく「手前で穏当に断る保護層」。最後の歯止めは 📌 **CF 側の無料枠 hard-stop（10,000 neurons/日・00:00 UTC リセット／公式確認済み）**。よって障害時 fail-open でも最悪は「CF が枠超過でエラー」へ縮退するだけ。リミッタ障害はログで運用者に知らせ、ユーザー回復は既存 null-tag アフォーダンスに委ねる。

3. **deny 時に増分しない理由。** 片層 allow / 片層 deny で allow 側だけ先に +1 すると、enrich を実行していない（AI コスト未消費の）リクエストで枠を誤消費し、ユーザーが本来より早く連打ガードに当たる。だから「増分せず両層評価 → 両方 allow のときだけ両方増分」の順序にする。

4. **両方 deny は account を優先（user ではない）。** 両方 deny ＝ account 天井に当たっている状態で、account は 00:00 UTC まで続く実際の拘束。ここで user-scope（「60 秒待って」）を返すと、ユーザーは 60 秒後に再試行 → 再び account deny で日次上限を**後出しで知り**、無駄なリトライループに入る。拘束が長い方を先に伝える方が actionable。**混同しやすい点**: 「user は短命だから優先」は片層 deny のときの話で、両方 deny には当てはまらない。

5. **account を「リクエスト数 × 概算 25 neurons」で数える前提の崩れる条件。** `10,000 ÷ 300 ≒ 33.3` のため、**平均が 33 neurons/req を超えると 300 リクエストで無料枠を割る**。実 neurons はユーザー入力のコンテキスト量（長文タイトル等）に比例するため、スモークで実測しダッシュボードを見て `ACCOUNT_DAILY_LIMIT` / `EST_NEURONS_PER_REQUEST` を 1 行で締める。

6. **なぜシングルトン DO 1 つに集約したか（正確な計数の土台）。** 📌 KV は atomic increment が無く、同時リクエストの read-modify-write で lost update を起こし上限を素通りさせる。📌 per-user DO に散らすと account（全ユーザー横断）を 1 トランザクションで読めない。📌 DO は単一スレッドで同一 id への全リクエストが直列化されるため、user 行・account 行の評価＋増分を atomic に実行できる。代償の「全 analyze が 1 DO に集中する直列ボトルネック」は、analyze が低頻度・処理が軽量 SQLite のみのため許容。
