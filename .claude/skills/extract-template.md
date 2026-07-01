# テンプレート切り出し手順

このプロジェクトから再利用可能な資産を抜き出し、新規プロジェクトの土台にする手順。
**実行前に `steering/current.md` の「後回しタスク > セキュリティ改善タスク」が完了済みであることを確認すること。**

---

## 切り出す資産・除外する資産

### 持ち込む（コンテンツ非依存）

| 種別 | パス | 備考 |
|---|---|---|
| 認証 MW | `src/server/middleware/auth.ts` | JWKS / ES256 JWT 検証 |
| RBAC MW | `src/server/middleware/requireRole.ts` | role は新プロジェクトの定義に差し替え |
| CORS | `src/server/cors.ts` | オリジン列挙のみ差し替え |
| レートリミッタ | `src/server/rate-limit/` | AI 呼び出しがある場合そのまま使える |
| 型定義 | `src/shared/types/hono.ts` | HonoVariables の雛形 |
| ユーザー管理 API | `src/server/handlers/listUsers.ts` / `deleteUser.ts` / `updateUser.ts` | profiles テーブル CRUD。role 種別は新プロジェクトに合わせる |
| Supabase クライアント | `src/client/clients/supabaseClient.ts` | env var 名のみ確認 |
| Supabase 認証サービス | `src/client/services/SupabaseAuthService.ts` | onAuthStateChange デッドロック回避済み |
| 認証コンテキスト | `src/client/contexts/Auth*.tsx` | AuthContext / AuthProvider / AuthErrorProvider |
| apiFetch | `src/client/lib/apiFetch.ts` | 401 ハンドリング改善後に持ち込む |
| ProtectedRoute | `src/client/routes/ProtectedRoute.tsx` | loading ガード改善後に持ち込む |
| RoleProtectedRoute | `src/client/routes/RoleProtectedRoute.tsx` | 同上。権限外リダイレクト先 `/todos` はコンテンツ固有のハードコードなので新プロジェクトのパスに差し替える |
| ルーティング | `src/client/routes/AppRoutes.tsx` | todos 固有のルート（`/todos` パス・index の `/todos` リダイレクト）は除いて持ち出す |
| 認証 UI | `src/client/components/features/auth/` | `LoginWithEmail`/`SignUp` とその子コンポーネント一式（`AuthTextField`/`EmailConfirmationNotice`/`login/*`/`signup/*`） |
| 404 ページ | `src/client/components/pages/NotFoundPage.tsx` | |
| ユーザー管理 UI | `src/client/components/pages/UserManagementPage.tsx` | |
| ユーザー管理 hook | `src/client/hooks/useUserManagement.ts` | |
| Profile エンティティ | `src/client/entities/Profile.ts` | profiles テーブルの型 |
| UserRole エンティティ | `src/client/entities/UserRole.ts` | role 種別は新プロジェクトの定義に差し替え |
| AuthUser エンティティ | `src/client/entities/AuthUser.ts` | |
| UI コンポーネント | `src/client/components/ui/` | shadcn/ui 雛形一式 |
| デザイントークン | `src/client/App.css` | shadcn テーマ変数・ライト/ダークモード定義。汎用 |
| ヘッダー | `src/client/components/layout/Header.tsx` | ブランドタイトル文字列 `"Todos"` とロゴリンク先 `todosHref` は新プロジェクトの値に差し替え |
| コンテンツナビ | `src/client/components/features/header/ContentNavigation.tsx` | `/users` リンクのみで todos 非依存、そのまま使える |
| profiles 関連マイグレーション | `supabase/migrations/` のうち下記5本のみ | 詳細は Step 6 参照。todos 系マイグレーションと混在しているので取り違えに注意 |
| `.claude/rules/` | 全ファイル | セキュリティ・認証・TanStack Query・UI 規約 |
| `.claude/skills/` | 全ファイル（本ファイル含む） | スラッシュコマンド・手順書 |
| `.claude/steering/security_tasks/` | 全ファイル | セキュリティ改善チェックリスト |
| `.claude/docs/features/user-management/` | 全ファイル | user-management 実装仕様一式 |
| `.claude/docs/migrations/user-management-design_1.md` | | profiles テーブルの設計根拠 |
| `.claude/docs/features/layout/` | 全ファイル | デザイントークン・ヘッダーの設計判断（app-color-scheme-doc-01/02・header-color-scheme-doc-01・header-restyle-doc-01） |
| `CLAUDE.md` | ルート | プロジェクト固有部分は書き直す |

### 除外する（todos ドメイン固有）

| パス | 理由 |
|---|---|
| `src/server/agents/TodoAgent.ts` | todos 専用 AI agent |
| `src/server/handlers/listTodos.ts` | todos エンドポイント |
| `src/client/repositories/` | todos リポジトリ |
| `src/client/hooks/useAddTodo.ts` 等 | todos ユースケース |
| `src/client/components/features/todo/` | todos UI |
| `src/client/entities/Task.ts` | todos エンティティ |
| `src/shared/entities/TodoTag.ts` | todos 固有のタグ定義（`src/shared/entities/` は `UserRole.ts` と同居しているので取り違えに注意） |
| `supabase/migrations/`（todos 関連のみ） | todos スキーマ変更分（`add_sort_order`/`add_deadline_at`/`sort_key` 系/`enable_realtime_for_todos`/`todos_replica_identity_full`/`add_tag_check_constraint_to_todos`/`initial_schema` 等）。profiles/event_logs 専用の5本は持ち込む対象（上表参照） |
| `src/shared/types/database.types.ts` | 自動生成。新プロジェクトで再生成 |
| `.claude/docs/features/todos/` | todos 固有の設計ドキュメント |

---

## 手順

### Step 1 — リポジトリ作成

```bash
# GitHub 上で新リポジトリを作成後
git clone <new-repo-url>
cd <new-repo>
```

### Step 2 — パッケージ構成をコピー

```bash
# このプロジェクトから package.json / pnpm-lock.yaml / tsconfig / wrangler.toml をコピー
cp <ai-todo>/package.json .
cp <ai-todo>/pnpm-lock.yaml .
cp <ai-todo>/tsconfig*.json .
cp <ai-todo>/wrangler.toml .
cp <ai-todo>/vite.config.ts .
cp <ai-todo>/postcss.config.js .
cp <ai-todo>/tailwind.config.js .
```

`package.json` の `name` と `description` を新プロジェクト名に変更する。
`wrangler.toml` の `name` と `compatibility_date` を確認・更新する。

### Step 3 — サーバー基盤をコピー

```bash
mkdir -p src/server/middleware src/server/rate-limit src/server/handlers src/shared/types

cp <ai-todo>/src/server/middleware/auth.ts       src/server/middleware/
cp <ai-todo>/src/server/middleware/requireRole.ts src/server/middleware/
cp <ai-todo>/src/server/cors.ts                  src/server/
cp <ai-todo>/src/server/rate-limit/              src/server/rate-limit/ -r
cp <ai-todo>/src/shared/types/hono.ts            src/shared/types/
cp <ai-todo>/src/server/handlers/listUsers.ts    src/server/handlers/
cp <ai-todo>/src/server/handlers/deleteUser.ts   src/server/handlers/
cp <ai-todo>/src/server/handlers/updateUser.ts   src/server/handlers/
```

**差し替え箇所:**
- `src/server/cors.ts` の `ALLOWED_ORIGINS` を新プロジェクトのオリジンに更新
- `src/shared/types/hono.ts` の `HonoVariables` の `role` 型を新 UserRole に合わせる
- `requireRole.ts` の role 参照を新プロジェクトの role 定義に合わせる

### Step 4 — クライアント認証基盤をコピー

```bash
mkdir -p src/client/{clients,services,contexts,routes,lib,entities,hooks}
mkdir -p src/client/components/{ui,pages,layout}
mkdir -p src/client/components/features/{auth,header}

cp <ai-todo>/src/client/clients/supabaseClient.ts    src/client/clients/
cp <ai-todo>/src/client/services/SupabaseAuthService.ts src/client/services/
cp <ai-todo>/src/client/services/AuthService.ts      src/client/services/
cp <ai-todo>/src/client/contexts/Auth*.tsx           src/client/contexts/
cp <ai-todo>/src/client/routes/ProtectedRoute.tsx    src/client/routes/
cp <ai-todo>/src/client/routes/RoleProtectedRoute.tsx src/client/routes/
cp <ai-todo>/src/client/routes/AppRoutes.tsx         src/client/routes/
cp <ai-todo>/src/client/lib/apiFetch.ts             src/client/lib/
cp <ai-todo>/src/client/components/ui/              src/client/components/ui/ -r
cp <ai-todo>/src/client/components/features/auth/   src/client/components/features/auth/ -r
cp <ai-todo>/src/client/components/features/header/  src/client/components/features/header/ -r
cp <ai-todo>/src/client/components/layout/Header.tsx src/client/components/layout/
cp <ai-todo>/src/client/components/pages/UserManagementPage.tsx src/client/components/pages/
cp <ai-todo>/src/client/components/pages/NotFoundPage.tsx       src/client/components/pages/
cp <ai-todo>/src/client/hooks/useUserManagement.ts   src/client/hooks/
cp <ai-todo>/src/client/entities/Profile.ts          src/client/entities/
cp <ai-todo>/src/client/entities/UserRole.ts         src/client/entities/
cp <ai-todo>/src/client/entities/AuthUser.ts         src/client/entities/
cp <ai-todo>/src/client/App.css                     src/client/
```

**差し替え箇所:**
- `RoleProtectedRoute.tsx` の権限外リダイレクト先 `/todos` を新プロジェクトの適切なパスに差し替える
- `AppRoutes.tsx` の todos 固有ルート（`path="/todos"`・index の `<Navigate to="/todos" />`）を新プロジェクトのトップページ構成に差し替える
- `Header.tsx` のブランドタイトル文字列 `"Todos"` とロゴリンク先 `todosHref` を新プロジェクトの値に差し替える
- `UserRole.ts` の role 種別を新プロジェクトの定義に合わせる

### Step 5 — `.claude/` をコピー

```bash
cp <ai-todo>/.claude/rules/     .claude/rules/ -r
cp <ai-todo>/.claude/skills/    .claude/skills/ -r
cp <ai-todo>/.claude/steering/security_tasks/ .claude/steering/security_tasks/ -r
cp <ai-todo>/.claude/docs/features/user-management/ .claude/docs/features/user-management/ -r
cp <ai-todo>/.claude/docs/migrations/user-management-design_1.md .claude/docs/migrations/
cp <ai-todo>/.claude/docs/features/layout/ .claude/docs/features/layout/ -r
```

`CLAUDE.md` はテンプレートとして新プロジェクト向けに書き直す（下記参照）。

### Step 6 — Supabase セットアップ

```bash
supabase init
supabase link --project-ref <new-project-ref>
```

`profiles` テーブル本体を作成するマイグレーションは ai-todo リポジトリの `supabase/migrations/` に存在しない（プロジェクト初期に手動作成されたため）。そのため新プロジェクトでは `profiles` テーブルと RLS ポリシーの初期マイグレーションを最低限自作する必要がある（`supabase-db-rules.md` 参照）。

`profiles`/`event_logs` テーブル本体を作成した後、以下の5本（profiles/event_logs 専用の権限・RLS・監査ログ修正）はそのまま流用できる:

```bash
cp <ai-todo>/supabase/migrations/20260527000000_grant_profiles_crud_and_protect_email.sql supabase/migrations/
cp <ai-todo>/supabase/migrations/20260527000001_add_event_logs.sql                        supabase/migrations/
cp <ai-todo>/supabase/migrations/20260621000000_fix_manager_update_staff_policy.sql       supabase/migrations/
cp <ai-todo>/supabase/migrations/20260625000000_role_update_boundary_and_audit.sql        supabase/migrations/
cp <ai-todo>/supabase/migrations/20260625000001_fix_profiles_update_grant_to_column_level.sql supabase/migrations/
```

これらは `profiles`/`event_logs` テーブルが存在すること前提の権限・RLS 変更なので、テーブル本体を作成するマイグレーションより後の連番で配置すること。

**初期 admin の作成:**

`profiles` テーブルは新規登録時 `role` が `temporary` になり、role 昇格 API（`updateUser.ts`）は `requireRole(["admin","manager"])` を要求するため、admin が1人も存在しない新規プロジェクトでは最初の admin をアプリ内フローで作成できない。

初回サインアップ後、Supabase ダッシュボード（Table Editor もしくは SQL Editor）で対象ユーザーの `profiles.role` を直接 `admin` に書き換える。以降の admin 追加・role 変更は通常の役割変更 API 経由でよい。

### Step 7 — 環境変数を設定

`.dev.vars`（CFW 開発用）と Vercel の環境変数に以下を設定する:

```
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # CFW 側のみ（Vercel には渡さない）
```

クライアント側:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_API_BASE_URL=            # CFW Worker の URL
```

### Step 8 — CLAUDE.md を新プロジェクト向けに書き直す

以下のセクションを新プロジェクトの実態に合わせて更新する:

- プロジェクト構成（スタック・ディレクトリ構成）
- 使用するスラッシュコマンド（変更があれば）
- todos 固有の参照（supabase-db-rules・tanstack-query-rules 等はそのまま有効）

### Step 9 — 動作確認チェックリスト

```
□ pnpm install が通る
□ wrangler dev でサーバーが起動する
□ 未認証リクエストが 401 になる
□ anon トークンが 401 になる
□ 有効ユーザートークンで 200 が返る
□ 権限外ロールが 403 になる
□ 初回 admin を Supabase ダッシュボードで手動作成済み
□ CORS: 許可オリジンからのプリフライトが 204 になる
□ CORS: 非許可オリジンが弾かれる
□ Vercel にデプロイしてセキュリティヘッダーが付いていることを確認
```

---

## 実行タイミングの前提条件

このスキルを実行する前に以下が完了していること:

- [ ] `security_tasks/` の P1 タスク（analyze バリデーション・CSP）が完了済み
- [ ] `security_tasks/` の P2 タスク（apiFetch 401・JWKS TTL）が完了済み
- [ ] Server / Client スコアが目標ライン（目安: 各 90/100 以上）に達している

---

## 参照

- セキュリティ改善タスク: [../steering/security_tasks/README.md](../steering/security_tasks/README.md)
- DB スキーマ変更手順: [../docs/rules/supabase-db-rules.md](../docs/rules/supabase-db-rules.md)
- ドキュメント作成ガイド: [../rules/documentation-guide.md](../rules/documentation-guide.md)
