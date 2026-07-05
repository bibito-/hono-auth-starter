# workflow-kit-pull スキル

[claude-workflow-kit](https://github.com/bibito-/claude-workflow-kit) の core に入った変更を、このプロジェクト（または同じ core を採用した兄弟プロジェクト）に取り込む手順。`/workflow-kit-push` の逆方向。

## 位置づけ

```
claude-workflow-kit ─→ diffを提示 → 承認後に取り込み → ai-todo / hono-auth-starter / 他プロジェクト
```

CI/PR 自動配布は未実装のため、このスキルで手動 pull する。

## core の範囲

[workflow-kit-push.md](./workflow-kit-push.md) の「core の範囲」と同一。増減があれば両ファイルを同時に更新する。

## 呼び出し方

```
/workflow-kit-pull
```

引数なし。core ファイル全件をチェックする。

## 実行手順

**Main が直接実行する。doc-push-agent は最終コミット・push のみ担当する。**

### Step 1: claude-workflow-kit を最新化する

```bash
ls ../claude-workflow-kit 2>/dev/null || gh repo clone bibito-/claude-workflow-kit ../claude-workflow-kit
cd ../claude-workflow-kit && git fetch origin main -q
git merge-base --is-ancestor origin/main HEAD && git pull origin main -q || echo "diverged: kitクローンが手動変更されている可能性。要確認"
```

`../claude-workflow-kit` は現在のプロジェクトルート（`git rev-parse --show-toplevel`）から見た兄弟ディレクトリ。固定の絶対パスにはしないこと。

### Step 2: core 一覧の各ファイルを diff する

`workflow-kit-push.md` の「core の範囲」一覧に列挙された各ファイルについて、kit 側と現在のプロジェクト側を比較する。

```bash
diff ../claude-workflow-kit/.claude/<path> .claude/<path>
```

- 差分なし → スキップ
- kit 側にのみ存在（新規追加された core ファイル）→ 「新規取り込み候補」として扱う
- 現在のプロジェクト側にのみ存在 → core 範囲外か、まだ `/workflow-kit-push` していない変更の可能性がある。取り込み対象外として報告するのみ（削除しない）。`/workflow-kit-push` での反映を検討するよう案内する

### Step 3: 差分をユーザーに提示する

差分があったファイルの一覧と変更内容の要約を提示し、取り込んでよいか確認する。

### Step 4: 承認されたファイルをローカルに適用する

```bash
cp ../claude-workflow-kit/.claude/<path> .claude/<path>
```

まだコミットはしない。

### Step 5: doc-push-agent に委譲してコミット・push する

`.claude/` の変更は既存ルール通り doc-push-agent に委譲する。対象ファイルを明示的に列挙し、他のファイルは触らせない。

### Step 6: 完了報告

push されたコミットハッシュを報告する。
