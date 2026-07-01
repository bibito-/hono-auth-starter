# delete-user Hono 移行＋サーバーサイド RBAC 実装仕様書

最終更新: 2026-06-24
ステータス: 完了

## 概要

ユーザー削除を Supabase Edge Function（`rapid-processor`）から Hono バックエンドの `DELETE /api/admin/users/:id` へ移し、新設の `requireRole(["admin"])` ミドルウェアで守る。`auth.admin.deleteUser` は service_role 必須＝RLS をバイパスするため、これを Hono 側のサーバーサイド RBAC で防御する。認証ハードニング roadmap v2 Phase 3（サーバーサイド RBAC）の**最初の実消費者**。

## 背景（移行前に確定していた事実）

| 項目 | 確定事実 |
|---|---|
| 現行 Edge Function | デプロイ済みは `rapid-processor`（verify_jwt=true）のみ。client が呼ぶ `delete-user` スラッグは存在せず **404 で実質壊れていた** |
| 現行関数の認可 | admin のみ（caller の `profiles.role != 'admin'` → 403） |
| 現行関数のバグ | `auth.admin.deleteUser` の `error` を捨てて常に `success:true`（保全ソース `supabase/functions/rapid-processor/index.ts` L34-35 が証跡） |
| profiles ↔ auth.users | FK `profiles_id_fkey` が **ON DELETE CASCADE**。`auth.admin.deleteUser` → auth.users 削除 → profiles CASCADE 削除 → Realtime `profiles` DELETE 発火 → 一覧から消える → `log_profile_changes` トリガーで `event_logs` 監査 |
| 監査トリガー | `log_profile_changes`（DELETE 時 `event_logs(user_id, actor_id=auth.uid(), action='DELETE', old_role)`）。`actor_id` は nullable |
| CFW の secret | `SUPABASE_SERVICE_ROLE_KEY` 保持済み（本実装が初の実行時消費者・スモークで実在確認済み） |

## 設計方針

| 項目 | 決定内容 | 理由 |
|---|---|---|
| エンドポイント | `DELETE /api/admin/users/:id`（id はパスパラメータ） | RESTful。削除対象を URL で表現 |
| RBAC | `requireRole(allowed: UserRole[])` を新設し **admin ルートにのみ**適用 | 全 `/api/*` に付けると高頻度の per-user `POST /api/todos/analyze` にレイテンシ（role 取得の DB クエリ）を足す。admin 操作は低頻度 |
| role 取得元 | JWT カスタムクレームに焼かず、毎回 `profiles.role` を DB 取得 | role 変更の即時反映を優先（roadmap v2 Phase 3 確定方針） |
| role 取得の接続 | caller の **user JWT + publishable key**（RLS `view_profiles` の `auth.uid()=id` で自分の行のみ）。service_role は使わない | 最小権限。caller 検証に service_role を使わない＝正しさを middleware 一点に集約しない多層防御 |
| user 型拡張 | `AuthenticatedUser` に `role?: UserRole` を追加し `c.set("user", { id, role })` | Phase 1 の型定義への追記のみ |
| 削除機構 | service_role client で `auth.admin.deleteUser(id)` を**単一実行**。profiles は CASCADE に委ねる | 原子的・孤児を作らない。不可逆操作の復旧コストを最小化 |
| 監査の actor | **actor_id=NULL を許容**（案A）。起案者の責任追跡は API ゲート（requireRole）＋ CFW リクエストログで担保 | カスケード削除は service_role 接続（GoTrue）で走り `auth.uid()`=NULL。トリガーは Hono の caller を構造的に知り得ない |
| 最後の admin ガード | **サーバー側に必須実装**。対象が admin かつ admin 総数 ≤ 1 なら 409 | client チェックは API 直叩きで回避可能。最後の admin 削除はシステム管理不能になる不可逆操作 |
| 対象不在（404） | **区別しない**。冪等に 204 を返す | 存在判定の追加クエリ不要・どの id が存在するかの情報漏洩（存在オラクル）回避 |
| エラー応答 | `deleteUser` の `error` を必ず判定し、失敗は 500＋汎用文言（詳細は内部ログのみ） | 現行バグ（error 握り潰し）の修正 |
| role 取得失敗 | 取得失敗・role 不在・allowed 外はすべて **403 fail-closed**（500 と区別しない・サーバーログには区別記録） | admin 判定不能＝権限を与えない、が安全側。情報漏洩回避 |
| UI 更新 | 楽観的更新を足さず **Realtime（profiles DELETE）に委ねる** | CASCADE で profiles が消えれば `profiles-modify` チャンネルが発火し既存の仕組みで一覧更新 |

## レスポンス契約

| 状況 | ステータス | body |
|---|---|---|
| 成功 | 204 No Content | なし |
| トークン無し／不正 | 401 | `{ error: "Unauthorized" }`（authMiddleware） |
| 認証済みだが admin でない／role 取得失敗 | 403 | `{ error: "Forbidden" }`（requireRole） |
| 最後の admin | 409 | `{ error: "最後の管理者は削除できません" }` |
| `auth.admin.deleteUser` 失敗 | 500 | `{ error: "削除に失敗しました" }`（詳細は内部ログ） |
| 対象不在 | 204（冪等・区別しない） | なし |

client は `apiFetch` の戻り `res.ok` で成否判定し、失敗時は既存のページ内インラインエラーへ流す。

## 監査ログの設計判断（案A）と将来の移行メモ

**なぜ actor_id=NULL を許容するか:** 削除は service_role の `auth.admin.deleteUser`（GoTrue API）で実行され、profiles のカスケード削除は GoTrue 側の接続で走る。Hono は GoTrue のトランザクションに caller コンテキスト（GUC/JWT クレーム）を注入できないため、トリガーは構造的に Hono の caller を知り得ず `auth.uid()`=NULL になる。トリガー行の actor_id を後から UPDATE する案は **(1) 監査ログの append-only 性を破り event_logs に UPDATE 経路を作る＝改ざん耐性を失う、(2)「service_role が実行した」というリテラルな事実を編集することになる**ため採らない。

**将来 admin が複数になり durable ログに「誰が消したか」が要件化したら → 案C へ移行（additive・後付け可能）:**
- 削除は単一 `auth.admin.deleteUser` のまま（原子性・孤児なしを維持）
- Hono が `event_logs` に `actor_id = c.get("user").id` で**明示 INSERT**（service_role で書くので auth.uid 非依存・リテラルに正しい actor）
- 二行化を避けるためトリガーの DELETE ロギングを止める小マイグレーションを併用（append-only 維持・過去行はそのまま残す）
- 前提: 移行後の profiles 削除経路が Hono 一本であること。本実装のハンドラ構造は変えずに後付けできる

## 実装

| Step | 対象 | 内容 |
|---|---|---|
| 1 | `src/shared/entities/UserRole.ts`（新規）/ `src/client/entities/UserRole.ts` | `UserRole` を shared へ移動。client は `export type { UserRole } from "@shared/entities/UserRole"` で再エクスポート（既存 import 無改修） |
| 2 | `src/shared/types/hono.ts` | `AuthenticatedUser = { id: string; role?: UserRole }`。`role` は requireRole 通過後にのみセット |
| 3 | `src/server/middleware/requireRole.ts`（新規） | `requireRole(allowed)` ファクトリ。caller JWT + publishable key で `profiles.role` を `.eq("id", userId).single()` 取得。取得失敗・role 不在・allowed 外は 403（事由はサーバーログに区別）。成功で `c.set("user", { id, role })` |
| 4 | `src/server/handlers/deleteUser.ts`（新規） | service_role client。対象 role 取得→不在は 204 冪等／admin かつ総数≤1 は 409／`deleteUser` の error は 500／成功 204 |
| 5 | `src/server.ts` | `app.use("/api/admin/*", requireRole(["admin"]))` ＋ `app.delete("/api/admin/users/:id", deleteUserHandler)`。cors / auth は既存 `/api/*` で適用済みのため role 検証のみ追加 |
| 6 | `src/server/cors.ts` | `allowMethods` に `"DELETE"` 追加 |
| 7 | `src/client/hooks/useUserManagement.ts` | `deleteUser` を `supabase.functions.invoke` → `apiFetch(\`/api/admin/users/\${id}\`, { method: "DELETE" })` に変更。`res.ok` でなければ throw。UI 更新は Realtime に委譲 |

### テスト

| テストファイル | 主な検証 |
|---|---|
| `src/server/middleware/requireRole.test.ts` | admin 通過＋`user.role` セット / staff 403 / role 取得 error 403 / role 不在 403 / caller JWT+publishable key で生成し service_role を使わない |
| `src/server/handlers/deleteUser.test.ts` | 非admin 削除 204 / service_role key で生成 / `deleteUser` error 500 / 最後の admin 409・削除しない / 他に admin がいれば admin も削除 204 / 対象不在 204 冪等・削除しない |
| `src/client/hooks/useUserManagement.test.ts` | `deleteUser` が `apiFetch` を DELETE で呼ぶ / `res.ok=false` で throw |

全 65 テスト緑・tsc 緑（実装時点）。

## 開発者が押さえるべき要点（理解必須・grill 由来）

main マージ前の grill ゲート（2026-06-24・適用）合格後に確定。混同しやすい設計判断とその帰結のみを残す。

- **最後の admin ガードはサーバー側が信頼境界**。client チェックは「正規 web クライアントが正しいコードで動く」前提でしか成立せず、API 直叩き（curl・改造クライアント・別オリジン）で回避できる。不可逆操作（最後の admin 削除＝システム管理不能）のガードをサーバーに置かないと実質ノーガードになる。
- **対象不在を 404 で区別せず冪等 204** にするのは単純性だけでなくセキュリティ目的。404/204 を撃ち分けると id を変えて叩くだけで存在有無が判る**存在オラクル**になり、ユーザー ID 列挙の足がかりになる。
- **requireRole は caller の JWT + publishable key で role を取り、service_role を使わない**。狙いは RLS（`view_profiles`：`auth.uid()=id`）を有効に保つこと。service_role にすると RLS をバイパスし正しさが middleware コード一点に集約される。middleware と DB の二層が相互に正しさを担保する多層防御（front/back 分離方針と一貫）。
- **監査 DELETE 行の actor_id=NULL を設計上許容する（案A）**。トリガー行を直後に UPDATE して埋める案は append-only（改ざん耐性）を壊すため不採用。複数 admin 化で要件化したら案C へ additive 移行。
- **RBAC は `/api/admin/*` 限定で適用**。role 取得は毎回 DB クエリ 1 回を伴うため、高頻度の `POST /api/todos/analyze`（per-user）に掛けるとレイテンシ＝UX 劣化を招く。admin 操作は低頻度ゆえ影響が小さい。

## 情報の出所

**公式ドキュメント確認済み:**
- `supabase.auth.admin.deleteUser(id)` は `{ data, error }` を返し service_role キー必須（JavaScript Reference）。`error` を判定する実装は現行バグ修正の前提として裏取り済み。

**実装経験由来（公式未確認）:**
- カスケード削除が GoTrue 接続で走り `auth.uid()`=NULL になること（actor_id=NULL の根拠）は MCP での pg_constraint / トリガー調査と挙動観察に基づく。

## スモーク結果（2026-06-24）

デプロイ後、実 admin で実ユーザー削除を実行 → CFW 経由で導通・一覧から消える・`event_logs` に DELETE 挿入を確認。`SUPABASE_SERVICE_ROLE_KEY` が Worker に実在することを実地確認（ユニットは createClient をモックするため secret 欠落を検出できない＝スモーク必須だった）。

## スコープ外（本タスクでやらない）

- 案C（app 層の明示監査ロギング＋トリガー DELETE 停止 migration）。複数 admin 化時に additive で着手
- `profiles.role` カラムデフォルト（'staff'）の fail-open 修正（`set default 'temporary'`）。別マイグレーションタスクで対応。ロール序列 `admin > manager > staff > temporary` に対しトリガー `handle_new_user` は最小権限 'temporary' を INSERT する一方、カラムデフォルトはより高権限の 'staff'。将来 role を省略した INSERT 経路が増えると権限昇格側に倒れる latent リスク
- レート制限（Phase 6）

## Edge Function `rapid-processor` の退役

1. Hono エンドポイント＋RBAC＋client 差し替えをデプロイ（PR #8 merged）
2. 本番スモークで Hono 経由削除が動作することを確認（済）
3. ソースを version control へ保全（`supabase/functions/rapid-processor/index.ts`・PR #9。リポジトリ外にしか無かったため）
4. `supabase functions delete rapid-processor` を**ユーザーが**実行して退役

## 関連ファイル

```
src/
├── shared/
│   ├── entities/UserRole.ts          # 新規（client から移動）
│   └── types/hono.ts                 # role 追加
├── server/
│   ├── middleware/
│   │   ├── auth.ts                   # 既存（変更なし）
│   │   └── requireRole.ts            # 新規
│   ├── handlers/deleteUser.ts        # 新規
│   └── cors.ts                       # DELETE 追加
├── server.ts                         # /api/admin/* 配線
└── client/
    ├── entities/UserRole.ts          # 再エクスポート化
    └── hooks/useUserManagement.ts    # invoke → apiFetch(DELETE)

supabase/functions/rapid-processor/index.ts  # 退役する旧 Edge Function の保全ソース
```

## 関連ドキュメント

- `docs/features/auth/jwt-auth-middleware-doc-01.md`（Phase 1 認証ミドルウェア）
- `docs/features/user-management/user-management-doc-01.md`（ユーザー管理画面）
- `docs/features/user-management/event-logs-doc-01.md`（監査ログ）
- `docs/features/auth/auth-hardening-roadmap-doc-01.md`（Phase 3 RBAC の全体方針）

## 修正履歴

### tsconfig.json から `supabase/functions` を除外（2026-06-28）

**種別:** 仕様変更（ビルド設定）  
**対象ファイル:** `tsconfig.json`

**問題:** `tsc --noEmit` が `supabase/functions/rapid-processor/index.ts` の Deno 固有グローバル（`Deno.serve`・`Deno.env`）と ESM URL インポート（`https://esm.sh/...`）をエラーとして報告していた。  
**原因:** `tsconfig.json` に `exclude` がなく、Deno ランタイム向けコードが Node/Vite 用の tsconfig でチェックされていた。`rapid-processor` は version control への保全目的で残しているのみ（退役済み）で、Node/Vite の型定義下では正しく型付けできない。  
**対応:** `tsconfig.json` に `"exclude": ["supabase/functions"]` を追加し、Deno コードを Node/Vite tsconfig のスコープから外した。Deno 関数を型チェックしたい場合は Supabase CLI の `supabase functions serve`（Deno 環境）で別途行う。
