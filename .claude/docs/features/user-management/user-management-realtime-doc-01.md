# user-management-realtime 実装仕様書

最終更新: 2026-07-05
ステータス: **設計確定・未実装**（今回は実装を行わず、そのまま `docs/` へ昇格する）

## 概要

管理者・マネージャーが同時に `UserManagementPage` を開いているとき、誰かがユーザーのロール・表示名を変更、または削除したら、他の接続中クライアントの一覧をライブ反映する機能。

**経緯（自己完結）**: hono-auth-starter は `jwt-cookie-migration` により、ブラウザが Supabase JWT を一切保持しなくなった。`useUserManagement.ts` は現状、`profiles` テーブルの RLS（`auth.uid()` 依存）に阻まれる Supabase Realtime 購読を持たず、`updateUser`/`deleteUser` 成功直後の `fetchUsers()` 手動再取得のみに依存している（他管理者による同時編集はライブ反映されず、次回操作・再訪問時にしか反映されない縮退運用）。本 spec は、Cookie 検証済みの JWT を前提にした Hono 経由 WebSocket（Durable Object 通知）へ置き換えることで、ライブ反映を実現する。

**移植元**: `ai-todo` の `.claude/docs/features/user-management/user-management-realtime-doc-01.md`（確定仕様。実装・grill・本番スモークテストまで完了済み）。ai-todo では元々 Supabase Realtime で実現していた同機能が jwt-cookie-migration で壊れ、本方式に置き換えて復旧した経緯があり、hono-auth-starter は最初からこの縮退状態で運用してきたため「復旧」ではなく「新規導入」にあたる。設計判断は ai-todo 側で検証済みのため踏襲し、hono-auth-starter 固有の差分（`TodoAgent` 相当のドメイン機能が存在しない・`agents/` ディレクトリが未作成・`vercel.json` が未作成）のみ調整する。

**実装方針（今回は非実施）**: このタスクでは `/tdd` による実装は行わない。仕様のすり合わせ・承認までを完了し、`.claude/docs/features/user-management/` へ「未実装の確定設計」として直接昇格する。理由: 機能自体は ai-todo 側で設計・実装・本番検証まで完了済みであり、hono-auth-starter への着手時期は未定のため、今のうちに確定設計を失わず記録しておく（ユーザー承認済み）。

## 設計方針

| 項目 | 決定内容 | 理由 |
|---|---|---|
| ブロードキャストのトリガー | `updateUser`（role・username いずれの変更も含む）と `deleteUser` の成功時 | 変更種別を問わず他管理者の一覧を最新に保つ |
| ペイロード | signal-only（`{type:"users-changed"}`）。実データは運ばない | 受信側は既存 `GET /api/users` を再実行して取得する。RBAC（`requireRole`）は GET 側で毎回効くため、共有チャンネルであっても実データの露出経路にならない。将来 RLS/RBAC が絞られても、認可の実施点を常に GET 側の1箇所に保てる |
| DO 設計 | 新規 `UserManagementAgent`。`idFromName("global")` で単一インスタンス共有 | admin/manager 全員が同じ変更通知を受け取る必要がある。単一インスタンスでも実データを保持しない中継役のため、共有そのものが露出リスクにはならない（signal-only の決定と表裏一体） |
| DO の配置場所 | `src/server/agents/UserManagementAgent.ts`（新規ディレクトリ） | hono-auth-starter は現状 `src/server/rate-limit/RateLimiter.ts` のみで DO 用の汎用ディレクトリが無い。ai-todo の `src/server/agents/` 配置を踏襲し、以後 WebSocket/Agents SDK ベースの DO はここに集約する |
| WS 接続の認可ゲート | `/api/users/ws` に `requireRole(["admin","manager"])` を適用 | 共有チャンネルのため一般ユーザー（staff/temporary）の接続を防ぐ必要がある |
| 自己ループ回避 | `onConnect` で `connection.id` をクライアントへ送信 → クライアントはメモリ上に保持（Cookie/localStorage 不使用）→ `updateUser`/`deleteUser` 実行時にヘッダー（`X-Ws-Connection-Id`）で送信 → ハンドラが `notifyUsersChanged(excludeId, callerUserId)` に渡し、DO 側で所有者検証後に `this.broadcast(msg, [excludeId])` | 変更した本人にも broadcast が届き `fetchUsers()` と二重になるのを避ける。Cookie 保持は却下（Cookie はタブ単位でなくオリジン単位共有のため、複数タブでは他タブの `connectionId` を上書きしてしまい自己除外が壊れる）。WS 未接続・再接続中でヘッダーが無い場合は除外なし（無駄な再 fetch が1回起きるだけで実害なし） |
| `X-Ws-Connection-Id` の spoofing 対策 | `onConnect` で `connection.setState({ userId })` に紐付ける。`userId` は Hono が `requireRole` 通過後に確定させた検証済み値を、DO へ転送する fetch リクエストに `X-Internal-User-Id` ヘッダー（サーバー内部専用、クライアントは触れない）として載せて渡す。`notifyUsersChanged(excludeConnectionId, callerUserId)` は `getConnection(excludeConnectionId)?.state?.userId === callerUserId` を満たす場合のみ実際に除外し、一致しなければ除外なし（`without` 未指定）にフォールバックする | クライアント自己申告の `excludeId` をそのまま信用すると、admin/manager が他人の（推測困難だが）connectionId を送って他管理者への通知だけを黙って握り潰せてしまう（実害は当該ユーザーの画面が次操作まで stale になる程度で情報漏洩ではないが、防げるなら防ぐ）。`connection.state`/`setState()` は Agents SDK 標準機能でありハンドロールのキャッシュを持つ必要がない。Hono→DO は同一 Worker 内の binding 呼び出しのためクライアントによるヘッダー偽装は不可能 |
| 再接続 | 固定 3 秒リトライ | 実装コストを最小化しつつシンプルな挙動を保つ |
| クライアント側の配置 | `useUserManagement.ts` から独立した WS 専用クラス `UserManagementRealtimeClient` として切り出す。スワップ可能インターフェースは作らない | WS・再接続・`connectionId` 保持のロジックは React フックに直書きするとテストしにくいため独立クラスに切り出す価値がある。一方 user-management のデータソース（Supabase 経由 Hono API）は既に確定しており、データソース未決定という抽象化の動機が無いため、インターフェース化はバックログにも入れない（YAGNI） |
| CORS 追加ヘッダー | `src/server/cors.ts` の `allowHeaders` に `X-Ws-Connection-Id` を追加 | Vercel（フロント）と Workers（バック）はクロスオリジンのため、独自ヘッダーは `allowHeaders` に無いとプリフライトで弾かれる。忘れると自己除外が常に無効化される |
| `vercel.json` の新規作成 | 本テンプレートに `vercel.json` が現状存在しないため、この spec で新規作成する。CSP `connect-src` に本番 Worker ドメインの `https://`/`wss://` を追加する（`cors.ts` の `ALLOWED_ORIGINS` 同様、確定 URL は未定のため TODO プレースホルダーとして残す） | WebSocket 接続はブラウザの CSP `connect-src` の制約を受ける。`connect-src` に `wss://` オリジンが無いと接続そのものがブラウザ側でブロックされる。ai-todo の `vercel.json` は直接 Supabase 接続（`https://*.supabase.co` 等）も含むが、hono-auth-starter は client から Supabase を直叩きしていない（`jwt-cookie-migration` で全て Hono 経由に統一済み）ため、hono-auth-starter 版は Worker ドメインのみで足りる |

## 実装ステップ

**注意**: 以下は `/tdd user-management-realtime` を将来実行する際の実装ステップ。今回のタスクでは実施しない。

### Step 1 — `UserManagementAgent`（Durable Object）
対象: `src/server/agents/UserManagementAgent.ts`（新規）
- `Agent<CloudflareBindings>` を継承（`RateLimiter` と同様の基底クラス）
- `onConnect(connection, ctx)` をオーバーライドし、`ctx.request` の `X-Internal-User-Id` ヘッダー（Step 3 で Hono が付与する検証済み値）を読み取り `connection.setState({ userId })` で紐付ける。続けて `connection.send(JSON.stringify({ type: "connected", connectionId: connection.id }))` を送信
- `notifyUsersChanged(excludeConnectionId?: string, callerUserId?: string)`:
  - `excludeConnectionId` が指定されていれば `getConnection(excludeConnectionId)` を引き、その `state.userId === callerUserId` の場合のみ実際の除外対象として採用する（不一致・接続不在なら除外なし）
  - `this.broadcast(JSON.stringify({ type: "users-changed" }), validExcludeId ? [validExcludeId] : undefined)`

### Step 2 — DO バインディング登録
対象: `wrangler.jsonc`
- `durable_objects.bindings` に `{ name: "UserManagementAgent", class_name: "UserManagementAgent" }` を追加
- `migrations` に新規タグを追加: `{ tag: "v2", new_sqlite_classes: ["UserManagementAgent"] }`（既存 `v1: RateLimiter` に追記するのではなく、**1クラス1タグ**の新規タグとして追加する）

### Step 3 — WS ルート
対象: `src/server.ts`
- `GET /api/users/ws`: `requireRole(["admin","manager"])` を通過後、`c.get("user").id` を取得し、`c.env.UserManagementAgent.idFromName("global")` の stub へ委譲する fetch リクエストに `X-Internal-User-Id: userId` ヘッダーを付与して転送する

### Step 4 — 変更ハンドラからの通知
対象: `src/server/handlers/updateUser.ts`, `src/server/handlers/deleteUser.ts`
- 成功時、リクエストヘッダー `X-Ws-Connection-Id`（クライアント自己申告の excludeId 候補）を読み取り、`c.executionCtx.waitUntil(agent.notifyUsersChanged(excludeId, caller.id))` のように呼び出し元の検証済み `caller.id` も併せて渡す

### Step 5 — CORS 設定
対象: `src/server/cors.ts`
- `allowHeaders` に `X-Ws-Connection-Id` を追加

### Step 6 — `vercel.json` 新規作成
対象: `vercel.json`（新規）
- CSP を含むセキュリティヘッダーを設定し、`connect-src` に本番 Worker ドメインの `https://`/`wss://` を追加（確定 URL は TODO プレースホルダー）

### Step 7 — クライアント WS クラス
対象: `src/client/services/UserManagementRealtimeClient.ts`（新規）
- プレーン `WebSocket` ラッパー、固定 3 秒リトライ
- `{type:"connected", connectionId}` 受信時に内部状態として保持、`getConnectionId()` で取得可能にする
- `{type:"users-changed"}` 受信時に `onChange` コールバックを呼ぶ

### Step 8 — `useUserManagement.ts` への統合
対象: `src/client/hooks/useUserManagement.ts`
- マウント時に `UserManagementRealtimeClient` を接続し、`onChange` で `fetchUsers()` を呼ぶ
- `updateUser`/`deleteUser` の `apiFetch` 呼び出し時、`getConnectionId()` が値を持っていれば `X-Ws-Connection-Id` ヘッダーを付与（無ければ省略）

### Step 9 — ドキュメント更新
対象:
- `.claude/docs/features/user-management/user-management-doc-*.md`（最新連番ファイルに、Supabase Realtime縮退運用からHono WSへ置き換えた旨を修正履歴として追記）
- `.claude/docs/features/user-management/user-management-realtime-doc-01.md`（本 spec が既にここに存在するため、実装完了後に「ステータス: 完了」へ更新し、実装で判明した差分があれば追記）

## 関連ファイル

```
src/
├── client/
│   ├── hooks/
│   │   └── useUserManagement.ts        # WSクラスを統合、connectionIdをヘッダー付与
│   └── services/
│       └── UserManagementRealtimeClient.ts   # 新規: WS接続・再接続・connectionId保持
└── server/
    ├── agents/                         # 新規ディレクトリ
    │   └── UserManagementAgent.ts      # 新規: 共有DO、onConnect + notifyUsersChanged
    ├── handlers/
    │   ├── updateUser.ts               # 成功時にnotifyUsersChanged呼び出しを追加
    │   └── deleteUser.ts               # 同上
    ├── cors.ts                         # allowHeadersにX-Ws-Connection-Id追加
    └── server.ts                       # GET /api/users/ws ルート追加

wrangler.jsonc                          # UserManagementAgentバインディング追加（v2タグ）
vercel.json                             # 新規作成: CSP（connect-srcにwss://追加）
```

## 開発者が押さえるべき要点（理解必須・ai-todo での grill 由来）

- **通知ペイロードがsignal-onlyである理由**: 今のRBAC（admin/manager=全件）だけを見ると「全員に送っても問題ない」ように見えるが、本質は将来の変更への耐性。仮に実データをbroadcastに乗せると、将来RBACが絞られた（例: managerは自チームのみ閲覧可）場合でも、broadcast経路は認可チェックを経由しないため古い認可のままデータを流し続け、露出経路として抜け穴化する。`GET /api/users`を再実行させる設計にすることで、認可の実施点を常に1箇所（GET側）に保っている。
- **`excludeConnectionId`を鵜呑みにしない理由**: このIDは自己ループ回避のためのクライアント自己申告値であり、そのまま`broadcast(msg, [excludeId])`に使うと、悪意ある利用者が他人のconnectionIdを送ることで「その他人」を狙って通知だけを黙って握り潰せてしまう（データ漏洩ではなく、特定の相手の画面を古いまま止める攻撃）。そのため`connection.state.userId`（サーバーが接続時に検証済みでセットした値）と呼び出し元の`caller.id`が一致する場合のみ実際に除外する所有者検証を挟んでいる。
- **`vercel.json`を今のうちに作る理由（hono-auth-starter固有の備忘）**: 本番Workerドメインが確定していない現時点では`connect-src`のTODOプレースホルダーが埋まらず`vercel.json`単体では機能しないが、CSPヘッダーの型・構成をここで確定させておくことで、本番デプロイ時に`cors.ts`の`ALLOWED_ORIGINS`と同時に埋めるべき箇所として把握できるようにする。

## スコープ外

- Supabase Realtime への回帰は検討しない（`jwt-cookie-migration`によりRLS経由の購読が機能しないため技術的に不可）。
- `TodoAgent`相当のコンテンツ機能は本テンプレートに存在しないため、参照・言及のみでコード上の依存は作らない。
