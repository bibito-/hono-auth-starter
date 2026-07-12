# 認証・アクセス制御強化ロードマップ v2（完了アーカイブ）

> 本ドキュメントは切り出し元プロジェクト（ai-todo）における実装履歴・設計判断の移植版。`TodoAgent`・`todos` テーブル等 ai-todo 固有のコンポーネント・PR・マイグレーションファイルは本リポジトリには存在しない。認証アーキテクチャ全体（Bearer/Cookie 選定・フェーズ順序の根拠）の設計判断の参考情報として保持している。

作成: 2026-06-21  
昇格: 2026-06-26（`specs/` から `docs/features/auth/` へ。全フェーズ実装完了に伴いアーカイブ）  
ステータス: **完了**（Phase 0〜6 すべて実装・各 Phase doc へ昇格済み）  
前バージョン: `auth-hardening-roadmap.md`

> 本ファイルは横断的な設計根拠（セキュリティスコア・アーキ決定・フェーズ順序の理由）を残すための**完了アーカイブ**。各フェーズの実装詳細は下表の Phase doc が正典。以降この計画書は凍結し、改訂しない。

## 実装状況（昇格時点、ai-todo における状況）

| Phase | 内容 | 状態 | 正典 doc（ai-todo 内のパス） |
|---|---|---|---|
| 0 | CI/CD 基盤 | ✅ 完了 | （インフラ・GitHub Actions） |
| 1 | Hono JWT 検証ミドルウェア | ✅ 完了 | `docs/features/auth/jwt-auth-middleware-doc-01.md`（本リポジトリにも移植済み） |
| 2 | RLS 整備 + DB 型強化（tag CHECK） | ✅ 完了 | `migrations/tag-constraint-and-rls-doc-01.md`（ai-todo 固有・未移植） |
| 3 | サーバーサイド RBAC（role 変更 Hono 移行） | ✅ 完了 | `docs/features/user-management/role-change-hono-migration-doc-01.md`（本リポジトリにも移植済み） |
| 4 | TodoAgent スコープ最小化／未分類タグ手動付与 | ✅ 完了 | `docs/features/todos/ai-todo-agent-doc-01.md`（ai-todo 固有・未移植） |
| 5 | Vercel 移行 + CORS | ✅ 完了 | `docs/tech-spec/vercel-migration-doc-01.md`（ai-todo 固有・未移植） |
| 6 | レート制限 | ✅ 完了 | `docs/features/rate-limiting/rate-limiting-doc-01.md`（本リポジトリにも移植済み） |

**意図的に先送り（本ロードマップ外の別タスク・steering で追跡）:**
- Phase 3 の `fetchUsers`（ユーザー一覧取得）の Hono 化 — read-only・RLS で admin/manager 限定済みのため必要時に別タスク。
- レート制限の永続フィードバック UX（account-scope の「消えない通知」）— 別 spec へ切り出し。

---

## 背景

現状の認証・アクセス制御は「クライアントが正しく動けば安全」という前提に依存している。  
Hono API に認証がなく、`userId` をリクエストボディから信頼している。  
バックエンド（CFW）に集中し、フロント（Vercel）が分離されても「データは漏れない」を API と RLS で保証する API を作ることが目標。

---

## アーキテクチャ方針（確定）

| 項目 | 決定内容 |
|---|---|
| バックエンド | Cloudflare Workers（Hono）に集約。Vercel はフロントのみ |
| フロント分離 | セキュリティ硬化完了後に Vercel 移行（Phase 5）。CORS はその時点で追加 |
| SSR 移行 | Phase 5（Vercel SPA 移行）完了後に検討。UX 改善でありセキュリティ要件ではない |
| JWT 署名方式 | ES256（楕円曲線暗号）。JWKS エンドポイントで公開鍵をローカル検証 |
| SUPABASE_JWT_SECRET | 不要。非対称鍵（ES256）のため共有秘密鍵が存在しない |
| SUPABASE_SERVICE_ROLE_KEY | CFW（Hono/Agents）が保管。Vercel には渡さない |
| RBAC | Phase 3 まで先送り。Phase 1 は userId 確認のみ |
| レート制限 | Phase 6 で検討（認証が入ってから意味をなす） |

---

## ロードマップ

### Phase 0: CI/CD 基盤 ✅ 完了（2026-06-20）

- GitHub リポジトリ作成・push
- GitHub Actions ワークフロー（main push → `pnpm run deploy`）
- `CLOUDFLARE_API_TOKEN` を GitHub Secrets に登録

---

### Phase 1: Hono JWT 検証ミドルウェア

**ゴール:** `/api/todos/analyze` に認証を入れ、`userId` を JWT の `sub` から取得する。

#### 実装内容

**1. JWKS キャッシュ付き JWT 検証ミドルウェア**

`src/server/middleware/auth.ts` を新規作成。

- JWKS エンドポイント（`SUPABASE_URL + /auth/v1/.well-known/jwks.json`）から公開鍵を取得
- 公開鍵をモジュール変数にキャッシュ（Worker インスタンス起動時に1回のみフェッチ）
- `hono/jwt` の `verify()` で ES256 署名を検証
- 検証後に以下のクレームを明示チェック：
  - `aud === "authenticated"` — anon/service_role トークンを弾く
  - `role === "authenticated"` — 誤ったトークン種別を弾く
  - `exp` は `verify()` が自動検証。clock skew（エッジ時刻とSupabase間のずれ）による誤判定に注意
- `c.set("user", { id: payload.sub })` で後続ハンドラーに渡す
- 型は `src/shared/types/hono.ts` に1箇所定義（Phase 3 で `role` を追加できる構造にしておく）

**2. `src/server.ts` の修正**

- `/api/*` に authMiddleware を適用
- `/api/todos/analyze` でボディの `userId` を無視し `c.get("user").id` を使用
- `idFromName(userId)` も同じ JWT 由来の userId に統一（ボディ由来のままだと Agent インスタンスが別人で起動するズレが起きる）

**3. クライアント側 `apiFetch` ユーティリティ**

`src/client/lib/apiFetch.ts` を新規作成。

- `fetch` 直前に `supabase.auth.getSession()` でトークンを都度取得（期限切れ直前の自動 refresh 対応）
- `Authorization: Bearer <token>` ヘッダーを自動付与
- 将来の Hono API 呼び出しはすべてここを経由する

**4. `useUpdateTodoTag.ts` の修正**

- 直接 `fetch` → `apiFetch` に切り替え

#### 追加しないもの（Phase 1 スコープ外）

- CORS（Vercel 移行時の Phase 5 で追加）
- RBAC / role チェック（Phase 3）
- レート制限（Phase 6）

#### 必要な Workers Secrets の変更

- 追加なし（JWKS は公開エンドポイント、既存の `SUPABASE_URL` を流用）

---

### Phase 2: RLS 整備 + DB 型強化

**ゴール:** DB 層で「データは漏れない」を保証する。

#### 現状の RLS 評価（Phase 2 着手前の状態、ai-todo における todos テーブルの例）

| テーブル | 状態 | Phase 2 でやること |
|---|---|---|
| todos（SELECT/INSERT/UPDATE/DELETE） | ✅ 全ポリシー実装済み・機能している | 確認のみ（変更不要） |
| profiles（SELECT） | ✅ admin/manager は全件、他は自分のみ | 確認のみ |
| profiles（INSERT） | ✅ `auth.uid() = id` | 確認のみ |
| profiles（UPDATE） | ✅ manager_update_staff バグ修正済み | 確認のみ |
| profiles（DELETE） | ✅ admin のみ | 確認のみ |
| event_logs（SELECT） | ✅ admin のみ | 確認のみ |
| todos.tag | ⚠️ `text` 型で CHECK 制約なし | **型制約を追加** |

#### 実装内容

1. **`todos.tag` の型制約追加**（ai-todo 固有。本リポジトリで同種の制約が必要な列がある場合の参考パターン）
   - `text` 型に CHECK 制約を追加（`TodoTag` 列挙値のみ許可）
   - またはPostgreSQL `enum` 型に変更
   - クライアント側バリデーションに頼らず DB 側でも整合性を担保する

2. **全テーブルの RLS ポリシーを再検証**
   - 上記の「確認のみ」項目も通して動作確認を行う
   - 問題があれば修正マイグレーションを追加

---

### Phase 3: サーバーサイド RBAC

**ゴール:** Hono の保護エンドポイントでロール検証を行う。

#### 実装内容

1. **role 取得戦略: profiles テーブル参照**
   - JWT 検証後に `profiles.role` を DB から取得
   - JWT カスタムクレームには role を含めない（role 変更の即時反映を優先）
   - `c.set("user", { id, role })` に拡張（Phase 1 の型定義への追記のみで済む）

2. **管理系エンドポイントへの適用**
   - admin/manager のみアクセス可能なエンドポイントにロールミドルウェアを追加

3. **クライアントの `RoleProtectedRoute` はそのまま残す**
   - UX 補助として有効。セキュリティは API 側で担保する

---

### Phase 4: TodoAgent のスコープ最小化（ai-todo 固有。本リポジトリに `TodoAgent` は存在しない）

**ゴール:** 「API 層で userId を保証してから Agent に委譲する」原則を徹底し、`SUPABASE_SERVICE_ROLE_KEY` の使用範囲を最小化する。削除ではなく最小化。

#### 設計原則

- **API 層（Hono）が userId を検証・固定してから Agent に渡す**。Agent は Hono を信頼する内部コンポーネントとして扱う
- ユーザー本人のデータしか触らない操作は **user JWT + publishable key** で RLS に委ねる
- admin 系・バッチ系など RLS をバイパスすべき操作は引き続き service_role を使用

#### 実装内容

1. **`enrich()` の認証方式変更**
   - Hono が JWT トークン（文字列）を `enrich(todoId, title, userId, token)` に渡す
   - TodoAgent 側で `createClient(url, publishableKey, { headers: { Authorization: \`Bearer \${token}\` } })` を使用
   - RLS が `user_id = auth.uid()` で自動スコープ → `.eq("user_id", userId)` の明示指定が不要になる

2. **`enrich()` 失敗のフィードバック改善**
   - 現状 `waitUntil` で非同期実行のため、失敗してもクライアントは 202 を受け取り済みで気づけない
   - Realtime 購読でタグ更新を検知する現行設計を活かし、一定時間後に更新がなければ UI でフォールバックを表示する等の対策を検討する

3. **将来の admin 系機能は CFW で service_role を保持して実装**
   - Vercel（フロント）には service_role を渡さない原則を維持

#### Workers Secrets（Phase 4 完了後の理想形）

| Secret | 用途 | 残存 |
|---|---|---|
| `SUPABASE_URL` | DB 接続・JWKS フェッチ | ✅ |
| `SUPABASE_PUBLISHABLE_KEY` | ユーザー JWT での DB アクセス | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | 将来の admin 系操作・バッチ・Webhook | ✅（最小化） |

---

### Phase 5: Vercel 移行 + CORS

**ゴール:** フロント（React SPA）を Vercel に移行し、CFW を純粋な API サーバーにする。

#### 実装内容

1. **`hono/cors` の追加**
   - `allowOrigins: ["https://<vercel-domain>"]` を確定した Vercel URL で設定
   - `/api/*` に適用
   - Vercel URL 確定後でないと正確な設定ができないため、このフェーズまで後回しにする

2. **静的アセット配信の削除**
   - `app.all("*", ASSETS.fetch)` を削除
   - `wrangler.jsonc` の `assets` バインディングを削除

3. **クライアント側の API URL 設定**
   - `apiFetch` のベース URL を環境変数で切り替え可能にする（ローカル開発 vs 本番）

4. **SSR 移行の検討**（このフェーズ完了後）
   - Vercel（SPA）移行が安定したタイミングで Next.js SSR への移行を検討
   - セキュリティ要件ではなく UX 改善として位置づける

---

### Phase 6: レート制限

**ゴール:** 認証済みユーザーの連打・濫用から AI 推論コストと DO 負荷を守る。

#### 実装内容（案）

- TodoAgent の SQLite ストレージでユーザーごとのリクエスト数をカウント（ai-todo 固有。本リポジトリでは対象コンポーネントを読み替えること）
- 一定時間内の上限を超えたら 429 を返す
- Phase 1 で認証が入ってから初めて「誰が叩いているか」を特定できるため、このフェーズまで先送りが妥当

---

## 決定済み事項の根拠

| 決定 | 根拠 |
|---|---|
| ES256/JWKS 採用 | JWKS エンドポイント（`/auth/v1/.well-known/jwks.json`）を実測し ES256 を確認 |
| SUPABASE_JWT_SECRET 不要 | 非対称鍵（ES256）のため共有秘密鍵が存在しない |
| aud + role クレームを明示検証 | `hono/jwt` の `verify()` は署名と `exp` のみ確認。anon/service_role トークンを弾くために必要 |
| JWKS をモジュール変数にキャッシュ | Worker 起動時1回のフェッチで済む。このアプリの規模で Cache API のコストをかける必要がない |
| CORS を Phase 5 まで後回し | 同一 Worker での SPA 配信中は不要。Vercel URL 確定後に正確な `allowOrigins` を設定する方が安全 |
| service_role は「最小化」（削除でない） | 将来の admin 系 API・バッチ処理・Webhook で CFW が service_role を使う用途が発生する |
| RBAC を Phase 3 まで先送り | 現状 RBAC が必要なエンドポイントが存在しない。Phase 1 の型定義（`c.set("user", ...)`）は Phase 3 で `role` を追加するだけで対応可能 |
| manager_update_staff バグを即修正 | 修正コストほぼゼロ。放置すると manager ロールの更新操作が一切機能しない状態が続く |
| apiFetch ユーティリティに集約 | 将来エンドポイントが増えるたびにトークン取得ロジックを書くのを防ぐ |
| レート制限を Phase 6 に先送り | 認証がない状態でのレート制限は「誰が叩いているか」を特定できず意味をなさない |
