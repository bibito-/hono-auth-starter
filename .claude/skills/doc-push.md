# doc-push スキル

args で指定された `.claude/` ディレクトリの変更（rules / skills / CLAUDE.md）を、
background agent に委譲して main へ反映する。
完了後に Claude が steering へ記録する。

main が保護されていないプロジェクトでは agent が直接 push し、ユーザーの関与は不要。
main が保護されている（PR 必須）プロジェクトでは、直 push が拒否された時点で agent が
ブランチを切って PR を作り、URL を返す。マージはユーザーが行う。

## 想定シチュエーション

**フィーチャーブランチで作業中に `.claude/` の更新が必要だと気づいたとき**に使う。

```
feat/xxx ブランチで作業中
↓
「この設計判断を tdd-workflow に残しておきたい」
↓
/doc-push tdd-workflow に〇〇を追記
↓
agent が background で main へ反映（保護時は PR を作る。作業は止まらない）
↓
完了通知 → Claude が worktree 削除・steering 記録
↓
feat/xxx の作業を続ける
```

**使わなくていいケース:**
- main で直接作業中（普通に commit/push すればよい）
- 変更内容を Claude と対話しながら詰める必要があるとき（固まってから `/doc-push` を呼ぶ）

---

## 呼び出し方

```
/doc-push <変更内容の説明>
```

**例:**
```
/doc-push ux-feedback-policy に rate-limit account scope の dismiss 条件を追記
/doc-push tdd-workflow の grill ゲート質問文を修正
/doc-push CLAUDE.md に doc-push スキルの説明を追加
```

## 手順

### Step 1: background agent を起動する

`subagent_type: "doc-push-agent"`・`isolation: "worktree"`・`run_in_background: true` でエージェントを起動する。
prompt には変更内容だけを渡す（共通手順は `.claude/agents/doc-push-agent.md` に定義済み）。

```
Agent({
  subagent_type: "doc-push-agent",
  description: "doc-push: <変更内容の要約>",
  isolation: "worktree",
  run_in_background: true,
  prompt: "変更内容: {{ARGS}}"
})
```

---

### Step 2: 完了通知を受けたら後処理する

background agent が完了すると自動通知が来る。以下を順に行う。

**1. worktree を削除する**

通知に `<worktree>` タグが含まれている場合（agent が変更を加えた場合）、必ず削除する。

```bash
git worktree remove <worktreePath> --force
git branch -D <worktreeBranch>
```

**2. steering に記録する**

`steering/history.md` の「doc-push 完了ログ」に追記する。

```
- <コミットハッシュ>（<変更内容の要約>）
```

agent が PR 経路に切り替えた場合（main が保護されている）は、コミットハッシュの代わりに
PR の URL を記録し、**マージが必要であることをユーザーに伝える**。エージェントはマージしない。

push 失敗（競合）の場合はユーザーに報告して再実行を促す。

steering はローカル限定（gitignore）のため、この記録はエージェントの worktree ではなく
**本体の作業ツリーで Claude が直接書く**。
