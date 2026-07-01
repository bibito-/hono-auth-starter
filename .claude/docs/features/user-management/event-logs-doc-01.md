# event_logs 実装仕様書

最終更新: 2026-05-27
ステータス: **完了**

## 概要

`profiles` テーブルへの CREATE / UPDATE（role 変更のみ）/ DELETE を `event_logs` テーブルにトリガーで自動記録する。フロント UI は持たず、Supabase ダッシュボードから確認する。

## 設計方針

| 項目 | 決定内容 | 理由 |
|---|---|---|
| 記録対象操作 | INSERT / UPDATE（role 変更時のみ） / DELETE | role はセキュリティ上重要。username 変更は監査不要 |
| PII の扱い | email / username はログに含めない | プロジェクトルールに従い個人情報をログに残さない |
| 操作者の記録 | `actor_id` に `auth.uid()` を保存 | 誰がロール変更・削除を行ったか追跡できる |
| CASCADE DELETE 時の actor_id | NULL を許容 | auth.users 削除の CASCADE では session が存在しないため |
| 閲覧権限 | admin のみ（RLS で制御） | 監査ログは管理者だけが見られれば十分 |
| 実装方式 | DB トリガー | 変更経路（API・Edge Function・ダッシュボード）を問わず確実に発火する |

## データモデル

### event_logs テーブル

| カラム | 型 | 説明 |
|---|---|---|
| `id` | `uuid` | PK（`gen_random_uuid()`） |
| `user_id` | `uuid` | 変更対象ユーザーの ID |
| `actor_id` | `uuid` | 操作者の ID（`auth.uid()`。CASCADE 削除時は NULL） |
| `action` | `text` | `'INSERT'` / `'UPDATE'` / `'DELETE'` |
| `old_role` | `user_role` | 変更前のロール（INSERT 時は NULL） |
| `new_role` | `user_role` | 変更後のロール（DELETE 時は NULL） |
| `created_at` | `timestamptz` | 記録日時（`now()` デフォルト） |

### マイグレーション概要

```sql
-- event_logs テーブル作成
CREATE TABLE public.event_logs (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL,
  actor_id   uuid,
  action     text        NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_role   user_role,
  new_role   user_role,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- RLS 有効化
ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;

-- admin のみ閲覧可
GRANT SELECT ON public.event_logs TO authenticated;
CREATE POLICY "admin_can_view_event_logs"
  ON public.event_logs FOR SELECT
  USING (get_my_role() = 'admin');

-- トリガー関数
CREATE OR REPLACE FUNCTION public.log_profile_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.event_logs (user_id, actor_id, action, new_role)
    VALUES (NEW.id, auth.uid(), 'INSERT', NEW.role);

  ELSIF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO public.event_logs (user_id, actor_id, action, old_role, new_role)
    VALUES (NEW.id, auth.uid(), 'UPDATE', OLD.role, NEW.role);

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.event_logs (user_id, actor_id, action, old_role)
    VALUES (OLD.id, auth.uid(), 'DELETE', OLD.role);
  END IF;

  RETURN NULL;
END;
$$;

-- トリガー登録
DROP TRIGGER IF EXISTS on_profile_changed ON public.profiles;
CREATE TRIGGER on_profile_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.log_profile_changes();
```

## 実装ステップ

### Step 1 — マイグレーション作成・適用
対象: `supabase/migrations/<timestamp>_add_event_logs.sql`
- 上記 SQL をマイグレーションファイルとして作成
- `supabase db push` で適用

### Step 2 — 型再生成
対象: `src/types/database.types.ts`
- `npm run types:supabase` を実行
- `event_logs` テーブルが型定義に反映されていることを確認

## 関連ファイル

```
supabase/
└── migrations/
    └── <timestamp>_add_event_logs.sql

src/
└── types/
    └── database.types.ts   # 自動生成（Step 2 で更新）
```
