# ユーザー管理機能 実装仕様書

最終更新: 2026-05-15  
ステータス: **完了**

> 本ドキュメントは切り出し元プロジェクト（ai-todo）における実装履歴であり、本リポジトリには該当する PR・マイグレーションファイルは存在しない。設計判断の参考情報として保持している。

## 概要

管理者・マネージャーが `profiles` テーブルのユーザー情報（表示名・ロール）を編集・削除できる機能。Supabase Realtime でリアルタイム同期する。

## 設計方針

| 項目 | 決定内容 | 理由 |
|---|---|---|
| データソース | `profiles` テーブル（public） | Supabase Auth の `auth.users` は直接操作不可 |
| ユーザー削除 | Edge Function `delete-user` を呼ぶ | `auth.users` の削除は service_role キーが必要なためフロントから直接呼べない |
| リアルタイム同期 | Supabase Realtime（`postgres_changes`） | 複数タブ・別ユーザーの変更を即時反映 |
| 状態管理 | `useState` + `useEffect`（TanStack Query を使わない） | Realtime チャンネルで常に最新を取得するため Query キャッシュ管理が不要 |
| ロール編集権限 | admin: 全員可、manager: staff のみ | 階層型権限モデル。temporary は編集不可 |
| 最後のadmin削除禁止 | フロント側で `adminCount <= 1` をチェック | adminが0人になるとシステムが管理不能になる |

## ロール編集マトリクス

| 操作者 | admin | manager | staff | temporary |
|---|---|---|---|---|
| admin | 編集・削除可 | 編集・削除可 | 編集・削除可 | 編集・削除可 |
| manager | 不可 | 不可 | 編集のみ可 | 不可 |
| staff / temporary | 不可 | 不可 | 不可 | 不可 |

## 実装ステップ

### Step 1 — Profile エンティティ定義
対象: `src/entities/Profile.ts`
- `Profile`: `{ id, userName, role, email, updatedAt }`
- `mapToProfile`: DBレコード → Profile へのマッピング

### Step 2 — `useUserManagement` フック
対象: `src/hooks/useUserManagement.ts`
- `fetchUsers`: `profiles` テーブルを全件取得
- `updateUser(id, { username?, role? })`: Supabase `.update()` で直接更新
- `deleteUser(id)`: `supabase.functions.invoke("delete-user")` を呼ぶ
- Realtime: `supabase.channel("profiles-modify")` で `postgres_changes` を購読 → `fetchUsers` を再実行

### Step 3 — `UserManagementPage`
対象: `src/components/pages/UserManagementPage.tsx`
- `canEditRole(targetRole)`: `myRole` と `targetRole` の組み合わせで編集可否を返す
- 削除前確認UI: 削除ボタン押下で「本当に削除？」確認状態に遷移
- 最後のadmin削除ガード: `adminCount <= 1` のとき `setError("管理者が1人のため削除できません")`
- エラー表示: ページ内インラインエラー（Toast は使用しない）

## 関連ファイル

```
src/
├── entities/
│   ├── Profile.ts          # ユーザープロフィール型
│   └── UserRole.ts         # ロール型 ('admin'|'manager'|'staff'|'temporary')
├── hooks/
│   └── useUserManagement.ts
└── components/
    ├── pages/
    │   └── UserManagementPage.tsx
    └── features/
        └── （UserManagement専用コンポーネントがあれば追加）
```

## 修正履歴

### profiles テーブルへの明示的権限付与（2026-05-27）

**種別:** バグ修正  
**対象ファイル:** `supabase/migrations/20260527000000_grant_profiles_crud_and_protect_email.sql`

**問題:** `profiles` テーブルへの GRANT および `email` 列の REVOKE が設計ドキュメントに記載されていたが、マイグレーションファイルとして管理されていなかった。

**原因:** 初期セットアップ時に Supabase ダッシュボードから直接適用しており、マイグレーションとして記録されていなかった。

**背景 — Supabase の権限ルール変更（2026-05-30）:**  
Supabase は 2026-05-30 より public スキーマへのデフォルト GRANT を廃止する。変更前は新テーブル作成時に `authenticated` / `anon` ロールへの SELECT 等が暗黙的に付与されていたが、変更後は **明示的な GRANT がなければ Data API 経由でアクセス不可**になる。RLS でアクセスを許可していても GRANT がなければ弾かれるため、GRANT → RLS の 2 層が両方必要。

**対応:**
- `GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated` を追加（Data API 経由の CRUD を保証）
- `REVOKE UPDATE (email) ON public.profiles FROM authenticated` を追加（email 列の直接変更を全ロールで禁止。email の変更は `auth.users` 経由でのみ行い、`sync_email_to_profile` トリガーで `profiles.email` に自動同期する設計を維持）
