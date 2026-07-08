# workflow-kit-pull スキル

[claude-workflow-kit](https://github.com/bibito-/claude-workflow-kit) の core に入った変更を、このプロジェクト（または同じ core を採用した兄弟プロジェクト）に取り込む手順。`/workflow-kit-push` の逆方向。

## 位置づけ

```
claude-workflow-kit ─→ diffを提示 → 承認後に取り込み → ai-todo / hono-auth-starter / 他プロジェクト
```

CI/PR 自動配布は未実装のため、このスキルで手動 pull する。

## core の範囲

[`.claude/manifests/workflow-kit-files.txt`](../manifests/workflow-kit-files.txt) を単一の正として参照する（[workflow-kit-push.md](./workflow-kit-push.md)と共通）。増減があればマニフェストを更新する。

マニフェスト自身と push/pull スキル本体もマニフェストに含まれる（同期機構の自己ホスト）。`workflow-kit-base.txt` は含めない（プロジェクトごとの同期状態のため）。

`.github/workflows/workflow-kit-pull-check.yml` もマニフェストに含まれる。ただし CI はこれを適用できない（`GITHUB_TOKEN` は `.github/workflows/` の作成・更新を拒否し、自動PRの push が `remote rejected` になる）。CI は差分があることを `::warning::` で知らせるだけで、実際の取り込みはこのスキルを人間が実行したときに行われる。

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
git rev-parse HEAD origin/main
```

`HEAD` != `origin/main` の場合の扱いは [workflow-kit-push.md](./workflow-kit-push.md) の Step 3-a と同じ（behind なら `git pull origin main`、ahead / diverged なら報告して終了）。

`../claude-workflow-kit` は現在のプロジェクトルート（`git rev-parse --show-toplevel`）から見た兄弟ディレクトリ。固定の絶対パスにはしないこと。

### Step 2: マニフェスト自身の差分を先に処理する

`workflow-kit-files.txt` に差分がある場合、**先にこれを取り込んでから** Step 3 の全件 diff を行う。

```bash
diff ../claude-workflow-kit/.claude/manifests/workflow-kit-files.txt .claude/manifests/workflow-kit-files.txt
```

古いマニフェストのまま全件 diff すると、kit 側で新たに core に加わったファイルが対象一覧に載らず、見落とす。

### Step 3: core 一覧の各ファイルを diff する

更新後のマニフェストに列挙された各ファイルについて、kit 側と現在のプロジェクト側を比較する。

```bash
diff ../claude-workflow-kit/.claude/<path> .claude/<path>
```

- 差分なし → スキップ
- kit 側にのみ存在（新規追加された core ファイル）→ 「新規取り込み候補」として扱う
- 現在のプロジェクト側にのみ存在 → core 範囲外か、まだ `/workflow-kit-push` していない変更の可能性がある。取り込み対象外として報告するのみ（削除しない）。`/workflow-kit-push` での反映を検討するよう案内する

### Step 4: 差分をユーザーに提示する

差分があったファイルの一覧と変更内容の要約を提示し、取り込んでよいか確認する。

### Step 5: 承認されたファイルをローカルに適用する

```bash
cp ../claude-workflow-kit/.claude/<path> .claude/<path>
```

まだコミットはしない。

### Step 6: base SHA を更新する

kit の `origin/main` SHA を `.claude/manifests/workflow-kit-base.txt` に1行で書き込む。

ファイルが存在しなければ新規作成する。base SHA は配布対象外なので、core を導入した直後のプロジェクトには存在せず、この Step が唯一の生成契機になる。

```bash
git -C ../claude-workflow-kit rev-parse origin/main
```

**差分が1件もなかった場合も更新する。** 「取り込むものが無かった」＝「最新に追いついている」であり、base を進めないと以降の push が不必要に弾かれ続ける。

### Step 7: doc-push-agent に委譲してコミット・push する

`.claude/` の変更は既存ルール通り doc-push-agent に委譲する。対象ファイル（適用したファイル＋`workflow-kit-base.txt`）を明示的に列挙し、他のファイルは触らせない。

### Step 8: 完了報告

push されたコミットハッシュと、更新後の base SHA を報告する。
