# テンプレート切り出し手順

このプロジェクトから再利用可能な資産を抜き出し、新規プロジェクトの土台にする手順。

セキュリティ改善タスク（バリデーション・CSP・401ハンドリング・JWKS TTL 等）はすでにコードベースに組み込み済みのため、切り出し前の追加チェックは不要。

> **運用モデル（2段階）:** 本手順は ai-todo から `hono-auth-starter`（[bibito-/hono-auth-starter](https://github.com/bibito-/hono-auth-starter)、GitHub Template repository）を切り出した際に使ったものであり、以後の新規コンテンツプロジェクトは ai-todo に戻らず `hono-auth-starter` を直接テンプレートとして使う（`gh repo create <新規名> --template bibito-/hono-auth-starter --clone`）。本ドキュメントは ai-todo を起点とする切り出しの記録・および将来 ai-todo から再度切り出す必要が生じた場合の手順として保持する。

---

## 切り出す資産・除外する資産

### 持ち込む（コンテンツ非依存）

| 種別 | パス | 備考 |
|---|---|---|
| 認証 MW | `src/server/middleware/auth.ts` | JWKS / ES256 JWT 検証 |
| RBAC MW | `src/server/middleware/requireRole.ts` | role は新プロジェクトの定義に差し替え |
| ボディサイズ制限 MW | `src/server/middleware/bodySize.ts` | 汎用（64KB上限） |
| CORS | `src/server/cors.ts` | オリジン列挙のみ差し替え。本番オリジンは Vercel プロジェクト作成・初回デプロイで URL が確定してから追記すればよく、それまでは `// TODO` プレースホルダーのままで問題ない |
| レートリミッタ | `src/server/rate-limit/` | AI 呼び出しがある場合そのまま使える |
| 型定義 | `src/shared/types/hono.ts` | HonoVariables の雛形 |
| UserRole エンティティ（実体） | `src/shared/entities/UserRole.ts` | role の型定義そのもの。**role 種別と承認ワークフロー（例: 新規登録時 `temporary` → admin 承認）の有無は業務固有の決定なので、新プロジェクトの要件に合わせて再定義すること。** そのまま流用すると不要なワークフローが型・ハンドラ・UI・テスト・設計ドキュメントに横断的に残る |
| ユーザー管理 API | `src/server/handlers/listUsers.ts` / `deleteUser.ts` / `updateUser.ts` | profiles テーブル CRUD。role 種別は新プロジェクトに合わせる（`updateUser.ts` の `VALID_ROLES` も含む） |
| Hono エントリポイント | `src/server.ts` | users ルート（`/api/users` 一覧・PATCH・DELETE）配線済みの状態で持ち込む。追加 API は新プロジェクト側で足す |
| Supabase クライアント | `src/client/clients/supabaseClient.ts` | env var 名のみ確認 |
| Supabase 認証サービス | `src/client/services/SupabaseAuthService.ts` | onAuthStateChange デッドロック回避済み |
| Mock 認証サービス | `src/client/services/MockAuthService.ts` | 汎用（ローカル dev 用） |
| 認証コンテキスト | `src/client/contexts/Auth*.tsx` | AuthContext / AuthProvider / AuthErrorProvider |
| apiFetch | `src/client/lib/apiFetch.ts` | 401 ハンドリング改善後に持ち込む |
| 汎用ユーティリティ | `src/client/lib/utils.ts` | `cn` ヘルパー等。UI コンポーネントの依存先 |
| ProtectedRoute | `src/client/routes/ProtectedRoute.tsx` | loading ガード改善後に持ち込む |
| RoleProtectedRoute | `src/client/routes/RoleProtectedRoute.tsx` | 権限外リダイレクト先は `/`（トップ）に差し替える。コンテンツ固有のパスへのハードコードは残さない |
| ルーティング | `src/client/routes/AppRoutes.tsx` | todos 固有のルートは除いて持ち出す。index ルートは「コンテンツ差し込み口」プレースホルダー（下記 `ContentPage`/`ContentRepositoryContext` 参照）を指す |
| コンテンツ差し込み口 | `src/client/contexts/ContentRepositoryContext.tsx`（新規作成） | `TodosRepositoryContext` を汎用化したパターン。中身は空の型（`Record<string, never>` 等）で作り、実際のコンテンツ機能追加時に実 Repository interface へ差し替える |
| コンテンツプレースホルダー画面 | `src/client/components/pages/ContentPage.tsx`（新規作成） | index ルートの表示先。ログイン後の最小限の「ようこそ」表示のみ行い、`ContentRepositoryContext` を消費する配線例を兼ねる |
| アプリエントリポイント | `src/client/App.tsx` / `src/client/main.tsx` / `index.html` | 完全ないし ほぼ汎用。`main.tsx` は todos リポジトリ配線を除き `ContentRepositoryContext` の Provider 配線に差し替える。`index.html` は `<title>` のみ差し替え |
| 認証 UI | `src/client/components/features/auth/` | `LoginWithEmail`/`SignUp` とその子コンポーネント一式（`AuthTextField`/`EmailConfirmationNotice`/`login/*`/`signup/*`）。内部の `navigate("/todos", ...)` は `navigate("/", ...)` に差し替え |
| 認証関連エンティティ | `src/client/entities/{AuthErrors,SigninResult}.ts` | 認証 UI・サービスの依存先 |
| 404 ページ | `src/client/components/pages/NotFoundPage.tsx` | `Link to="/todos"` は `Link to="/"` に差し替え |
| ユーザー管理 UI | `src/client/components/pages/UserManagementPage.tsx` | role ラベル・カラーは新プロジェクトの role 種別に合わせる |
| ユーザー管理 hook | `src/client/hooks/useUserManagement.ts` | |
| Profile エンティティ | `src/client/entities/Profile.ts` | profiles テーブルの型 |
| UserRole エンティティ（再エクスポート） | `src/client/entities/UserRole.ts` | `src/shared/entities/UserRole.ts` の再エクスポート。実体は shared 側なのでそちらを編集する |
| AuthUser エンティティ | `src/client/entities/AuthUser.ts` | |
| トースト表示ヘルパー | `src/client/utils/toastHelpers.tsx` | UX フィードバック共通処理。todos 固有のヘルパー（`showConflictToast` 等）は未使用のまま残ってよい |
| UI コンポーネント | `src/client/components/ui/` | shadcn/ui 雛形一式。`button.tsx` の todos 固有 size variant（`add_todo` 等）は取り除く |
| デザイントークン | `src/client/App.css` | shadcn テーマ変数・ライト/ダークモード定義。汎用 |
| ヘッダー | `src/client/components/layout/Header.tsx` | ブランドタイトル文字列・変数名（`todosHref` 等）を新プロジェクトの値に差し替え |
| コンテンツナビ | `src/client/components/features/header/ContentNavigation.tsx` | `/users` リンクのみで todos 非依存、そのまま使える |
| profiles 関連マイグレーション | `supabase/migrations/` のうち profiles/event_logs 専用の分のみ | 詳細は Step 6 参照。todos 系マイグレーションと混在しているので取り違えに注意 |
| pnpm ビルドスクリプト許可 | `pnpm-workspace.yaml` | 無いと `esbuild`/`workerd`/`sharp` に加え `agents` SDK の間接依存（`@mongodb-js/zstd`/`core-js-pure`/`node-liblzma`）のネイティブビルドがブロックされる。詳細は `pnpm-setup.md` 参照 |
| `.claude/rules/` | 全ファイル | セキュリティ・認証・TanStack Query・UI 規約 |
| `.claude/skills/` | 全ファイル（本ファイル含む） | スラッシュコマンド・手順書 |
| `.claude/agents/` | 全ファイル | 実装専任 agent 定義。各ファイル内の `リポジトリ: /workspaces/cloudflare-actions/<元プロジェクト名>` という絶対パス行を新プロジェクトのパスに置換すること |
| `.claude/settings.json` | | permissions・hooks 定義。`rm -rf` ガードフックに旧プロジェクトの絶対パスがハードコードされている場合は新プロジェクトのパスに置換する。可能なら `process.env.CLAUDE_PROJECT_DIR` を使った動的解決に書き換え、以後のプロジェクトでこの置換作業自体を不要にすることを推奨する |
| `.claude/docs/rules/` | 全ファイル | React・Supabase 認証/DB・TanStack Query・UI・UX・テスト・ローカル開発の規約一式 |
| `.claude/docs/features/user-management/` | 全ファイル | user-management 実装仕様一式。**旧プロジェクト固有の PR 番号・マイグレーションファイル名を含む「完了済み実装記録」がそのまま持ち込まれるため、各ファイル冒頭に「本ドキュメントは切り出し元プロジェクトにおける実装履歴であり、本リポジトリには該当 PR・マイグレーションファイルは存在しない」旨の一文を追加すること** |
| `.claude/docs/features/rate-limiting/` | 全ファイル | レートリミッタの設計判断 |
| `.claude/docs/migrations/user-management-design_1.md` | | profiles テーブルの設計根拠 |
| `.claude/docs/features/layout/` | 全ファイル | デザイントークン・ヘッダーの設計判断（app-color-scheme-doc-01/02・header-color-scheme-doc-01・header-restyle-doc-01） |
| `CLAUDE.md` | ルート | プロジェクト固有部分は書き直す。README.md と内容が乖離しないよう、初期セットアップ手順は両ファイルで同じ順序・同じ内容にする |

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
| `supabase/migrations/`（todos 関連のみ） | todos スキーマ変更分（`add_sort_order`/`add_deadline_at`/`sort_key` 系/`enable_realtime_for_todos`/`todos_replica_identity_full`/`add_tag_check_constraint_to_todos`/`initial_schema` 等）。profiles/event_logs 専用分は持ち込む対象（上表参照） |
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
# このプロジェクトから package.json / pnpm-lock.yaml / tsconfig / wrangler.jsonc をコピー
cp <ai-todo>/package.json .
cp <ai-todo>/pnpm-lock.yaml .
cp <ai-todo>/tsconfig*.json .
cp <ai-todo>/wrangler.jsonc .
cp <ai-todo>/vite.config.ts .
cp <ai-todo>/postcss.config.js .
cp <ai-todo>/tailwind.config.js .
cp <ai-todo>/pnpm-workspace.yaml .
```

`package.json` の `name`・`description`・`scripts.deploy` 内の `dist/<name>/wrangler.json` パス（`name` をハイフン→アンダースコア変換した文字列）を新プロジェクト名に変更する。
`wrangler.jsonc` の `name` と `compatibility_date` を確認・更新する。
`wrangler.jsonc` 冒頭に「本番デプロイは必ず `pnpm run deploy` を使うこと。ルートの `wrangler.jsonc` に対して直接 `wrangler deploy` を実行しないこと（`assets.directory` 未設定で失敗する）」という一文をコメントで残しておくと安全。

**既知の warning（対応不要）:** `pnpm run deploy` 実行時に `--minify と --no-bundle` 併用不可・`run_worker_first=true set without an assets binding` の2件の warning が出るが、これは `@cloudflare/vite-plugin` の仕様上の既知事項で対応不要。`wrangler.jsonc`/`vite.config.ts`/`deploy` スクリプトを変更して消そうとすると、Worker が意図せず SPA を配信してしまう regression を招くので触らないこと。

### Step 3 — サーバー基盤をコピー

```bash
mkdir -p src/server/middleware src/server/rate-limit src/server/handlers src/shared/types src/shared/entities

cp <ai-todo>/src/server/middleware/auth.ts       src/server/middleware/
cp <ai-todo>/src/server/middleware/requireRole.ts src/server/middleware/
cp <ai-todo>/src/server/middleware/bodySize.ts   src/server/middleware/
cp <ai-todo>/src/server/cors.ts                  src/server/
cp <ai-todo>/src/server/rate-limit/              src/server/rate-limit/ -r
cp <ai-todo>/src/shared/types/hono.ts            src/shared/types/
cp <ai-todo>/src/shared/entities/UserRole.ts     src/shared/entities/
cp <ai-todo>/src/server/handlers/listUsers.ts    src/server/handlers/
cp <ai-todo>/src/server/handlers/deleteUser.ts   src/server/handlers/
cp <ai-todo>/src/server/handlers/updateUser.ts   src/server/handlers/
cp <ai-todo>/src/server.ts                       src/
```

**差し替え箇所:**
- `src/server/cors.ts` の `ALLOWED_ORIGINS` は本番オリジン確定後（Step 7 の Vercel プロジェクト作成後）に更新すればよい。それまでは `// TODO` プレースホルダーのままでよい
- `src/shared/entities/UserRole.ts` の role 種別・承認ワークフローの有無を新プロジェクトの業務要件に合わせて再定義する
- `src/shared/types/hono.ts` の `HonoVariables` の `role` 型を新 UserRole に合わせる
- `requireRole.ts` / `updateUser.ts` の `VALID_ROLES` を新プロジェクトの role 定義に合わせる
- `src/server.ts` は users ルート配線済みの状態で持ち込み、新規 API はここに追加していく

### Step 4 — クライアント認証基盤をコピー

```bash
mkdir -p src/client/{clients,services,contexts,routes,lib,entities,hooks,utils}
mkdir -p src/client/components/{ui,pages,layout}
mkdir -p src/client/components/features/{auth,header}

cp <ai-todo>/src/client/clients/supabaseClient.ts    src/client/clients/
cp <ai-todo>/src/client/services/SupabaseAuthService.ts src/client/services/
cp <ai-todo>/src/client/services/AuthService.ts      src/client/services/
cp <ai-todo>/src/client/services/MockAuthService.ts  src/client/services/
cp <ai-todo>/src/client/contexts/Auth*.tsx           src/client/contexts/
cp <ai-todo>/src/client/lib/apiFetch.ts             src/client/lib/
cp <ai-todo>/src/client/lib/utils.ts                src/client/lib/
cp <ai-todo>/src/client/routes/ProtectedRoute.tsx    src/client/routes/
cp <ai-todo>/src/client/routes/RoleProtectedRoute.tsx src/client/routes/
cp <ai-todo>/src/client/routes/AppRoutes.tsx         src/client/routes/
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
cp <ai-todo>/src/client/entities/AuthErrors.ts       src/client/entities/
cp <ai-todo>/src/client/entities/SigninResult.ts     src/client/entities/
cp <ai-todo>/src/client/utils/toastHelpers.tsx       src/client/utils/
cp <ai-todo>/src/client/App.css                     src/client/
cp <ai-todo>/src/client/App.tsx                     src/client/
cp <ai-todo>/src/client/main.tsx                     src/client/
cp <ai-todo>/index.html                              .
```

**差し替え箇所:**
- `RoleProtectedRoute.tsx` の権限外リダイレクト先 `/todos` を `/` に差し替える
- `AppRoutes.tsx` の todos 固有ルート（`path="/todos"`・index の `<Navigate to="/todos" />`）を、`ContentRepositoryContext` を消費する `ContentPage`（新規作成）への index ルートに差し替える
- `src/client/contexts/ContentRepositoryContext.tsx` を新規作成する（空の `ContentRepository` 型 + `createContext`）。`src/client/components/pages/ContentPage.tsx` を新規作成し、`AuthContext`/`ContentRepositoryContext` を消費するプレースホルダー画面にする
- `main.tsx` の todos リポジトリ配線を除去し、`ContentRepositoryContext.Provider` の配線に差し替える。`ThemeProvider` の `storageKey` を新プロジェクト名に変更
- `Header.tsx` のブランドタイトル文字列と変数名（`todosHref` 等）を新プロジェクトの値に差し替える
- `LoginWithEmail.tsx` の `navigate("/todos", ...)` を `navigate("/", ...)` に差し替える
- `NotFoundPage.tsx` の `Link to="/todos"` を `Link to="/"` に差し替える
- `SupabaseAuthService.ts` の `emailRedirectTo` に含まれる `/todos` を除去する
- `button.tsx` 等 UI コンポーネントの todos 固有 size variant（`add_todo` 等）は削除する
- `index.html` の `<title>` を新プロジェクト名に変更する

### Step 5 — `.claude/` をコピー

```bash
cp <ai-todo>/.claude/rules/     .claude/rules/ -r
cp <ai-todo>/.claude/skills/    .claude/skills/ -r
cp <ai-todo>/.claude/agents/    .claude/agents/ -r
cp <ai-todo>/.claude/settings.json .claude/
cp <ai-todo>/.claude/docs/rules/ .claude/docs/rules/ -r
cp <ai-todo>/.claude/docs/features/user-management/ .claude/docs/features/user-management/ -r
cp <ai-todo>/.claude/docs/features/rate-limiting/ .claude/docs/features/rate-limiting/ -r
cp <ai-todo>/.claude/docs/migrations/user-management-design_1.md .claude/docs/migrations/
cp <ai-todo>/.claude/docs/features/layout/ .claude/docs/features/layout/ -r
```

**差し替え箇所:**
- `.claude/agents/*.md` 内の `リポジトリ: /workspaces/cloudflare-actions/<元プロジェクト名>` を新プロジェクトの絶対パスに置換する
- `.claude/settings.json` の hooks 内に旧プロジェクトの絶対パスが無いか `grep` で確認し、新プロジェクトのパスに置換する（理想は `process.env.CLAUDE_PROJECT_DIR` による動的解決に変更し、以後この置換自体を不要にすること）
- `.claude/docs/features/user-management/` 配下の各ファイル冒頭に「本ドキュメントは切り出し元プロジェクトにおける実装履歴であり、本リポジトリには該当 PR・マイグレーションファイルは存在しない。設計判断の参考情報として保持している」旨の一文を追加する

`CLAUDE.md` はテンプレートとして新プロジェクト向けに書き直す（下記参照）。

**kit 同期 workflow を設置する場合の注意:**

新プロジェクトに `.github/workflows/stack-kit-pull-check.yml`（hono-auth-starter との差分検知）をコピーするときは、workflow ファイルの配置だけでは動かない。**hono-auth-starter は PRIVATE のため、clone に fine-grained PAT が必要**。

1. fine-grained PAT を発行する。Resource owner = リポジトリのオーナー / Repository access = Only select repositories → `hono-auth-starter` / Repository permissions → Contents = Read-only（Account permissions 側ではない）
2. `gh secret set STACK_KIT_PAT --repo <owner>/<新プロジェクト>` で登録する（**ユーザー自身が実行する。Claude は実行しない**）
3. `gh workflow run stack-kit-pull-check.yml --repo <owner>/<新プロジェクト>` で疎通確認する

core を pull する `workflow-kit-pull-check.yml` のほうは、claude-workflow-kit が PUBLIC なので PAT 不要。

トークンの値は発行時にしか表示されない。値の一部でも会話・ログ・ファイルに貼ってしまった場合は失効させて再発行すること。

### Step 6 — Supabase セットアップ

```bash
supabase init
supabase link --project-ref <new-project-ref>
```

`supabase/.gitignore` を作成し `.branches`・`.temp` を追加する（`supabase link` 等で生成されるローカルキャッシュに接続情報が含まれるため、コミットしないよう最初に対応しておく）:

```
# supabase/.gitignore
.branches
.temp
```

`profiles` テーブル本体を作成するマイグレーションは ai-todo リポジトリの `supabase/migrations/` に存在しない（プロジェクト初期に手動作成されたため）。そのため新プロジェクトでは `profiles` テーブルと RLS ポリシーの初期マイグレーションを自作する必要がある（`supabase-db-rules.md` 参照）。role 種別を変更する場合はこの初期マイグレーションの CHECK 制約・RLS ポリシーも新しい role 定義に合わせて書く。

**profiles/event_logs 専用の権限・RLS・監査ログ修正について:** ai-todo の `supabase/migrations/` には以下5本が存在する。これらは ai-todo が過去に踏んだ不具合（RLS ポリシーの自己参照バグ・GRANT の fail-open 等）を段階的に修正した履歴そのものであり、**新規プロジェクトでそのまま5本を積み直すより、修正が全て反映された最終形を1本の初期マイグレーションとして書き起こす方が安全かつ簡潔（推奨）。** role モデル自体を変更する場合は `fix_manager_update_staff_policy`/`role_update_boundary_and_audit`/`fix_profiles_update_grant_to_column_level` が不要になることもある。過去の bugfix 履歴をそのまま参照したい場合のみ、以下を個別にコピーする:

```bash
cp <ai-todo>/supabase/migrations/20260527000000_grant_profiles_crud_and_protect_email.sql supabase/migrations/
cp <ai-todo>/supabase/migrations/20260527000001_add_event_logs.sql                        supabase/migrations/
cp <ai-todo>/supabase/migrations/20260621000000_fix_manager_update_staff_policy.sql       supabase/migrations/
cp <ai-todo>/supabase/migrations/20260625000000_role_update_boundary_and_audit.sql        supabase/migrations/
cp <ai-todo>/supabase/migrations/20260625000001_fix_profiles_update_grant_to_column_level.sql supabase/migrations/
```

これらは `profiles`/`event_logs` テーブルが存在すること前提の権限・RLS 変更なので、テーブル本体を作成するマイグレーションより後の連番で配置すること。

**初期 admin の作成:**

`profiles` テーブルは新規登録時 `role` が（role モデルに承認ゲートを残す場合）仮ロールになり、role 昇格 API（`updateUser.ts`）は `requireRole(["admin","manager"])` を要求するため、admin が1人も存在しない新規プロジェクトでは最初の admin をアプリ内フローで作成できない。

初回サインアップ後、Supabase ダッシュボード（Table Editor もしくは SQL Editor）で対象ユーザーの `profiles.role` を直接 `admin` に書き換える。以降の admin 追加・role 変更は通常の役割変更 API 経由でよい。

### Step 7 — Vercel プロジェクトを新規作成する

Vercel でプロジェクトを新規作成し、対象 GitHub リポジトリと連携する。Framework Preset は Vite 自動検出のまま、Build/Output Directory も上書き不要（`vite.config.ts` の `VERCEL=1` 分岐が Vercel の既定出力に合わせて設計されているため）。デプロイ完了後に確定した本番 URL を Step 3 の `src/server/cors.ts` の `ALLOWED_ORIGINS` に追記する。

### Step 8 — 環境変数を設定

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

本番 Cloudflare Worker には `.dev.vars` の値は反映されない。`wrangler secret put SUPABASE_URL` 等でユーザー自身が本番シークレットを別途登録する必要がある（未登録の場合、JWKS 取得に失敗し認証必須の全エンドポイントが 401 になる）。

### Step 9 — CLAUDE.md を新プロジェクト向けに書き直す

以下のセクションを新プロジェクトの実態に合わせて更新する:

- プロジェクト構成（スタック・ディレクトリ構成）
- 使用するスラッシュコマンド（変更があれば）
- 初期セットアップ手順は README.md と同じ順序・同じ内容にする（Vercel プロジェクト作成 → 環境変数設定 → cors.ts の本番オリジン追記 → 初期 admin 作成、の順）
- todos 固有の参照（supabase-db-rules・tanstack-query-rules 等はそのまま有効）

### Step 10 — 動作確認チェックリスト

```
□ pnpm install が通る（Ignored build scripts 警告が出ないこと）
□ wrangler dev でサーバーが起動する
□ 未認証リクエストが 401 になる
□ anon トークンが 401 になる
□ 有効ユーザートークンで 200 が返る
□ 権限外ロールが 403 になる
□ 初回 admin を Supabase ダッシュボードで手動作成済み
□ CORS: 許可オリジンからのプリフライトが 204 になる
□ CORS: 非許可オリジンが弾かれる
□ Vercel にデプロイしてセキュリティヘッダーが付いていることを確認
□ 本番 Cloudflare Worker に `wrangler secret put` でシークレットを登録済み
□ README.md 自身のブランド名（見出し・本文中の自己言及）を新プロジェクト名に置き換え済み
```

---

## 参照

- DB スキーマ変更手順: [../docs/rules/supabase-db-rules.md](../docs/rules/supabase-db-rules.md)
- ドキュメント作成ガイド: [../rules/documentation-guide.md](../rules/documentation-guide.md)
