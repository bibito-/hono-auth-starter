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
応答は結論を端的に報告してから、必要な場合のみ補足説明を続ける。先に長い背景説明を並べてから結論を述べる構成は避ける。また、変更内容をコミットハッシュ（例:「push完了（`4cfe40e`）」のような形）を主語にして語るのではなく、「何をしたか」を平易な言葉で説明する。体言止めや簡潔な報告文自体は問題ない。

# 実装範囲の扱い
依頼範囲を超える処理を追加したい場合は、実装前に「推奨」「提案」として一言提示し、承認を得てから実装すること。先走って実装に含めない。

# 作業開始時の確認
作業を開始する前に必ず [.claude/steering/current.md](.claude/steering/current.md) を確認し、進行中の作業がある場合はその続きから始めること。「進行中のタスクなし」と書かれている場合は新規タスクとして扱う（ファイルが存在しない場合も同様）。

既存機能に関わるすべての作業（実装・変更・デバッグ・調査・質問への回答）を始める前に、`.claude/docs/` の該当ドキュメントを確認すること。コードを読む前に docs を参照するのが原則。該当ドキュメントを探すときは、まず対象フォルダの `INDEX.md`（`.claude/docs/<フォルダ>/INDEX.md`・`.claude/skills/INDEX.md` 等）を読み、そこから対象ファイルを絞り込むこと。`find`/`ls` でフォルダ全体を洗い出してから個々のファイルを開いて内容を推測する、という手順は避ける。

# セッション終了の合図

ユーザーが「SIO」と発言したら、セッション終了の明示的な合図として扱う。応答を切り上げる前に、このセッション中に得られた保存すべき内容（ユーザーの好み・訂正されたやり方・プロジェクトの意思決定など）がメモリーに未反映でないか確認し、保存してから終了すること。

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

`.claude/docs/`・`.claude/rules/`・`.claude/skills/` 配下のフォルダを参照するときは、まず該当フォルダの `INDEX.md` を読み、関連ドキュメントがあれば参照すること。

# .claude/ ディレクトリ構成

| ディレクトリ | 役割 | 更新頻度 |
|---|---|---|
| `rules/` | 守るべき制約・規約（宣言的なルール）。実装時に常時参照する | 随時更新 |
| `docs/` | 確定済み仕様のアーカイブ（設計判断・実装根拠）。基本設計が変わらない限り凍結 | 改訂時のみ新連番ファイルを追加 |
| `specs/` | 実装前の仕様書（SPEC駆動の起点）。実装完了後は docs/ に昇格させ削除 | 機能追加のたびに作成→削除 |
| `steering/` | 現在進捗（`current.md`）と実行履歴（`history.md`）の集積所。進行中タスクの状態管理は`/tdd`が更新、実行履歴はdoc-push・マージゲート完了時に追記 | タスク開始・フェーズ完了・タスク完了時・doc-push完了時 |
| `skills/` | Claude が実行するスラッシュコマンド・手順書（手続き的な作業スクリプト） | 随時更新 |
| `agents/` | 実装専任 agent 定義（`client-impl-agent`・`server-impl-agent` 等） | 随時更新 |
| `migrations/` | DBスキーマの設計ドキュメント（RLS・トリガー・設計判断）。truth source は `supabase/migrations/` | マイグレーション追加時 |

## skills の配置方針

本プロジェクトはテンプレートであり、どこにコピーされて使われるか（ディレクトリ構成・マシン）が実行時点では分からない。そのため `.claude/skills/` は `~/.claude/skills/`（グローバル）等の外部共有場所に依存させず、必要な手順は各プロジェクトの `.claude/skills/` 内に自己完結させる。複数プロジェクトで共通化したい手順は、将来的に専用のGitHubリポジトリを正典として切り出す予定（未着手）。それまでは各プロジェクトが同じ内容を重複して持つ運用とする。

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
- `/doc-push <変更内容>` … `.claude/` の rules / skills / CLAUDE.md を隔離エージェントに委譲し、main へ直接 push する

# 初期セットアップ（このテンプレートを使い始める時）

初期セットアップ手順は [README.md](README.md) と同じ内容・同じ順序にすること（乖離させない）。

1. プロジェクト名を変更: `package.json` の `name`・`scripts.deploy` 内の `dist/hono_auth_starter/` パス（`name` をハイフン→アンダースコア変換した文字列）・`wrangler.jsonc` の `name`・`index.html` の `<title>`・`src/client/main.tsx` の `ThemeProvider` `storageKey`・`src/client/components/layout/Header.tsx` のブランドタイトル文字列・**README.md 自身の見出し/本文中の自己言及**
2. stack-kit の同期ループに結線する（必須）。複製したプロジェクトのルートで `../hono-auth-starter/scripts/stack-kit-scaffold.sh` を実行し、レポートに出る手動作業2件（`STACK_KIT_PAT` の登録・`.claude/settings.json` へのフック登録）を済ませる。`.claude/manifests/stack-kit-base.txt` と Secrets は template 複製で届かないため、これを飛ばすと初回 CI が `noancestor` で固まる
3. 新規 Supabase プロジェクトを作成し、`profiles`（+ RLS ポリシー）・`event_logs` テーブルを作成するマイグレーションを用意（[.claude/docs/migrations/user-management-design_1.md](.claude/docs/migrations/user-management-design_1.md) 参照。role 種別は業務要件に合わせて再定義すること）。その後 `.claude/skills/extract-template.md` Step6 を参照し、profiles/event_logs 用の権限・RLS マイグレーションを適用
4. Vercel でプロジェクトを新規作成し、対象 GitHub リポジトリと連携する（Framework Preset は Vite 自動検出のまま、Build/Output Directory も上書き不要）
5. 環境変数を設定する。`.dev.vars`（Cloudflare Workers ローカル開発用）に `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` を、クライアント側（Vercel 環境変数）に `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_API_BASE_URL` を設定。本番 Cloudflare Worker には `wrangler secret put` でユーザー自身が別途シークレットを登録する必要がある（未登録だと認証必須の全エンドポイントが 401 になる）
6. CORS の許可オリジンを設定する。`wrangler.jsonc` の `vars.PROD_VERCEL_ORIGIN`（現状 `""` のプレースホルダー）に Step 4 で確定した本番オリジンを設定し、`pnpm cf-typegen` を再実行する。プレビューデプロイからも API を叩くなら `src/server/cors.ts` の `PREVIEW_ORIGIN_PATTERN`（既定 `null`）を自分の Vercel team slug で絞った正規表現に差し替える。`LOCAL_ORIGINS` は差し替え不要
7. コンテンツ機能を実装: `src/client/contexts/ContentRepositoryContext.tsx` の型・`src/client/components/pages/ContentPage.tsx` を実際のコンテンツに差し替え、必要な API を `src/server.ts` に追加
8. サインアップ後、Supabase ダッシュボードで最初のユーザーの `profiles.role` を `admin` に手動更新

**本番デプロイ前に確認すべきこと（Agents SDK の instance name 露出）:** `agents` パッケージの `Agent` クラスは既定で `sendIdentityOnConnect: true` であり、`idFromName`/`getAgentByName` に渡したインスタンス名をクライアント接続時に `{ type: "cf_agent_identity", name, agent }` メッセージとして自動送信する。`user_id` 等の機微な値をインスタンス名に使う Agent クラス（例: コンテンツ機能実装時に追加する per-user 通知用 DO）を作成した場合、本番デプロイ前に該当クラスへ `static options = { sendIdentityOnConnect: false }` を追加すること。詳細は [.claude/docs/rules/agents-sdk-rules.md](.claude/docs/rules/agents-sdk-rules.md) 参照。clone直後〜launchまでの開発中は既定値（true）のままで問題ない。

**既知の deploy warning（対応不要）:** `pnpm run deploy` 実行時に `--minify と --no-bundle` 併用不可・`run_worker_first=true set without an assets binding` の2件の warning が出るが、`@cloudflare/vite-plugin` の仕様上の既知事項で対応不要。`wrangler.jsonc`/`vite.config.ts`/`deploy` スクリプトを変更して消そうとすると、Worker が意図せず SPA を配信してしまう regression を招くので触らないこと。
