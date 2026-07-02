# service_role_key 露出防止の残課題

最終更新: 2026-07-02
ステータス: 進行中（一部対応不要と判定済み・残りは将来対応）

## 概要

httpOnly Cookie 移行の設計相談の途中で「SUPABASE_SERVICE_ROLE_KEY が露出するシナリオはあるか」を洗い出した際の記録。
1件（CLAUDE.md と README.md/実装ドキュメントの記述不一致による Vercel誤登録リスク）は既に是正済み（CLAUDE.md Step4 修正、コミット `351b1c4`）。
残りは「現時点では対応不要と判断したが、将来の変化で再度リスクになりうる」項目として記録し、次にこのテーマを扱うセッションが再調査せずに済むようにする。

## 対応済み

- **CLAUDE.md と README.md の環境変数設定手順の不一致**（Vercelに `SUPABASE_SERVICE_ROLE_KEY` を誤登録しうる書き方だった）→ CLAUDE.md Step4 を修正済み（`351b1c4`）

## 残課題（将来再検討）

### 1. サプライチェーン攻撃（`@supabase/supabase-js` 等の依存汚染）

`src/server/handlers/updateUser.ts` / `deleteUser.ts` は `createClient(url, c.env.SUPABASE_SERVICE_ROLE_KEY)` を直接呼んでいる。渡した先のライブラリが侵害されていれば、Cloudflare Workers の `c.env` バインディング分離があっても防げない。

**現状:** `pnpm audit` で既知脆弱性なし（2026-07-02 時点）。
**将来対応:** lockfile整合性の定期確認・`pnpm audit` の定期実行（CI導入時はここに組み込む）。

### 2. ログ出力への生エラーオブジェクト混入

確認範囲（`updateUser.ts` / `deleteUser.ts` / `listUsers.ts`）は `error.message` のみを出力しており、現状は安全側。

**将来対応:** 今後 `console.error(error)`（メッセージでなくオブジェクト全体）のようなコードが追加されると、Supabaseクライアントの内部構造（設定値を含みうる）次第で意図せず混入するリスクがゼロではない。新規ハンドラー実装時は `error.message` 等の必要な情報のみを出力する方針を踏襲すること。恒常的なルールとして徹底したい場合は `docs/rules/` にログ出力ルールとして昇格させることを検討する。

### 3. CI/CD 導入時の secret 露出

**現状:** `.github/workflows/` は空。deploy は `pnpm run deploy` によるローカル実行のみで `wrangler secret put` も手動。CI経由の露出経路は現時点で実在しない。

**将来対応:** GitHub Actions 等で CI/CD を組む際は、`SUPABASE_SERVICE_ROLE_KEY` を CI のログ・成果物に出力しないこと（GitHub Actions の secrets マスキングは単純な文字列一致のみのため、加工・分割された値はマスクされない点に注意）。CI導入時にこの項目を再度参照すること。

## 関連ファイル

```
CLAUDE.md                                   # 環境変数設定手順（Step4、対応済み）
src/server/handlers/updateUser.ts           # service_role_key 使用箇所
src/server/handlers/deleteUser.ts           # service_role_key 使用箇所
src/server/handlers/listUsers.ts            # user JWT + publishable key 使用箇所（対比）
.github/workflows/                          # 現状空。CI導入時に要再確認
```
