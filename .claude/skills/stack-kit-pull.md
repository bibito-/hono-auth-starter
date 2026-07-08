# stack-kit-pull スキル

[hono-auth-starter](https://github.com/bibito-/hono-auth-starter)（Hono+Supabase スタックの正）に入った変更を、このプロジェクト（または同じスタックを採用した兄弟プロジェクト）に取り込む手順。`/stack-kit-push` の逆方向。`/workflow-kit-pull`（core 層向け）のスタック版。

## 位置づけ

```
hono-auth-starter（スタックの正）─→ diffを提示 → 承認後に取り込み → ai-todo / hono-user-point / 他 Hono+Supabase 系プロジェクト
```

hono-auth-starter 自身はこの手順を実行する必要がない（自分自身がスタックの正のため）。同様に `stack-kit-base.txt` も持たない。

## スタックの範囲

[`.claude/manifests/stack-kit-files.txt`](../manifests/stack-kit-files.txt) を単一の正として参照する（[stack-kit-push.md](./stack-kit-push.md)と共通）。増減があればマニフェストを更新する。

マニフェスト自身と push/pull スキル本体もマニフェストに含まれる（同期機構の自己ホスト）。`stack-kit-base.txt` は含めない（プロジェクトごとの同期状態のため）。

## 呼び出し方

```
/stack-kit-pull
```

引数なし。スタック範囲ファイル全件をチェックする。

## 実行手順

**Main が直接実行する。doc-push-agent は最終コミット・push のみ担当する。**

### Step 1: hono-auth-starter を最新化する

```bash
ls ../hono-auth-starter 2>/dev/null || gh repo clone bibito-/hono-auth-starter ../hono-auth-starter
cd ../hono-auth-starter && git fetch origin main -q
git rev-parse HEAD origin/main
```

`HEAD` != `origin/main` の場合の扱いは [stack-kit-push.md](./stack-kit-push.md) の Step 3-a と同じ（behind なら `git pull origin main`、ahead / diverged なら報告して終了）。

`../hono-auth-starter` は現在のプロジェクトルート（`git rev-parse --show-toplevel`）から見た兄弟ディレクトリ。固定の絶対パスにはしないこと。

### Step 2: マニフェスト自身の差分を先に処理する

`stack-kit-files.txt` に差分がある場合、**先にこれを取り込んでから** Step 3 の全件 diff を行う。

```bash
diff ../hono-auth-starter/.claude/manifests/stack-kit-files.txt .claude/manifests/stack-kit-files.txt
```

古いマニフェストのまま全件 diff すると、kit 側で新たにスタック層に加わったファイルが対象一覧に載らず、見落とす。

### Step 3: スタック範囲の各ファイルを diff する

更新後のマニフェストに列挙された各ファイルについて、hono-auth-starter 側と現在のプロジェクト側を比較する。

```bash
diff ../hono-auth-starter/.claude/<path> .claude/<path>
```

- 差分なし → スキップ
- hono-auth-starter 側にのみ存在（新規追加されたスタックファイル）→ 「新規取り込み候補」として扱う
- 現在のプロジェクト側にのみ存在 → スタック範囲外か、まだ `/stack-kit-push` していない変更の可能性がある。取り込み対象外として報告するのみ（削除しない）。`/stack-kit-push` での反映を検討するよう案内する

### Step 4: 差分をユーザーに提示する

差分があったファイルの一覧と変更内容の要約を提示し、取り込んでよいか確認する。

### Step 5: 承認されたファイルをローカルに適用する

```bash
cp ../hono-auth-starter/.claude/<path> .claude/<path>
```

まだコミットはしない。

### Step 6: base SHA を更新する

hono-auth-starter の `origin/main` SHA を `.claude/manifests/stack-kit-base.txt` に1行で書き込む。

ファイルが存在しなければ新規作成する。base SHA は配布対象外なので、スタック層を導入した直後のプロジェクトには存在せず、この Step が唯一の生成契機になる。

```bash
git -C ../hono-auth-starter rev-parse origin/main
```

**差分が1件もなかった場合も更新する。** 「取り込むものが無かった」＝「最新に追いついている」であり、base を進めないと以降の push が不必要に弾かれ続ける。

### Step 7: doc-push-agent に委譲してコミット・push する

`.claude/` の変更は既存ルール通り doc-push-agent に委譲する。対象ファイル（適用したファイル＋`stack-kit-base.txt`）を明示的に列挙し、他のファイルは触らせない。

### Step 8: 完了報告

push されたコミットハッシュと、更新後の base SHA を報告する。
