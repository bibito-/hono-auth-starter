# グループウェア — ユーザー管理設計ドキュメント

## 技術スタック

- フロント: React (Vite)
- BaaS: Supabase
- メール: Resend + Cloudflare Email Routing

---

## ロール設計

| ロール | 概要 |
| ロール | 概要 |
|---|---|
| admin | 全権限 |
| manager | admin以外のユーザーを管理可能 |
| staff | 自分のプロフィールのname変更のみ |
| temporary | 新規サインアップ時のデフォルトロール。管理者が承認（ロール変更）するまでの仮状態。自分のプロフィール閲覧のみ可能 |

> 新規ユーザーはサインアップ時にトリガーで自動的に `temporary` が割り当てられる。

---

## DBマイグレーション

```sql
-- enumの作成
create type user_role as enum ('admin', 'manager', 'staff', 'temporary');

-- roleカラム追加
alter table profiles
  add column role user_role not null default 'temporary';

-- emailカラム追加
alter table profiles
  add column email text;

-- 既存ユーザーのemailをauth.usersから埋める
update profiles p
set email = u.email
from auth.users u
where p.id = u.id;

-- emailのupdate権限を剥奪（全ロール）
revoke update (email) on profiles from authenticated;

-- 最初の管理者を設定
update profiles set role = 'admin' where id = 'YOUR_USER_ID';
```

---

## ヘルパー関数

```sql
create or replace function get_my_role()
returns user_role
language sql stable
security definer
as $$
  select role from profiles where id = auth.uid()
$$;
```

---

## サインアップトリガー

メール認証・OAuth両対応。OAuthはemailがnullの場合があるため `coalesce` で対応。

```sql
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
INSERT INTO public.profiles (id, username, email, role)
  VALUES (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'username', ''),
    new.email,
    'temporary'
    );
  RETURN NEW;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
```

---

## RLSポリシー

```sql
-- RLSを有効化
alter table profiles enable row level security;

-- Supabaseデフォルトポリシーを削除
drop policy if exists "Enable users to view their own data only" on profiles;

-- SELECT: admin・managerは全員、staffは自分のみ
create policy "view_profiles"
on profiles for select
using (
  get_my_role() in ('admin', 'manager')
  or auth.uid() = id
);

-- INSERT: サインアップトリガー経由のみ
create policy "insert_own_profile"
on profiles for insert
with check (auth.uid() = id);

-- UPDATE①: adminは全員を更新可能（email変更不可はrevoke済み）
create policy "admin_update_any"
on profiles for update
using (get_my_role() = 'admin')
with check (get_my_role() = 'admin');

-- UPDATE②: managerはadmin以外を更新可能、adminへの昇格不可（email変更不可）
create policy "manager_update_others"
on profiles for update
using (
  get_my_role() = 'manager'
  and (select role from profiles where id = profiles.id) != 'admin'
  and profiles.id != auth.uid()
)
with check (
  get_my_role() = 'manager'
  and role != 'admin'
);

-- UPDATE③: admin・manager・staffは自分のnameのみ変更可、role・email変更不可（temporaryは不可）
create policy "self_update_name_only"
on profiles for update
using (
  auth.uid() = id
  and get_my_role() in ('admin', 'manager', 'staff')
)
with check (
  auth.uid() = id
  and role = get_my_role()
);

-- DELETE: adminのみ（自分自身・最後のadminはアプリ側で制御）
create policy "admin_can_delete"
on profiles for delete
using (get_my_role() = 'admin');
```

---

## 権限マトリクス

| 操作 | admin | manager | staff | temporary |
|---|---|---|---|---|
| 全員のプロフィール閲覧 | ✓ | ✓ | ✗ | ✗ |
| 自分のプロフィール閲覧 | ✓ | ✓ | ✓ | ✓ |
| 他adminの更新 | ✓ | ✗ | ✗ | ✗ |
| staff・managerの更新 | ✓ | ✓ | ✗ | ✗ |
| adminへの昇格 | ✓ | ✗ | ✗ | ✗ |
| 自分のname更新 | ✓ | ✓ | ✓ | ✗ |
| email更新 | ✗ | ✗ | ✗ | ✗ |
| 削除 | ✓ | ✗ | ✗ | ✗ |

> emailの更新は `revoke` によりDB層で全ロールブロック済み。  
> メール変更が必要な場合は Supabase Auth の `updateUser` 経由で行う。

---

## email同期トリガー

`auth.users.email` が変更された際に `profiles.email` へ自動同期するトリガー。  
`profiles` への直接UPDATE は `revoke` でブロックされているため、トリガーは `security definer` で実行する。

```sql
create or replace function sync_email_to_profile()
returns trigger language plpgsql security definer as $$
begin
  update public.profiles
  set email = NEW.email
  where id = NEW.id;
  return NEW;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute procedure sync_email_to_profile();
```

> `after update of email` と列を絞ることで、email以外の更新では発火しない。

---

## email更新の実装方針

### 現在の方針
全ロールでemail更新を禁止（権限マトリクス参照）。

### 将来的にemail更新を許可する場合の注意点

`supabase.auth.updateUser()` は**ログイン中の自分自身のemailのみ**変更可能。  
変更後は確認メールが送信され、承認後に `auth.users.email` が更新される。トリガーにより `profiles.email` にも自動同期される。

```typescript
// 自分自身のemail変更（Auth API経由）
const updateUser = async (
  id: string,
  updates: { username?: string; role?: UserRole; email?: string }
) => {
  if (updates.email) {
    // Auth APIで変更 → 確認メール送信 → 承認後にtriggerでprofilesに同期
    const { error } = await supabase.auth.updateUser({ email: updates.email })
    if (error) throw error
  }

  const profileUpdates = { ...updates }
  delete profileUpdates.email
  if (Object.keys(profileUpdates).length > 0) {
    const { error } = await supabase
      .from('profiles')
      .update(profileUpdates)
      .eq('id', id)
    if (error) throw error
  }

  await fetchUsers()
}
```

**adminが他ユーザーのemailを変更する場合は `service_role` が必要**なため、削除と同様にEdge Function経由の実装が必要になる。

---

## ユーザー削除（Edge Function）

`auth.users` の削除は `service_role` が必要なためEdge Functionで処理する。  
`auth.users` 削除時に `profiles` も cascade delete される（設定済み）。

```typescript
// supabase/functions/delete-user/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const { userId } = await req.json()

  const authHeader = req.headers.get('Authorization')
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader! } } }
  )

  // 呼び出し者がadminか確認
  const { data: { user } } = await userClient.auth.getUser()
  const { data: caller } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user?.id)
    .single()

  if (caller?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  // service_roleで削除実行
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { error } = await adminClient.auth.admin.deleteUser(userId)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  return new Response(JSON.stringify({ success: true }), { status: 200 })
})
```

### 削除時のアプリ側制御（フロント）

- 自分自身は削除不可
- adminが1人の場合は削除不可

```typescript
const adminCount = users.filter(u => u.role === 'admin').length

const handleDelete = async (id: string) => {
  const target = users.find(u => u.id === id)
  if (target?.role === 'admin' && adminCount <= 1) {
    setError('管理者が1人のため削除できません')
    return
  }
  await deleteUser(id)
}
```

---

## フロント実装（React + Vite）

### Realtime 準備

Supabaseダッシュボード側で `profiles` テーブルのRealtimeを有効化する必要があります。

**手順**：
1. Supabase ダッシュボード → `Table Editor`
2. `profiles` テーブルを選択 → `Edit Table`
3. `Enable Realtime` をオン

### カスタムフック

複数のadmin・managerが同時にユーザーを管理する想定のため、Realtimeで変更を購読します。

```typescript
// src/hooks/useUserManagement.ts
import { useState, useEffect } from 'react'
import { supabase } from '@/clients/supabaseClient'
import { mapToProfile, type Profile } from '@/entities/Profile'
import type { UserRole } from '@/entities/UserRole'

export function useUserManagement() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const fetchUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true })
    setUsers((data ?? []).map(mapToProfile))
    setLoading(false)
  }

  const updateUser = async (
    id: string,
    updates: { username?: string; role?: UserRole }
  ) => {
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
    if (error) throw error
    // Realtimeが変更を検知してfetchUsersを呼ぶ
  }

  const deleteUser = async (id: string) => {
    const { error } = await supabase.functions.invoke('delete-user', {
      body: { userId: id }
    })
    if (error) throw error
    // Realtimeが変更を検知してfetchUsersを呼ぶ
  }

  useEffect(() => {
    const channel = supabase
      .channel('profiles-modify')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        fetchUsers
      )
      .subscribe()

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchUsers()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return { users, loading, updateUser, deleteUser }
}
```

### Realtime + RLS のセキュリティ設計

- **RLS適用**: Postgres Changesはデフォルトでテーブルのfull replicationログを流すため、RLSのフィルタリングはされません。アクセス制御はRLSポリシー側で担保する（staffやtemporaryが他ユーザーのデータを受信しないようにするには、Broadcast or Presenceを使うか、フロント側での権限確認が必要です）
- **`private: true` は無効**: Postgres Changesに限れば、認証済み・未認証に関わらず `private: true` はRLSに影響しません
- **チャンネルのクリーンアップ**: チャンネルを同期的に生成しクリーンアップ関数で `removeChannel` することで、コンポーネントのアンマウント時にサブスクリプションが確実に解除される
- **ESLint対応**: `react-hooks/set-state-in-effect` は effect 内で setState を呼ぶ関数呼び出しを静的解析でフラグするため、初期フェッチ行のみ `eslint-disable-next-line` でミュート。IIFEを使う方法はチャンネルのクリーンアップ関数が effect に戻らずメモリリークを起こすため採用しない
- **初期ローディング状態**: `useState(true)` でローディング状態を初期化し、`fetchUsers` 内では `setLoading(true)` を呼ばない。これにより effect 内の同期的 setState を排除できる
- **更新・削除後のリフレッシュ**: `updateUser` / `deleteUser` 後の explicit `fetchUsers()` は削除。`event: '*'` の購読が変更を検知して自動的に `fetchUsers` を呼ぶため、二重フェッチのレースコンディションを避ける
- **利点**: admin・managerが同時にユーザー管理画面を開いている場合、一方の変更がリアルタイムで他方に反映されます

> **将来の最適化案**: TanStack Queryに統一することで、Realtime + データフェッチ + キャッシュ戦略を一元管理でき、ESLint警告も構造的に回避できます

---

## 実装ステップ

1. DBマイグレーション（enum・カラム追加・revoke）
2. ヘルパー関数・トリガー作成
3. RLSポリシー設定
4. Edge Functionデプロイ
5. Supabaseダッシュボードで `profiles` テーブルのRealtimeを有効化
6. フロント実装（useUserManagementでRealtimeを購読）
