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
- **この README.md 自身の見出し・本文中の自己言及**

### 2. Supabase プロジェクトを新規作成する

1. Supabase ダッシュボードで新規プロジェクトを作成
2. `profiles` テーブルと RLS ポリシーを作成するマイグレーションを新規作成する（このテンプレートには `profiles` テーブル本体を作る migration が含まれていない。設計根拠は [.claude/docs/migrations/user-management-design_1.md](.claude/docs/migrations/user-management-design_1.md) 参照。role 種別・承認ワークフローの有無は業務要件に合わせて再定義すること）
3. `profiles`/`event_logs` テーブル作成後の権限・RLS・監査ログ設定は、[.claude/skills/extract-template.md](.claude/skills/extract-template.md) Step6 の内容を最終形として1本の初期マイグレーションに書き起こすことを推奨する（ai-todo の bugfix 履歴をそのまま5本積み直すより安全）

### 3. Vercel プロジェクトを新規作成する

Vercel でプロジェクトを新規作成し、対象 GitHub リポジトリと連携する。Framework Preset は Vite 自動検出のまま、Build/Output Directory も上書き不要（`vite.config.ts` の `VERCEL=1` 分岐が Vercel の既定出力に合わせて設計されているため）。

### 4. 環境変数を設定する

`.dev.vars`（Cloudflare Workers ローカル開発用）:
```
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

クライアント側（Vite、Vercel 環境変数）:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_API_BASE_URL=
```

本番 Cloudflare Worker には `.dev.vars` の値は反映されない。`wrangler secret put SUPABASE_URL` 等でユーザー自身が本番シークレットを別途登録する必要がある（未登録の場合、JWKS 取得に失敗し認証必須の全エンドポイントが 401 になる）。シークレットの登録操作自体は各サービスのダッシュボード/CLIで行うこと。

### 5. `src/server/cors.ts` を差し替える

`ALLOWED_ORIGINS` が `// TODO` のプレースホルダーになっているので、Step 3 で確定した本番オリジンに差し替える。

### 6. コンテンツ機能を実装する

- `src/client/contexts/ContentRepositoryContext.tsx` の `ContentRepository` 型を実際の Repository interface に差し替える
- `src/client/components/pages/ContentPage.tsx` を実際のコンテンツ表示に置き換える
- 必要なサーバー API ハンドラー・ルートを `src/server.ts` に追加する

### 7. 最初の admin ユーザーを作成する

サインアップ後、Supabase ダッシュボード（Table Editor もしくは SQL Editor）で対象ユーザーの `profiles.role` を直接 `admin` に書き換える。role 昇格 API は既存の admin/manager が必要なため、最初の1人だけは手動作成が必要。

### 8. 動作確認

```
□ pnpm install が通る（Ignored build scripts 警告が出ないこと）
□ wrangler dev でサーバーが起動する
□ 未認証リクエストが 401 になる
□ 有効ユーザートークンで 200 が返る
□ 権限外ロールが 403 になる
□ CORS: 許可オリジンからのプリフライトが 204 になる
□ 本番 Cloudflare Worker に `wrangler secret put` でシークレットを登録済み
□ user_id 等の機微な値をインスタンス名に使う Agent（Durable Object）クラスがある場合、`static options = { sendIdentityOnConnect: false }` を設定済み
```

**Durable Object の instance name 露出に関する注意:** Cloudflare Agents SDK（`agents` パッケージ）の `Agent` クラスは既定で `sendIdentityOnConnect: true` であり、`idFromName`/`getAgentByName` に渡したインスタンス名をクライアント接続時に自動送信する（`cf_agent_identity`）。`user_id` 等の機微な値をインスタンス名に使うクラスを追加した場合は、本番デプロイ前に `static options = { sendIdentityOnConnect: false }` を追加すること。

**既知の deploy warning（対応不要）:** `pnpm run deploy` 実行時に `--minify と --no-bundle` 併用不可・`run_worker_first=true set without an assets binding` の2件の warning が出るが、`@cloudflare/vite-plugin` の仕様上の既知事項で対応不要。設定ファイルを変更して消そうとすると、Worker が意図せず SPA を配信してしまう regression を招くので触らないこと。

## ローカル開発

```
pnpm install
pnpm dev:cfw   # Cloudflare Workers (API) を5173番で起動
pnpm dev:spa   # Vercel向けSPAビルド確認を5174番で起動
pnpm test      # vitest
```

**devcontainer:** 本テンプレートは devcontainer 設定を含まない。ai-todo 由来の開発環境は兄弟プロジェクトを束ねる親ディレクトリの共有 devcontainer（SSH鍵の bind mount に `${localEnv:USERPROFILE}` を使用）に依拠しており、これは Windows/WSL 前提で macOS では動作しない。macOS で単体プロジェクトとして開発する場合は、`${localEnv:HOME}` ベースの `.devcontainer/` を別途用意すること。

## 参照

- [CLAUDE.md](CLAUDE.md) — Claude Code 向けのプロジェクトルール
- [.claude/skills/extract-template.md](.claude/skills/extract-template.md) — このテンプレートを ai-todo から切り出した際の手順書（何を持ち込み・何を除外したかの記録）
- [.claude/docs/](.claude/docs/) — 認証・ユーザー管理・レートリミッタ・デザインの設計判断アーカイブ
