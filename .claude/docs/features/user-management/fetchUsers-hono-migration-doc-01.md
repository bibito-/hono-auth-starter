# fetchUsers Hono 移行 実装仕様書

最終更新: 2026-06-26
ステータス: **完了**（PR #26 マージ・本番デプロイ・スモーク合格）

> 本ドキュメントは切り出し元プロジェクト（ai-todo）における実装履歴であり、本リポジトリには該当する PR・マイグレーションファイルは存在しない。設計判断の参考情報として保持している。

## 概要

ユーザー一覧取得（`useUserManagement.fetchUsers`）を、クライアントの Supabase 直読み（`profiles.select("*")`）から Hono の `GET /api/users`（`requireRole(["admin","manager"])` でゲート）経由へ移行する。これで user 管理のデータ授受（更新・削除は移行済み）が Hono に揃う。認証ハードニング roadmap v2 Phase 3 の**最後の read 残作業**。

## 設計方針

| 項目 | 決定内容 | 理由 |
|---|---|---|
| 認証方式 | **caller JWT + publishable key**（service_role を使わない）。ハンドラは呼び出し者の Bearer で `createClient` し `profiles` を読む | read は RLS をバイパスする理由がない。`requireRole` の入口ゲートに加え **RLS（admin/manager=全件・他=自分のみ）が2枚目の独立した防御**になる。write 3兄弟（PATCH/DELETE）の service_role を機械的に真似ない |
| ルートゲート | `requireRole(["admin","manager"])` を per-route で付与 | 既存 `PATCH/DELETE /api/users/:id` と同じ粗いロールゲート方式 |
| レスポンス形 | 必要列のみを **DB 行形（snake_case）** で返す（`id, username, role, email, updated_at`）。クライアントは既存 `mapToProfile` でマッピング継続 | `select("*")` の生露出をやめサーバが応答形を制御。email は既に admin/manager の UI に表示中で新規露出なし。マッピング層は据え置きで差分最小 |
| 並び順 | `order("updated_at", { ascending: true })` をサーバ側で維持 | 現状の表示順を保つ |
| CORS | `cors.ts` の `allowMethods` に `"GET"` を追加 | **明示列挙**しているため、追加し忘れると preflight 応答が GET を広告せず、Authorization ヘッダー付き GET をブラウザがブロックする（静かな失敗） |
| Realtime | 購読（`postgres_changes` on profiles）は **client→Supabase 直のまま**。変化時の再 fetch だけ `apiFetch("/api/users")` に向ける | Supabase Realtime は client 直結が標準。RLS でスコープ済み。WS を Worker でリレーするのは非標準で割に合わない（ハイブリッド構成） |
| エラー時 | fetch 失敗時は `users` を変更せず `loading` を解除（try/finally 挙動を維持） | スコープ最小化。永続フィードバック等は対象外 |
| スコープ外 | Todos の Hono 化・Vite proxy/`dev:full`・楽観的更新・ページング・サーバ側フィルタ・Realtime 購読の作り替え | 機械的移行に絞る。dev 構成整備は Todos 移行時にまとめる |

## API 仕様

```
GET /api/users
  認証: authMiddleware（/api/* 共通）→ requireRole(["admin","manager"])
  認証クライアント: caller の Bearer + SUPABASE_PUBLISHABLE_KEY（RLS スコープ）
  200: Array<{ id, username, role, email, updated_at }>   // profiles 行形
  403: requireRole 不通過（admin/manager 以外）／role 取得失敗（fail-closed）
  401: JWT 不正（authMiddleware）
  500: DB エラー（クライアントは users 据え置き＋loading 解除）
```

## 実装ステップ（完了）

1. `src/server/handlers/listUsers.ts`（新規）— `requireRole` 通過後、`c.req.header("Authorization")` の Bearer を取り出し `createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { global: { headers: { Authorization } } })`（`requireRole` と同作法）。`from("profiles").select("id, username, role, email, updated_at").order("updated_at", { ascending: true })`。`error`→500 / 他→`c.json(data ?? [], 200)`。
2. `src/server.ts` — `app.get("/api/users", requireRole(["admin","manager"]), listUsersHandler)` を `PATCH/DELETE /api/users/:id` の近くに登録。
3. `src/server/cors.ts` — `allowMethods` に `"GET"` 追加。
4. `src/client/hooks/useUserManagement.ts` — `fetchUsers` を `apiFetch("/api/users")` 経由へ（`res.ok` 確認→`res.json()`→`mapToProfile`、`finally` で `loading` 解除）。Realtime 購読（`channel("profiles-modify")`）は据え置き、コールバックは引き続き `fetchUsers`。
5. テスト — `src/server/handlers/listUsers.test.ts`（新規・5件）／`useUserManagement.test.ts`（fetchUsers 2件追加・既存モックを Realtime 専用へ整理）。

## 開発者が押さえるべき要点（理解必須・grill 由来）

### read で service_role を使わず caller JWT + publishable を選んだ帰結（多層防御）

混同しやすい点: write 3兄弟（PATCH/DELETE）は role 列の更新が service_role 経由でしか通らないため service_role を使う。これを read に機械的に真似ない。

`GET /api/users` は caller 自身の JWT + publishable key でクライアントを作るため、`requireRole` の入口ゲートと `profiles` SELECT の RLS（`view_profiles` = admin/manager は全件・他は自分の行のみ）が**独立した2層**として効く。帰結:

- もし requireRole 側に穴があり admin/manager 以外がハンドラに到達しても、その caller の JWT では RLS が「自分の1行」に絞るため、**最悪でも自分のプロフィールしか漏れない**（他人の email を含む全件露出にならない）。
- これを service_role で読んでいたら RLS を**完全にバイパス**し、入口ゲートが破れた瞬間に**全 role 行（email 含む）が丸ごと漏れる**。

→ read が RLS をバイパスする理由がないなら caller JWT + publishable を既定にする。2層が独立に効くことが被害限定の本質。

### Realtime はハイブリッド（購読は client 直・再取得は Hono）

購読を client 直結のまま残しても、`postgres_changes` は RLS を尊重するためデータ漏洩にならない。本 PR で変えたのは `fetchUsers` 内部（再取得が Hono 経由）だけで、購読配線（`event: "*"`）は不変。コールバックは update/delete とも同一の `fetchUsers` のため、両イベントは同じ再取得経路を通る。

## 公式照合

- **公式確認済み**（Hono CORS Middleware ドキュメント）: `allowMethods` は preflight 応答の `Access-Control-Allow-Methods` ヘッダーを設定する。既定は `['GET','HEAD','PUT','POST','DELETE','PATCH']` だが、本プロジェクトは明示列挙のため GET を足さないと GET が広告されない。
- **実装経験由来（公式未明記）**: Authorization ヘッダー付き GET は CORS-safelisted でないため preflight 対象になる。明示列挙に GET が無いと preflight 段階で本リクエストがブロックされる（初期は静かな失敗に見える）。

## スモーク結果（2026-06-26・本番）

| 項目 | 結果 |
|---|---|
| admin ログイン→一覧表示（updated_at 昇順） | ✅ |
| manager ログイン→一覧表示（全件） | ✅ |
| admin/manager 以外は一覧に到達しない／403 | ✅ |
| CORS: `GET /api/users` が 200・preflight OK | ✅ |
| 更新後に Realtime 経由で一覧が再取得され反映（再取得が Hono 経由） | ✅ |
| 削除後の同経路 | update と同一 `fetchUsers` 経路のため**等価スキップ**（DELETE 購読配線は本 PR 不変・delete 移行時に確認済み） |

## 関連ファイル

```
src/
├── server/
│   ├── handlers/
│   │   ├── listUsers.ts          # 新規: GET ハンドラ（caller JWT + RLS）
│   │   └── listUsers.test.ts     # 新規
│   ├── middleware/requireRole.ts # 既存（再利用）
│   └── cors.ts                   # allowMethods に GET 追加
├── server.ts                     # GET /api/users 登録
└── client/
    └── hooks/useUserManagement.ts # fetchUsers を apiFetch 経由へ
```

## 関連ドキュメント

- `role-change-hono-migration-doc-01.md`（PATCH 移行・service_role を使う write 側の出典）
- `delete-user-hono-migration-doc-01.md`（delete 移行・requireRole 導入の出典）
- `docs/features/auth/auth-hardening-roadmap-doc-01.md`（Phase 3 RBAC 全体方針）
- `docs/features/auth/jwt-auth-middleware-doc-01.md`（authMiddleware）
