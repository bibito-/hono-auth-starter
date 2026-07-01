# hono-auth-starter

Hono + Cloudflare Workers + Supabase Auth のスターターテンプレート。認証（メール/パスワード）・RBAC（admin/manager/staff/temporary）・ユーザー管理画面・レートリミッタ・デザインシステム（shadcn/ui）を備える。

コンテンツ機能（ドメインロジック）は含まれていない。実際のアプリはこのテンプレートを土台に、コンテンツ機能だけを追加して作る。

## 含まれるもの

- 認証: ログイン/サインアップ（`src/client/components/features/auth/`）、Supabase セッション管理（`SupabaseAuthService`・`AuthContext`）
- RBAC: `requireRole` ミドルウェア（server）・`RoleProtectedRoute`（client）
- ユーザー管理: 一覧・role変更・削除画面（`UserManagementPage`）と対応API（`/api/users`）
- レートリミッタ: Durable Object ベース（`RateLimiter`）
- デザインシステム: shadcn/ui 一式・ライト/ダークモード対応トークン（`App.css`）
- コンテンツ差し込み口: `ContentRepositoryContext`（中身は空。実装時にここへ Repository interface を差し替える）・`ContentPage`（プレースホルダー画面）

## 含まれないもの

- コンテンツ機能そのもの（一覧表示・作成・編集などのドメインロジック）
- `profiles` テーブル本体を作成するマイグレーション（後述）

## 新規プロジェクトとして使い始める手順

### 1. プロジェクト名を変更する

- `package.json` の `name`・`scripts.deploy` の `dist/hono_auth_starter/` パス
- `wrangler.jsonc` の `name`
- `index.html` の `<title>`
- `src/client/main.tsx` の `ThemeProvider` `storageKey`
- `src/client/components/layout/Header.tsx` のブランドタイトル文字列（`"hono-auth-starter"`）

### 2. Supabase プロジェクトを新規作成する

1. Supabase ダッシュボードで新規プロジェクトを作成
2. `profiles` テーブルと RLS ポリシーを作成するマイグレーションを新規作成する（このテンプレートには `profiles` テーブル本体を作る migration が含まれていない。設計根拠は [.claude/docs/migrations/user-management-design_1.md](.claude/docs/migrations/user-management-design_1.md) 参照）
3. `profiles`/`event_logs` テーブル作成後、以下5本の migration をそのまま流用できる（[.claude/skills/extract-template.md](.claude/skills/extract-template.md) Step6 参照）:
   - `grant_profiles_crud_and_protect_email`
   - `add_event_logs`
   - `fix_manager_update_staff_policy`
   - `role_update_boundary_and_audit`
   - `fix_profiles_update_grant_to_column_level`

### 3. 環境変数を設定する

`.dev.vars`（Cloudflare Workers ローカル開発用）:
```
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

クライアント側（Vite）:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_API_BASE_URL=
```

本番（Vercel・Cloudflare Workers）にも同様の値を登録する。シークレットの登録操作自体は各サービスのダッシュボード/CLIで行うこと。

### 4. `src/server/cors.ts` を差し替える

`ALLOWED_ORIGINS` が `// TODO` のプレースホルダーになっているので、実際の本番オリジンに差し替える。

### 5. コンテンツ機能を実装する

- `src/client/contexts/ContentRepositoryContext.tsx` の `ContentRepository` 型を実際の Repository interface に差し替える
- `src/client/components/pages/ContentPage.tsx` を実際のコンテンツ表示に置き換える
- 必要なサーバー API ハンドラー・ルートを `src/server.ts` に追加する

### 6. 最初の admin ユーザーを作成する

サインアップ後、Supabase ダッシュボード（Table Editor もしくは SQL Editor）で対象ユーザーの `profiles.role` を直接 `admin` に書き換える。role 昇格 API は既存の admin/manager が必要なため、最初の1人だけは手動作成が必要。

### 7. 動作確認

```
□ pnpm install が通る
□ wrangler dev でサーバーが起動する
□ 未認証リクエストが 401 になる
□ 有効ユーザートークンで 200 が返る
□ 権限外ロールが 403 になる
□ CORS: 許可オリジンからのプリフライトが 204 になる
```

## ローカル開発

```
pnpm install
pnpm dev:cfw   # Cloudflare Workers (API) を5173番で起動
pnpm dev:spa   # Vercel向けSPAビルド確認を5174番で起動
pnpm test      # vitest
```

## 参照

- [CLAUDE.md](CLAUDE.md) — Claude Code 向けのプロジェクトルール
- [.claude/skills/extract-template.md](.claude/skills/extract-template.md) — このテンプレートを ai-todo から切り出した際の手順書（何を持ち込み・何を除外したかの記録）
- [.claude/docs/](.claude/docs/) — 認証・ユーザー管理・レートリミッタ・デザインの設計判断アーカイブ
