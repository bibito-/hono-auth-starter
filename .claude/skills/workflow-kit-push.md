# workflow-kit-push スキル

このプロジェクト（および同じ core を採用した兄弟プロジェクト）で `.claude/` の **core**（スタック非依存部分）に変更が入ったとき、[claude-workflow-kit](https://github.com/bibito-/claude-workflow-kit) へ直接 push して反映する手順。

## 位置づけ

```
ai-todo（実験場）─┐
hono-auth-starter ├─ core の変更を都度 push ─→ claude-workflow-kit
（今後の非Honoプロジェクト）─┘
```

現状は CI/PR 自動配布は未実装（実績が安定してから着手する方針）。それまではこのスキルで手動 push する。

## core の範囲（単一の正）

以下に該当するファイルだけが対象。これ以外（impl/review agent 定義・スタック依存の docs/rules・specs/steering 等）は対象外。

```
.claude/hooks/*.js
.claude/agents/doc-push-agent.md
.claude/agents/tsc-agent.md
.claude/rules/agent-definition-guide.md
.claude/rules/documentation-guide.md
.claude/rules/grill-me.md
.claude/skills/merge-gate.md
.claude/docs/rules/terminology-rules.md
```

> この一覧を増減させたときは、`claude-workflow-kit` の README.md（core/template 切り分け表）とこのリストの両方を更新すること。

## 呼び出し方

```
/workflow-kit-push <変更したファイルの説明>
```

**例:**
```
/workflow-kit-push guard-rm-rf.js のパターンを修正
/workflow-kit-push merge-gate.md にスモークの適用条件を追記
```

## 実行手順

**Main が直接実行する（doc-push-agent には委譲しない）。** doc-push-agent の worktree 隔離は同一リポジトリ内での push を前提にしており、claude-workflow-kit は別リポジトリのクローンのため、そのモデルに乗らない。

### Step 1: 変更ファイルが core 範囲か確認する

引数で指定された変更ファイルを、上記「core の範囲」一覧と照合する。範囲外なら「core 対象外のためpush不要」と報告して終了する。

### Step 2: claude-workflow-kit のクローンを確認する

```bash
ls ../claude-workflow-kit 2>/dev/null || gh repo clone bibito-/claude-workflow-kit ../claude-workflow-kit
```

`../claude-workflow-kit` は現在のプロジェクトルート（`git rev-parse --show-toplevel`）から見た兄弟ディレクトリ。固定の絶対パスにはしないこと。

### Step 3: 最新化と差分確認

```bash
cd ../claude-workflow-kit && git fetch origin main -q
git merge-base --is-ancestor origin/main HEAD && echo "up-to-date" || echo "diverged"
```

`diverged` の場合は push せず、競合の可能性を報告して終了する（自動 rebase/merge はしない）。

### Step 4: 変更ファイルをコピーする

コピー元プロジェクトの該当ファイルを、claude-workflow-kit 側の同一パスへ上書きコピーする（ディレクトリ構成は `.claude/...` で共通）。

```bash
cp <元プロジェクト>/.claude/<path> ../claude-workflow-kit/.claude/<path>
```

### Step 5: プロジェクト固有の内容が紛れていないか確認する

コピーしたファイルを読み、コピー元プロジェクト固有の値（絶対パス・プロジェクト名・機能名の実例等）が残っていないか確認する。`documentation-guide.md` のような例示目的の固有名は許容するが、動作に影響する固定値（ハードコードされたリポジトリパス等）は汎用化してから進める。

### Step 6: コミットして push する

対象ファイルのみを `git add` する（他の未コミット変更を巻き込まない）。

```bash
git add .claude/<変更ファイルのみ列挙>
git commit -m "<変更内容の要約（日本語）>"
git push origin main
```

push 失敗（競合）の場合はエラーをそのまま報告する。

### Step 7: 完了報告

push したコミットハッシュを報告する。ai-todo 側の `steering/current.md` への記録は不要（claude-workflow-kit 側の commit history が記録そのもの）。
