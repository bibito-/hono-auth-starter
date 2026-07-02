# Hono JWT 検証ミドルウェア（Phase 1）実装仕様書

> 本ドキュメントは切り出し元プロジェクト（ai-todo）における実装履歴・設計判断の移植版。本リポジトリには該当する PR 番号は存在しない。認証アーキテクチャ（JWT検証・JWKS キャッシュ・Bearer/Cookie 選定）の設計判断の参考情報として保持している。

最終更新: 2026-06-22  
ステータス: 完了

## 概要

`/api/*`（現状 `/api/todos/analyze`）に ES256 / JWKS ベースの JWT 認証ミドルウェアを導入し、`userId` をリクエストボディではなく検証済み JWT の `sub` から取得する。クライアントは `apiFetch` で `Authorization: Bearer` を自動付与する。

これは `docs/features/auth/auth-hardening-roadmap-doc-01.md` の Phase 1 にあたる。Phase 2 以降は同ロードマップ（完了アーカイブ）を参照。

## 設計方針

| 項目 | 決定内容 | 理由 |
|---|---|---|
| 署名方式 | ES256（ECC P-256）。JWKS で公開鍵をローカル検証 | Supabase の JWKS を実測し ES256 を確認。共有秘密鍵が不要 |
| JWKS キャッシュ | モジュール変数 `cachedKeys` に保持し初回フェッチ1回のみ | Worker 規模的に Cache API のコストは不要 |
| クレーム検証 | `aud === "authenticated"` かつ `role === "authenticated"`、`sub` が string | `verify()` は署名と `exp` のみ確認。anon / service_role トークンを弾く |
| 署名・exp 検証 | `hono/jwt` の `verify(token, jwk, "ES256")` に委譲 | exp は verify が自動検証（期限切れは throw） |
| user の受け渡し | `c.set("user", { id: sub })` | 型は `src/shared/types/hono.ts` に集約。Phase 3 で `role` 追加のみで拡張可 |
| クライアント | `apiFetch` に集約し fetch 直前に `getSession()` | 期限切れ間際の自動 refresh 対応・トークン取得の重複を防ぐ |

## 実装ステップ

### Step 1 — Variables 型定義
対象: `src/shared/types/hono.ts`（新規）
- `AuthenticatedUser = { id: string }` と `HonoVariables = { user: AuthenticatedUser }` を定義

### Step 2 — 認証ミドルウェア
対象: `src/server/middleware/auth.ts`（新規）
- `getJwks()`: `SUPABASE_URL + /auth/v1/.well-known/jwks.json` をフェッチし `cachedKeys` にキャッシュ
- `__resetJwksCache()`: テスト用リセット
- `authMiddleware`: Bearer 抽出 → `decode` で kid 取得 → 一致する JWK（なければ先頭）→ `verify` → aud/role/sub チェック → `c.set("user", ...)`。失敗はすべて 401

### Step 3 — server.ts への適用
対象: `src/server.ts`
- `app.use("/api/*", authMiddleware)`
- `/api/todos/analyze` でボディの `userId` を廃止し `c.get("user").id` を使用
- `idFromName(userId)` も JWT 由来の userId に統一

### Step 4 — クライアント apiFetch
対象: `src/client/lib/apiFetch.ts`（新規）
- `getSession()` 後にセッションがあれば `Authorization: Bearer` を付与して `fetch`

### Step 5 — 呼び出し側の切り替え
対象: `src/client/hooks/useAddTodo.ts`
- `requestAiTagging` の `fetch` → `apiFetch`。ボディから `userId` を削除（サーバーが JWT 由来で取得）

> 注: ロードマップ v2・steering では切り替え対象を `useUpdateTodoTag.ts` と記載していたが、実際に `/api/todos/analyze` を呼ぶのは `useAddTodo.ts`（`requestAiTagging`）であり、こちらを修正した。

## テスト

| テストファイル | 主な検証 |
|---|---|
| `src/server/middleware/auth.test.ts` | 有効トークンで user.id=sub / ヘッダー無 401 / 非Bearer 401 / 署名不正 401 / aud不一致 401 / role不一致 401 / exp切れ 401 / JWKS キャッシュ（fetch 1回） |
| `src/client/lib/apiFetch.test.ts` | セッション有で Bearer 付与 / セッション無で付与なし / 既存ヘッダー保持 |

テストは ES256 鍵ペアを生成し、公開鍵 JWK を JWKS レスポンスとしてモック、秘密鍵で `hono/jwt` `sign` してトークンを生成する。

## 関連ファイル

```
src/
├── shared/types/hono.ts            # Variables 型
├── server/
│   ├── middleware/auth.ts          # 認証ミドルウェア
│   └── middleware/auth.test.ts
├── server.ts                       # /api/* に適用
└── client/
    ├── lib/apiFetch.ts             # Authorization 自動付与
    ├── lib/apiFetch.test.ts
    └── hooks/useAddTodo.ts         # fetch → apiFetch
```

## スコープ外（Phase 1 では実装しない）

- CORS（Phase 5）
- RBAC / role チェック（Phase 3）
- レート制限（Phase 6）

## 脅威モデルと防御の連鎖

### before / after

| | userId の出所 | 信頼性 |
|---|---|---|
| Before | リクエストボディの `userId` | 攻撃者が自由に書ける → 信頼できない（認証ゼロ） |
| After | 署名検証済み JWT の `sub` | 改ざんすると署名が壊れ 401 → 信頼できる |

### 防御の連鎖

```
署名（公開鍵で検証）→ 本物の Supabase 発行と確定
  → aud/role/sub で「本物のログインユーザー」と確定
  → sub を userId として信頼
  → RLS が効かない service_role パスでもデータスコープを保証
```

- 署名は **Supabase（秘密鍵）** が付け、Worker は **JWKS の公開鍵で検証**する。公開鍵は検証専用で署名はできないため、公開されていても偽造トークンは作れない（＝`SUPABASE_JWT_SECRET` 不要の根拠）。
- `hono/jwt` の `verify()` が保証するのは **署名と `exp` のみ**。`aud === "authenticated"` / `role === "authenticated"` / `sub` が string、は middleware が明示チェックする。これが anon キー（フロントに埋め込まれた公開値）や service_role キーを弾く。
- `sub` は **ユーザーの UUID**（`auth.users.id` と同一）。`c.set("user", { id: sub })` で Hono Context（サーバー内メモリ・リクエスト単位）に置き、ハンドラーが `c.get("user").id` で取り出す。HTTP ヘッダー等でクライアントには送らない。

### 重要な前提（Phase 1 時点）

**この防御は「`/api/todos/analyze` のパスでは RLS が効かない」前提に立つ。** TodoAgent が `SUPABASE_SERVICE_ROLE_KEY` で接続し RLS をバイパスするため、データ層の防御は手書きの `.eq("user_id", userId)` 1 枚しかない（多層防御が未成立）。よって `userId`（= `sub`）が信頼できることが防御の生命線。RLS を独立した 2 枚目の防御線にするのは Phase 4。

> 本リポジトリには `TodoAgent` は存在しない（ai-todo 固有のコンポーネント）。service_role でデータ層を触るコンポーネントがある場合は同様の前提が当てはまる。

### JWKS キャッシュの性質とトレードオフ

- `cachedKeys` は **Worker アイソレート単位**で保持（ユーザー単位でも DO 単位でもない）。公開鍵は全ユーザー共通の 1 組なので使い回せる。fetch はアイソレート起動後の初回 1 回のみ。
- 弱点: アイソレートが生きている間は再取得しないため、**Supabase が鍵をローテーションすると、そのアイソレートがリサイクルされるまで一時的に検証が失敗しうる**。本アプリ規模ではシンプルさを優先した意図的なトレードオフ（TTL / Cache API は採用せず）。

### 残課題マップ（Phase 1 では未解決）

| 残課題 | 対応フェーズ |
|---|---|
| service_role で RLS バイパス（防御が 1 枚） | Phase 4（user JWT + publishable key へ） |
| `todos.tag` に DB 制約がない | Phase 2（ai-todo 固有。本リポジトリには該当テーブルなし） |
| サーバー側 RBAC がない | Phase 3 |
| レート制限がない | Phase 6 |
| `enrich()` 失敗が握り潰される（202 済み） | Phase 4 で改善検討（ai-todo 固有） |
