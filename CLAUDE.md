# hono-auth-starter

## プロジェクト構成

Hono + Cloudflare Workers + Supabase Auth のスターターテンプレート。
認証（メール/パスワード）・RBAC（admin/manager/staff/temporary）・ユーザー管理画面・レートリミッタ・デザインシステム（shadcn/ui）を備える。
コンテンツ機能（todos 相当のドメインロジック）は含まれておらず、利用時にプロジェクトごとに追加する。

ai-todo プロジェクトから認証・ユーザー管理まわりの汎用資産のみを切り出したもの（[.claude/skills/extract-template.md](.claude/skills/extract-template.md) 参照）。

# 回答スタイル
挨拶・前置き・段階報告・絵文字は禁止。結論ファースト
指摘すべきことは率直に指摘
Never open responses with filler phrases like 'Great question!', 'Of course!', 'Certainly!', or similar warmups.

# 実装範囲の扱い
依頼範囲を超える処理を追加したい場合は、実装前に「推奨」「提案」として一言提示し、承認を得てから実装すること。先走って実装に含めない。

# 作業開始時の確認
作業を開始する前に必ず [.claude/steering/current.md](.claude/steering/current.md) を確認し、進行中の作業がある場合はその続きから始めること。「進行中のタスクなし」と書かれている場合は新規タスクとして扱う（ファイルが存在しない場合も同様）。

既存機能に関わるすべての作業（実装・変更・デバッグ・調査・質問への回答）を始める前に、`.claude/docs/` の該当ドキュメントを確認すること。コードを読む前に docs を参照するのが原則。

# 絶対にやってはいけないこと
- 環境変数の値を出力しない('console-log(process.env)' 等)
- 認証情報をハードコードしない
- 個人情報（メールアドレス・名前・電話）をログに出力しない
- DBに対して'DELETE' / 'DROP' / 'TRUNCATE' を許可なく実行しない
- 本番環境（`NODE_ENV === 'production'`）への操作は確認なしで行わない
- HTTP リクエストに認証情報を生で含めない（例: ?password=xxx や Authorization: Basic
  base64(user:pass) を自前で組む）
- シークレット・認証情報の登録操作（`wrangler secret put`・`supabase secrets set` 等、どのサービスでも同様）は必ずユーザー自身が行う。`.dev.vars` 等のファイルから値を読み取って Claude が実行してはならない。コマンド例を提示するにとどめること

## パッケージマネージャー

pnpm v11 を使用。ビルドスクリプトの許可設定は [`.claude/skills/pnpm-setup.md`](.claude/skills/pnpm-setup.md) を参照。

# 実装時の参照ドキュメント

| ドキュメント | 参照タイミング |
|---|---|
| `.claude/docs/rules/react-rules.md` | React コンポーネント・hooks 実装時 |
| `.claude/docs/rules/supabase-auth-rules.md` | Supabase 認証処理の実装・変更時 |
| `.claude/docs/rules/supabase-db-rules.md` | DBマイグレーション・型定義更新時（`database.types.ts` は自動生成のため直接編集禁止） |
| `.claude/docs/rules/tanstack-query-rules.md` | TanStack Query 実装時 |
| `.claude/docs/rules/ui-rules.md` | UI コンポーネント実装時 |
| `.claude/docs/rules/ux-feedback-policy.md` | トースト・エラー表示実装時 |
| `.claude/docs/rules/testing-comment-rules.md` | テスト実装時 |
| `.claude/docs/rules/local-dev-rules.md` | ローカルで動作確認するとき |

# .claude/ ディレクトリ構成

| ディレクトリ | 役割 | 更新頻度 |
|---|---|---|
| `rules/` | 守るべき制約・規約（宣言的なルール）。実装時に常時参照する | 随時更新 |
| `docs/` | 確定済み仕様のアーカイブ（設計判断・実装根拠）。基本設計が変わらない限り凍結 | 改訂時のみ新連番ファイルを追加 |
| `specs/` | 実装前の仕様書（SPEC駆動の起点）。実装完了後は docs/ に昇格させ削除 | 機能追加のたびに作成→削除 |
| `steering/` | 進行中タスクの状態管理（ゴール・フェーズ・次のステップ）。`/tdd` が更新する | タスク開始・フェーズ完了・タスク完了時 |
| `skills/` | Claude が実行するスラッシュコマンド・手順書（手続き的な作業スクリプト） | 随時更新 |
| `migrations/` | DBスキーマの設計ドキュメント（RLS・トリガー・設計判断）。truth source は `supabase/migrations/` | マイグレーション追加時 |

## docs/ の運用ルール

- **実装前の仕様書** は `.claude/specs/` に書いてから実装を開始すること（SPEC駆動）
- **実装完了後** は `.claude/docs/` に昇格させて永続保管する
- docs/ のファイルは基本設計・方針が変わらない限り更新しない（改訂は新連番ファイルで行う）
- docs/ を参照するときは、必ず同フォルダ内で**最も連番が高いファイル**を参照すること
- 書き方・命名規則は [.claude/rules/documentation-guide.md](.claude/rules/documentation-guide.md) を参照すること

# 実装の agent 委譲ルール

`src/client/` または `src/server/` 配下のコードを変更するときは [.claude/rules/agent-delegation.md](.claude/rules/agent-delegation.md) に従うこと。

# 使用できるスラッシュコマンド
- `/spec <機能名>` … 仕様書を specs/ に作成し承認を得る（実装前に必ず実行）
- `/tdd <対象>` … TDD（Red→Green→Refactor）で実装を進める
- `/doc-push <変更内容>` … `.claude/` の rules / skills / CLAUDE.md を隔離エージェントに委譲し、main 向け PR を作成する

# 初期セットアップ（このテンプレートを使い始める時）

1. `package.json` の `name`・`wrangler.jsonc` の `name` をプロジェクト名に変更
2. 新規 Supabase プロジェクトを作成し、`profiles`（+ RLS ポリシー）・`event_logs` テーブルを作成するマイグレーションを用意（[.claude/docs/migrations/user-management-design_1.md](.claude/docs/migrations/user-management-design_1.md) 参照）。その後 `.claude/skills/extract-template.md` Step6 記載の profiles/event_logs 用マイグレーション5本を適用
3. `src/server/cors.ts` の `ALLOWED_ORIGINS`（現状 TODO プレースホルダー）を実際のオリジンに差し替え
4. `.dev.vars` / Vercel 環境変数に `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_API_BASE_URL` を設定
5. `src/server.ts`（Hono エントリポイント）・`src/client/main.tsx`・`src/client/App.tsx` 等のアプリケーションエントリポイントを新規実装（本テンプレートには未含有）
6. サインアップ後、Supabase ダッシュボードで最初のユーザーの `profiles.role` を `admin` に手動更新
