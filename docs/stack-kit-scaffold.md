# stack-kit-scaffold 実装仕様書

最終更新: 2026-07-11
ステータス: Step 1〜3 完了（hono-auth-starter `63718ef` / PR #7）。Step 4 は据え置き
実装対象リポジトリ: **hono-auth-starter**（スタックの正）と **hono-user-point**（第1顧客）。ai-todo ではない

> この文書は利用プロジェクト側の `.claude/specs/` にあった spec を、実装されているリポジトリ（= ここ）へ移したもの。設計の置き場は、その設計が実装されているリポジトリとする。

## 概要

template 複製で作られた Hono+Supabase プロジェクトを、stack-kit の**同期ループに結線する**スクリプト `scripts/stack-kit-scaffold.sh` を hono-auth-starter に新設する。あわせて、結線に必要なのに現在どのマニフェストにも属していないファイル群を整理する。

## 背景（調査結果・2026-07-11）

`workflow-kit-template-scaffold` spec は「hono-auth-starter 側の scaffold は Hono/React/Supabase の**実物コード**を配る役割」と想定していた。調査の結果、**この前提は誤り**だった。

| 発見 | 内容 |
|---|---|
| **実物コードは Template repo が配る** | hono-auth-starter は GitHub Template repository（`isTemplate: true`）で、hono-user-point は 2026-07-01 に実際にここから生成されている。`src/`・`package.json`・`wrangler.jsonc`・マニフェスト記載の20ファイルは複製で**全部届く**。scaffold が新規に配るものは無い |
| **届かないのは同期ループへの結線** | 複製で届かないのは `stack-kit-base.txt`（正が持たないため）、`secrets.STACK_KIT_PAT`（Secrets は複製されない）、`.claude/settings.json` のフック登録。これは core の `scaffold.sh` と同じ役割 |
| **base 初期化のデッドロック** | `stack-kit-pull-check.yml` の `classify()` は、20ファイルが kit とバイト単位で同一なら祖先を見ずに `same` を返し base を書くが、**1ファイルでも差分があると `noancestor` → `blocked=1` で base を書かない**。kit が20ファイルのどれかを1回でも触れば（今日だけで2回）、以降に立つ新規プロジェクトの初回 CI は必ず固まる |
| **マニフェスト漏れ3件** | 下記 |
| **壊れた実例が1件ある** | hono-user-point は複製後に skill / command を手でコピーしただけで、`stack-kit-files.txt`・`stack-kit-base.txt`・`.github/workflows/stack-kit-pull-check.yml` を持たず、複製後にマニフェストへ追加された `agents-sdk-rules.md`・`error-logging-rules.md` も欠落。**同期は一度も動いていない** |

### マニフェスト漏れ3件

| ファイル | 現状 |
|---|---|
| `.claude/commands/stack-kit-pull.md` / `stack-kit-push.md` | **hono-auth-starter に存在しない**。ai-todo と hono-user-point がそれぞれ手書きしている。skill だけ配って command を配らないのは、FastAPI 試運転の所見1（`/template-setup` が起動できない）と同型のバグ |
| `.claude/skills/tdd-workflow.md` / `.claude/commands/tdd.md` | vitest・pnpm・tsc-agent 前提でスタック固有なのに、core にも stack にも属さない孤児 |
| `.claude/skills/pnpm-setup.md` | 同上 |

`tdd-workflow.md` を stack マニフェストへ入れないまま「stack-kit を入れるなら template scaffold はスキップしてよい」を適用すると、**`/tdd` の無いプロジェクトができる**（kit の template は骨格を配るが、スキップするとそれも来ない）。

## 設計方針

| 項目 | 決定内容 | 理由 |
|---|---|---|
| scaffold の役割 | **同期ループへの結線のみ**。マニフェスト記載ファイルの配置 + `stack-kit-base.txt` の生成 + 手動作業の案内 | 実物コードは Template repo が配る。scaffold が既存プロジェクトへ `src/` を撒く経路は成立しない（既存アプリに `src/client/`・`src/server/` を丸ごと注ぎ込むことはできない） |
| 配布物の範囲 | stack マニフェスト記載のファイルのみ（整理後25件）。`src/` は含めない | 上記 |
| スクリプト自身の配布 | しない（`scripts/` はマニフェストに載せない） | core の `scaffold.sh` と同じ。kit 側に置き、対象プロジェクトから `../hono-auth-starter/scripts/stack-kit-scaffold.sh` として起動する |
| 差分ありファイルがある場合の `base.txt` | **書かない**。差分ファイル一覧を報告し「`/stack-kit-pull` で解決してから再実行せよ」と案内する | core の `scaffold.sh` 準拠。書いてしまうと「kit の新しい変更を取り込み済み」と誤認し、その差分が永久に同期されない（未取り込みが `local` 判定に化ける） |
| 既存ファイルの扱い | 上書きせずスキップし、「同一」「差分あり」を分けて一覧報告する | `scaffold.sh` と挙動を揃える。再実行しても破壊しない |
| CI 側のデッドロック | **CI のロジックは直さない**。`noancestor` で止まったときのメッセージに「`stack-kit-scaffold.sh` を実行してください」と出す。README の導入手順に scaffold を必須ステップとして書く | 解決策を2箇所に持つとどちらが正か分からなくなる。scaffold が base を書けば穴は構造的に消える |
| 手書きされた skill / command との衝突 | **kit 側を正として上書きする**（diff を提示してから） | 手書き分は kit の複製物であり独自価値を持たない |
| `tdd-workflow.md` と workflow-kit template の同名骨格 | 同じパスを両 kit が持つが二重管理にならない。stack-kit を入れるなら template scaffold をスキップし、実物を stack から受け取る | 既に確立した「実物は stack-kit、骨格は workflow-kit」の切り分けどおり（[workflow-kit-template-scaffold-spec-01.md](../workflow-kit-template-scaffold/workflow-kit-template-scaffold-spec-01.md) の「kit の階層と導入フロー」参照） |
| git 操作 | scaffold は一切しない（add / commit / push を行わない） | `scaffold.sh` の設計思想（配置とレポートのみ）と一貫させる |

## 実装ステップ

### Step 1 — マニフェスト漏れの整理（前提整備）

対象リポジトリ: **ai-todo → hono-auth-starter**（`/stack-kit-push` の経路）

1. `.claude/commands/stack-kit-pull.md` / `.claude/commands/stack-kit-push.md` を hono-auth-starter へ新設する（ai-todo の実物を昇格させる。`commands/workflow-kit-pull.md` と同型の薄いラッパー）
2. `.claude/manifests/stack-kit-files.txt` に以下5件を追加する
   - `.claude/commands/stack-kit-pull.md`
   - `.claude/commands/stack-kit-push.md`
   - `.claude/skills/tdd-workflow.md`
   - `.claude/commands/tdd.md`
   - `.claude/skills/pnpm-setup.md`
3. マニフェストは20行 → 25行になる

> **注意:** マニフェストへ追加した瞬間から、この5件は `stack-kit-pull-check.yml` の対象になる。ai-todo・hono-user-point の内容が hono-auth-starter と食い違っていれば `conflict` 判定が出る。追加前に3リポジトリの内容を突き合わせ、差分があれば先に解消すること。

### Step 2 — `scripts/stack-kit-scaffold.sh`

対象リポジトリ: **hono-auth-starter**

core の `scaffold.sh`（claude-workflow-kit）を写経元とし、以下の差分を持つ。

- 前提チェックは `scaffold.sh` と同一（git リポジトリのルートで実行・kit 自身では実行不可）
- `KIT_ROOT` 相対でマニフェスト記載の25ファイルをコピーする。既存ファイルは上書きせずスキップし、`cmp` で「同一」「差分あり」を分けて集計する
- **差分ありが1件でもあれば `stack-kit-base.txt` を書かない**。0件なら `git -C "$KIT_ROOT" rev-parse origin/main` を書き込む
- `.gitignore` に `.claude/steering/` 等を追記する（`scaffold.sh` と同じ）
- 最終レポート:
  - 作成 / スキップ（同一）/ スキップ（差分あり）の一覧
  - `stack-kit-base.txt` を書いたか、書かなかった場合はその理由と次のアクション（「`/stack-kit-pull` で差分を解決してから再実行してください」）
  - **手動作業の案内2件**:
    1. `secrets.STACK_KIT_PAT` の登録（hono-auth-starter は PRIVATE のため、これが無いと `stack-kit-pull-check.yml` の checkout が落ちる。Secrets は template 複製で引き継がれない）
    2. `.claude/settings.json` へのフック登録（core scaffold と同じ）
- git 操作は一切しない

> シークレットの登録操作は**ユーザー自身が行う**。スクリプトはコマンド例を提示するにとどめる（CLAUDE.md の規約）。

### Step 3 — CI メッセージと README

対象リポジトリ: **hono-auth-starter**

- `.github/workflows/stack-kit-pull-check.yml` の `noancestor` 判定時のメッセージに「`../hono-auth-starter/scripts/stack-kit-scaffold.sh` を実行して同期ループに結線してください」を追加する（**CI のロジック自体は変更しない**）
- README の「新規プロジェクトとして使い始める手順」に scaffold を**必須ステップ**として追加する（Supabase / Vercel の設定と並ぶ位置）

### Step 4 — hono-user-point の修復（実地検証）— **据え置き（2026-07-11 判断）**

対象リポジトリ: **hono-user-point**

急がない判断をした。根拠は、`stack-kit-scaffold.sh` が exercise 済みの `scaffold.sh`（claude-workflow-kit・kit-smoke-fastapi で実行検証済み）の写経であり、かつ git 操作をせず既存ファイルも上書きしない（非破壊・再実行安全）ため。

> 注: 「ai-todo が stack を運用している」ことは検証の根拠にならない。ai-todo は scaffold を一度も実行しておらず、手作業で同期ループに入ったため。

**未検証のまま残る分岐**: `stack-kit-base.txt` の書き込みガード（差分ありなら書かない）。壊れても「base が書かれない」だけで、現状（base が存在しない）と同じ状態に留まるため被害は出ない。

**据え置きの実コスト**: hono-user-point の同期が動かないまま残る（`stack-kit-files.txt`・`stack-kit-base.txt`・CI workflow を持たず、`agents-sdk-rules.md`・`error-logging-rules.md` も欠落）。

着手するときの手順:

- `scripts/stack-kit-scaffold.sh` を実行する
- 手書きされた `skills/stack-kit-*.md` / `commands/stack-kit-*.md` が「差分あり」で止まるはずなので、diff を提示のうえ kit 側を正として上書きする
- 欠落していた `stack-kit-files.txt`・`.github/workflows/stack-kit-pull-check.yml`・`agents-sdk-rules.md`・`error-logging-rules.md` が配置されることを確認する
- `stack-kit-base.txt` が書かれ、CI が `noancestor` で固まらずに回ることを確認する
- 見つかった問題は hono-auth-starter へ還流する

## スコープ外

| 項目 | 理由 |
|---|---|
| 実物コード（`src/` 等）の配布 | Template repo の担当。scaffold の経路は成立しない |
| kit への push を kit 側で強制する（branch protection + PR 経路 + CI） | 別 spec。[workflow-kit-template-scaffold-spec-01.md](../workflow-kit-template-scaffold/workflow-kit-template-scaffold-spec-01.md) の後続タスクに設計メモあり |
| CI の `classify()` ロジックの変更 | scaffold が base を書けば穴は消える。解決策を2箇所に持たない |
| hono-agents-starter への適用 | `.claude/` の kit 資産がゼロ。将来の consumer 候補だが今回は対象外 |

## 後続タスク

### impl-agent の `tools:` が構造的に drift する（本文を育てる前に決着させる）

`.claude/agents/client-impl-agent.md` / `server-impl-agent.md` の frontmatter の `tools:` 行は「そのプロジェクトにどの MCP サーバーが入っているか」という**環境依存の設定**なのに、ファイル全体がスタック資産として同期されている。Vercel plugin を外したプロジェクト、Cloudflare を使わないプロジェクト、別の MCP を足したプロジェクト — どれも同じ行で必ず食い違い、**全 consumer が恒久的に `local` を報告する**。

2026-07-11 時点で ai-todo が実際にこの状態にある（`10ae542` で context 削減のため MCP ツールを削り、push しない判断をした）。

**放置すると `local` では済まなくなる。** hono-auth-starter 側が impl-agent の**本文**（実装ルール・レビュー観点）を改善した瞬間、consumer から見て「祖先 → kit も project も変更」＝ `conflict` 判定になり、pull のたびに手動マージが要る。本文が動いていない今だけ `local` で済んでいる。

構図は cors / local-dev-rules の乖離と同じ型（[Step 5-b](../../skills/stack-kit-push.md) の関門を設けた件）。**同期対象のファイルが、同期できない性質のもの（プロジェクト固有の設定）を抱え込んでいる。**

| 案 | 内容 | 評価 |
|---|---|---|
| 1. starter の `tools:` を最小共通集合に切り詰める | Bash/Read/Edit/Write + Supabase MCP のみ。Vercel/Cloudflare MCP は使うプロジェクトが自分で足す | **推奨**。「スタックの正が配るのはそのスタックを触るのに最低限必要なツール」と定義すれば意味論が一貫する。ai-todo は既にその状態なので drift が消える。ただし Vercel MCP を使う新規プロジェクトが代わりに drift する |
| 2. プロジェクト固有の除外リスト | マニフェストはファイル単位のため `tools:` 行だけの除外はできず、impl-agent 丸ごと同期対象外になる。本文の改善も届かなくなる | 却下 |
| 3. ツール構成を agent 定義の外に出す | Claude Code の agent frontmatter は単一ファイル前提 | 不可能 |

どの案でも drift をゼロにはできない（誰かは必ずずれる）。決めるべきは「誰がずれる側に立つか」。

## 運用ゲート

- grill-gate: **スキップ**（`src/` に触れず、設計判断は調査報告のすり合わせで共有済み）

## 関連ファイル

```
hono-auth-starter/
├── scripts/
│   └── stack-kit-scaffold.sh              # Step 2（新規）
├── .claude/
│   ├── commands/
│   │   ├── stack-kit-pull.md              # Step 1（新規）
│   │   └── stack-kit-push.md              # Step 1（新規）
│   └── manifests/
│       └── stack-kit-files.txt            # Step 1（20行 → 25行）
├── .github/workflows/
│   └── stack-kit-pull-check.yml           # Step 3（メッセージのみ）
└── README.md                              # Step 3

hono-user-point/                           # Step 4（scaffold を当てて検証）
```
