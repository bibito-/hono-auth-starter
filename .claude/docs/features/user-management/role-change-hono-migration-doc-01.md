# role 変更 Hono 移行＋サーバーサイド RBAC 実装仕様書

最終更新: 2026-06-25
ステータス: **完了**（PR #16 マージ・本番デプロイ・スモーク合格）

## 概要

ユーザーの表示名・ロール編集を、クライアントの Supabase 直叩き（`profiles.update`）から Hono の `PATCH /api/users/:id`（service_role）へ移行し、`requireRole(["admin","manager"])` ＋ ハンドラ内の権限マトリクスで守る。認証ハードニング roadmap v2 Phase 3（サーバーサイド RBAC）の2番目の実消費者（delete-user に続く）。

> **権限マトリクスの正典は `.claude/migrations/user-management-design_1.md`**（manager は admin 以外の全員を管理可能・admin 昇格不可）。`user-management-doc-01.md` の「manager は staff のみ」は旧解釈で破棄。

## 設計方針

| 項目 | 決定内容 | 理由 |
|---|---|---|
| 移行範囲 | `updateUser`（username + role 両方）を丸ごと PATCH へ置換 | role だけ移すとフォーム保存が直叩き/apiFetch に分裂し部分失敗が生まれる |
| 権限マトリクスの正典 | design_1（manager=admin 以外の全員・admin 昇格不可） | ユーザー確定（2026-06-25） |
| 書き込み境界（REVOKE） | `REVOKE UPDATE (role) ON profiles FROM authenticated` | role 変更経路を Hono 一本に絞り、最後の admin 降格ガード（409）と監査 actor 保全を回避不能化する。**昇格穴封じが目的ではない**（manager の非 admin 編集は意図仕様で RLS が直叩きでも正しく強制している） |
| PATCH の DB 接続 | service_role（GRANT 剥奪を貫通し username+role を1回で書く） | role 列剥奪後はユーザー JWT で role を書けない。権威的マトリクスをハンドラ一点で強制 |
| ルート構造 | `/api/admin/*` 一括 use を撤去し per-route requireRole。パスは `/api/users/:id` に統一・delete も移設 | PATCH は admin/manager 双方が叩く操作。role 名前空間（/admin）は両ロールが叩く操作で破綻する。URL はリソース（users）を表す |
| ルートのロールゲート | PATCH → `requireRole(["admin","manager"])`、DELETE → `requireRole(["admin"])` | 粗いゲートはルート、細かいマトリクスはハンドラ |
| 最後の admin 降格ガード | 対象が admin かつ新 role 非 admin かつ admin 総数 ≤ 1 なら 409 | 最後の admin 降格＝システム管理不能（不可逆）。delete の「最後の admin」ガードと対 |
| 監査 actor の保全（案C） | Hono が `event_logs` に `actor_id = c.get("user").id` で明示 INSERT し、Supabase DB トリガーの UPDATE 分岐を停止 | service_role で書くと `auth.uid()`=NULL になり actor を失う退行になる。経路が Hono 一本になるため、明示記録＋トリガー停止で二重記録なく正しい actor を残せる |
| 監査の記録条件 | role が実際に変化（old ≠ new）したときのみ INSERT。username のみ変更は記録しない | 旧トリガー挙動の踏襲 |
| email 不可侵 | ハンドラは `{username, role}` のみ書く | email は `auth.users` 経由＋同期トリガーが正典 |
| 対象不在 | 404 | requireRole 通過者は全件列挙できるため情報漏洩にならない |
| UI 更新 | 楽観的更新を足さず Realtime（profiles UPDATE）に委ねる | delete と同じ方針 |
| UI マトリクス整合 | `canEditRole` を design_1 に合わせ広げる（manager は admin 以外を編集可・自己編集不可・admin 昇格の選択肢を出さない） | UX をサーバーマトリクスと一致させる |
| 残す RLS | `self_update_name_only` / `manager_update_others` は削除しない | 直叩き経路への多層防御として温存 |

## 権限マトリクス（ハンドラ強制）

requireRole(["admin","manager"]) 通過後、service_role で対象 profile を取得してから判定する。正典: design_1。

| 呼び手 | 許可 | 拒否 |
|---|---|---|
| admin | 全対象・全 role へ変更可。username も可 | 最後の admin を非 admin へ降格 → 409 |
| manager | 対象が admin 以外（staff/manager/temporary）。新 role は admin 以外。username 可 | 対象が admin → 403 / admin 昇格 → 403 / 自己編集（id==caller）→ 403 |
| staff / temporary | （requireRole で 403・ハンドラ未到達） | — |

- 新 role が `UserRole` 列挙外 → 400 / body にどちらのフィールドも無い → 400
- すべての 403 は fail-closed・一律 `Forbidden`（事由はサーバーログに区別記録）

## レスポンス契約

| 状況 | ステータス | body |
|---|---|---|
| 成功 | 204 No Content | なし |
| トークン無し／不正 | 401 | `{ error: "Unauthorized" }`（authMiddleware） |
| admin/manager でない／role 取得失敗 | 403 | `{ error: "Forbidden" }`（requireRole） |
| manager の越権 | 403 | `{ error: "Forbidden" }`（ハンドラ） |
| 不正な body | 400 | `{ error: "Bad Request" }` |
| 最後の admin の降格 | 409 | `{ error: "最後の管理者は降格できません" }` |
| 対象不在 | 404 | `{ error: "Not Found" }` |
| 更新失敗（DB エラー） | 500 | `{ error: "更新に失敗しました" }` |

## マイグレーション（適用済み）

`supabase/migrations/20260625000000_role_update_boundary_and_audit.sql`

1. `REVOKE UPDATE (role) ON public.profiles FROM authenticated;`
2. `log_profile_changes` を再定義し UPDATE 分岐を削除（INSERT / DELETE は据え置き）
3. ポリシー改名 `manager_update_staff` → `manager_update_others`（論理は live 修正済み版を踏襲）
4. role 列デフォルト統一 `SET DEFAULT 'temporary'`

## 実装ステップ（完了）

1. マイグレーション（承認 → `supabase db push` → 型再生成・差分なし）
2. `src/server/handlers/updateUser.ts`（新規・service_role・design_1 マトリクス・案C 監査）
3. `src/server.ts`（一括 use 撤去・per-route requireRole・`/api/users/:id` 統一・delete 移設）
4. `src/server/cors.ts`（`allowMethods` に PATCH 追加）
5. `src/client/hooks/useUserManagement.ts`（updateUser→PATCH / deleteUser パス追従）
6. `src/client/components/pages/UserManagementPage.tsx`（canEditRole を design_1 へ・manager に admin 昇格選択肢を出さない）
7. テスト（`updateUser.test.ts` 新規・`useUserManagement.test.ts` 追記）

## 開発者が押さえるべき要点（理解必須・grill 由来）

- **`REVOKE UPDATE (role)` の目的は昇格穴封じではない。** 目的は role 変更経路を Hono(service_role) 一本に絞り、「最後の admin 降格 409 ガード」と「監査 actor 保全」を回避不能化すること。混同しやすい点: **削除は REVOKE(role) の守備範囲外**（DELETE ポリシー＋`deleteUser` の 409 で別途守られている）。
- **⚠️ 列レベル `REVOKE UPDATE (role)` 単独では効かない。** profiles にテーブルレベル `GRANT UPDATE`（20260527）があると、列レベル REVOKE は Postgres 仕様で無効化される（テーブルレベル付与は列レベル REVOKE で減算されない）。本タスク直後はこの落とし穴で role/email が直叩き可能なままだった。`20260625000001` で **テーブルレベル UPDATE を撤回し UPDATE を `username` 列のみに限定**して実効化した。検証は `has_column_privilege('authenticated','public.profiles','role','UPDATE')` が **false** であること。
- **service_role での書き込みは `auth.uid()` が NULL になる。** そのため Supabase の DB トリガー任せだと role 変更の actor を失う。Hono が `actor_id = caller.id` で明示 INSERT する理由がこれ。さらに **Supabase の DB トリガー（`log_profile_changes`）の UPDATE 分岐を停止しないと二重記録**になる（トリガーは経路を問わず profiles UPDATE で必ず発火し、actor=NULL 行と Hono の正しい行の2行が出る）。「トリガー」は Supabase の DB トリガーであり Hono ではない。
- **`/admin` 名前空間をやめ per-route requireRole にしたのは PATCH を admin/manager 双方が叩くから。** ロール名を URL に焼くと「両ロールが叩く操作」を表現できない。per-route で PATCH=`["admin","manager"]`・DELETE=`["admin"]` とメソッドごとに別ゲートを宣言できる。URL はリソース（users）を表す（REST）。
- **デプロイ順序ハザード。** `REVOKE(role)` を本番適用した後にハンドラが未デプロイだと、クライアント直叩きは剥奪済み・Hono ハンドラは不在で role 変更が全経路で不能になる。マイグレーションとコードは同一デプロイ（PR マージ）で揃えること。本タスクではマイグレーションを先に push したため、PR マージ＝デプロイまで本番 role 変更が一時的に不能だった。

## 公式照合

- **公式確認済み**（Supabase Database Roles / RLS ガイド）: `service_role` は PostgREST/API が RLS を**バイパス**するためのロール。「service_role in RLS policies does nothing. Service role will never run the policies to begin with」。
- **公式確認済み**（PostgreSQL GRANT ドキュメント）: テーブルレベルの列権限（UPDATE 等）は全列に適用され、列レベルの REVOKE では取り消せない。列単位で制御するにはテーブルレベルを付与せず列レベルで付与する。→ role/email を塞ぐには `GRANT UPDATE (username)` の列限定が必須。
- **実装経験由来（公式未明記）**: RLS バイパス経路（service_role）では session JWT が無いため `auth.uid()` が NULL を返す。上記「actor=NULL」はこの帰結。

## 修正履歴

### role/email の直接更新が塞がっていなかった（2026-06-25）

**種別:** バグ修正
**対象ファイル:** `supabase/migrations/20260625000001_fix_profiles_update_grant_to_column_level.sql`

**問題:** 本移行の `REVOKE UPDATE (role)`（および 2026-05-27 の `REVOKE UPDATE (email)`）が実際には効いておらず、`authenticated` が role/email を PostgREST 経由で直接更新できる状態だった。conformance チェック（ライブ DB の `has_column_privilege`）で発覚。

**原因:** 2026-05-27 のテーブルレベル `GRANT UPDATE ON profiles TO authenticated` が全列に及び、列レベル REVOKE を無効化していた（Postgres 仕様）。結果、admin/manager は直叩きで role を変更でき、Hono の 409 ガードと監査 actor を素通り可能。さらにトリガー UPDATE 分岐を停止したため、直叩きの role 変更は無記録になっていた。

**対応:** `REVOKE UPDATE ON profiles FROM authenticated` でテーブルレベルを撤回し、`GRANT UPDATE (username)` で UPDATE を username 列のみに限定。role/email/id/updated_at は authenticated から書けなくなり、service_role（Hono/Auth）経由のみになった。適用後 `has_column_privilege('authenticated','public.profiles','role','UPDATE')=false` を確認。

**スモークの教訓:** PR #16 のスモークは「Hono 経路が動く」正のテストのみで、「直叩きで role を書けないこと」の負のテストを欠いていた。権限境界の変更時は負のテスト（has_column_privilege / 実際の直叩きが弾かれること）をスモーク項目に含める。**2026-06-25 以降はこの負のテストを CI に自動化**（`scripts/check-profiles-privileges.sql` を deploy 前ゲートで実行し、role/email が authenticated から書ける状態に戻ったら deploy を失敗させる。要 `SUPABASE_DB_URL` Secret）。

## スモーク結果（2026-06-25・本番）

全項目グリーン: ハザード解消（admin の role 変更成功・service_role シークレット存在）/ CORS PATCH 通過 / 権限マトリクス（admin 全可・manager の admin 対象/昇格/自己編集 403）/ 最後の admin 降格 409 / 監査 actor が操作者 uid で記録・username のみ変更で二重記録なし / delete 移設追従 204 / Realtime 反映。

## 関連ファイル

```
src/
├── server/
│   ├── handlers/
│   │   ├── deleteUser.ts        # ルート移設のみ・本体不変
│   │   └── updateUser.ts        # 新規
│   ├── middleware/requireRole.ts # 既存（再利用）
│   └── cors.ts                  # PATCH 追加
├── server.ts                    # per-route requireRole・/api/users/:id 統一
└── client/
    ├── hooks/useUserManagement.ts
    └── components/pages/UserManagementPage.tsx

supabase/migrations/20260625000000_role_update_boundary_and_audit.sql
```

## 関連ドキュメント

- `.claude/migrations/user-management-design_1.md`（権限マトリクスの正典）
- `delete-user-hono-migration-doc-01.md`（delete 移行・requireRole 導入・案C の出典）
- `event-logs-doc-01.md`（監査ログ）
- `docs/features/auth/auth-hardening-roadmap-doc-01.md`（Phase 3 RBAC 全体方針）

## フォローアップ（未実施・コード変更外）

- `.claude/migrations/user-management-design_1.md` の manager ポリシー SQL を修正版に差し替え（自己参照サブクエリのバグ版 → `role <> 'admin'` 直接参照・名称 `manager_update_others`）
- 同ファイルに `REVOKE UPDATE (role)` 強化を追記（role 変更を API 境界に閉じる方針として）
