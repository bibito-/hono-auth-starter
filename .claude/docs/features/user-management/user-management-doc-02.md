# ユーザー管理機能 実装仕様書

最終更新: 2026-06-25
ステータス: **完了**
改訂理由: manager のロール編集権限を正典 design_1（admin 以外の全員）へ修正し、role/表示名の編集・削除を Supabase 直叩きから Hono API（`/api/users/:id`・service_role＋サーバーサイド RBAC）へ移行した実態に合わせて全面更新（doc-01 の「manager は staff のみ」は旧解釈・破棄）。

> 自己完結ドキュメント。doc-01 は履歴として残すが、現行仕様は本ファイルを参照すること。

> 本ドキュメントは切り出し元プロジェクト（ai-todo）における実装履歴であり、本リポジトリには該当する PR・マイグレーションファイルは存在しない。設計判断の参考情報として保持している。

## 概要

管理者・マネージャーが `profiles` テーブルのユーザー情報（表示名・ロール）を編集・削除できる機能。編集・削除は Hono API（service_role）経由でサーバーサイド RBAC により認可し、表示は Supabase Realtime でリアルタイム同期する。

> **ロール権限の正典は `.claude/migrations/user-management-design_1.md`**（manager は admin 以外の全員を管理可能・admin 昇格不可）。

## 設計方針

| 項目 | 決定内容 | 理由 |
|---|---|---|
| データソース | `profiles` テーブル（public） | Supabase Auth の `auth.users` は直接操作不可 |
| ロール/表示名の更新 | Hono `PATCH /api/users/:id`（service_role） | role 列は authenticated に UPDATE 権限なし（UPDATE は `username` 列のみ列レベル付与）で直叩き不可。権限マトリクスをハンドラ一点で強制。詳細は [role-change-hono-migration-doc-01.md](./role-change-hono-migration-doc-01.md) |
| ユーザー削除 | Hono `DELETE /api/users/:id`（service_role） | `auth.users` の削除は service_role が必要。詳細は [delete-user-hono-migration-doc-01.md](./delete-user-hono-migration-doc-01.md) |
| 認可（RBAC） | ルートで `requireRole`（粗いゲート）＋ ハンドラで design_1 マトリクス（細かい判定） | PATCH=`["admin","manager"]` / DELETE=`["admin"]`。URL はリソース（users）を表す（role 名前空間 `/admin` は両ロールが叩く操作で破綻するため不採用） |
| リアルタイム同期 | Supabase Realtime（`postgres_changes`） | 複数タブ・別ユーザーの変更を即時反映。更新後は楽観的更新を足さず Realtime に委ねる |
| 状態管理 | `useState` + `useEffect`（TanStack Query を使わない） | Realtime チャンネルで常に最新を取得するため Query キャッシュ管理が不要 |
| ロール編集権限 | admin: 全員可。manager: **admin 以外の全員**（自己編集不可・admin への昇格不可）。staff/temporary: 不可 | 階層型権限モデル。正典 design_1 |
| 最後の admin 保護 | 降格・削除ともサーバー側でガード（admin 総数 ≤ 1 なら 409）。フロントの `adminCount` チェックは UX 補助 | admin が 0 人になるとシステム管理不能（不可逆）。client チェックは API 直叩きで回避可能なためサーバーが本丸 |
| 監査 | role 変化時に `event_logs` へ操作者 `actor_id` 付きで記録 | service_role 書き込みは `auth.uid()`=NULL になるため Hono が明示 INSERT。詳細は role-change doc / [event-logs-doc-01.md](./event-logs-doc-01.md) |

## ロール編集マトリクス（正典 design_1）

| 操作者 | admin 対象 | manager 対象 | staff 対象 | temporary 対象 |
|---|---|---|---|---|
| admin | 編集・削除可（最後の admin 降格/削除は 409） | 編集・削除可 | 編集・削除可 | 編集・削除可 |
| manager | 不可（403） | 編集可（自己は不可） | 編集可 | 編集可 |
| staff / temporary | 不可 | 不可 | 不可 | 不可 |

- manager は admin への昇格不可（403）・自己編集不可（403）。削除は admin のみ。
- temporary は被編集対象にはなるが、操作者にはなれない。

## 実装ステップ

### Step 1 — Profile エンティティ定義
対象: `src/client/entities/Profile.ts`
- `Profile`: `{ id, userName, role, email, updatedAt }`
- `mapToProfile`: DBレコード → Profile へのマッピング

### Step 2 — `useUserManagement` フック
対象: `src/client/hooks/useUserManagement.ts`
- `fetchUsers`: `profiles` テーブルを全件取得（read-only・RLS で admin/manager 限定）
- `updateUser(id, { username?, role? })`: `apiFetch` で `PATCH /api/users/:id`（`res.ok` でなければ throw）
- `deleteUser(id)`: `apiFetch` で `DELETE /api/users/:id`（`res.ok` でなければ throw）
- Realtime: `supabase.channel("profiles-modify")` で `postgres_changes` を購読 → `fetchUsers` を再実行

### Step 3 — `UserManagementPage`
対象: `src/client/components/pages/UserManagementPage.tsx`
- `canEditRole(target)`: `myRole` と対象（role・id）で編集可否を返す。サーバーマトリクスと一致（manager は admin 以外かつ自己でないとき可）
- 区分セレクト: manager には admin 昇格の選択肢を出さない
- 削除前確認UI: 削除ボタン押下で「本当に削除？」確認状態に遷移（admin のみ）
- 最後の admin 削除ガード: `adminCount <= 1` のとき `setError(...)`（UX 補助。本丸はサーバー 409）
- エラー表示: ページ内インラインエラー（Toast は使用しない）

## 関連ファイル

```
src/
├── client/
│   ├── entities/
│   │   ├── Profile.ts
│   │   └── UserRole.ts          # 'admin'|'manager'|'staff'|'temporary'
│   ├── hooks/
│   │   └── useUserManagement.ts
│   └── components/
│       └── pages/
│           └── UserManagementPage.tsx
└── server/
    ├── handlers/
    │   ├── updateUser.ts        # PATCH /api/users/:id
    │   └── deleteUser.ts        # DELETE /api/users/:id
    └── middleware/requireRole.ts

supabase/migrations/
├── 20260527000000_grant_profiles_crud_and_protect_email.sql
├── 20260621000000_fix_manager_update_staff_policy.sql
└── 20260625000000_role_update_boundary_and_audit.sql
```

## 修正履歴

### profiles テーブルへの明示的権限付与（2026-05-27）

**種別:** バグ修正
**対象ファイル:** `supabase/migrations/20260527000000_grant_profiles_crud_and_protect_email.sql`

**問題:** `profiles` テーブルへの GRANT および `email` 列の REVOKE が設計ドキュメントに記載されていたが、マイグレーションファイルとして管理されていなかった。

**原因:** 初期セットアップ時に Supabase ダッシュボードから直接適用しており、マイグレーションとして記録されていなかった。

**背景 — Supabase の権限ルール変更（2026-05-30）:**
Supabase は 2026-05-30 より public スキーマへのデフォルト GRANT を廃止する。変更後は明示的な GRANT がなければ Data API 経由でアクセス不可になる。RLS でアクセスを許可していても GRANT がなければ弾かれるため、GRANT → RLS の 2 層が両方必要。

**対応:**
- `GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated` を追加
- `REVOKE UPDATE (email) ON public.profiles FROM authenticated` を追加

### manager_update_staff ポリシーの USING 句バグ修正（2026-06-21）

**種別:** バグ修正
**対象ファイル:** `supabase/migrations/20260621000000_fix_manager_update_staff_policy.sql`

**問題:** `manager_update_staff` ポリシーの USING 句が `profiles_1.id = profiles_1.id`（自己参照で常に true）になっており、実行時エラーを起こしていた。

**原因:** 既存行の role を参照しようとしたサブクエリが自己参照に退化していた。

**対応:** サブクエリをやめ `role <> 'admin'`（既存行の role を直接参照）に修正。論理は design_1 の意図（manager は admin 以外を更新可）と一致する。本修正でポリシーの実挙動が design_1 と揃った。

### role 変更の Hono 移行＋サーバーサイド RBAC（2026-06-25）

**種別:** 仕様変更
**対象ファイル:** `src/server/handlers/updateUser.ts` ほか（詳細は [role-change-hono-migration-doc-01.md](./role-change-hono-migration-doc-01.md)）

**変更:**
- ロール編集マトリクスの正典を design_1 に統一（**doc-01 の「manager は staff のみ」を破棄**し「manager は admin 以外の全員」へ）。UI（`canEditRole`）もこれに整合。
- `updateUser` をクライアント直叩き（`profiles.update`）から Hono `PATCH /api/users/:id`（service_role）へ移行。`REVOKE UPDATE (role)` で role 変更経路を Hono 一本に絞り、最後の admin 降格ガード（409）と監査 actor 保全を回避不能化。
- ルートを `/api/admin/*` 一括 use から per-route `requireRole` へ変更し `/api/users/:id` に統一（delete も移設）。
- ポリシー `manager_update_staff` → `manager_update_others` へ改名、role 列デフォルトを `'temporary'` に統一。
