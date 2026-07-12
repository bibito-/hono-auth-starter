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

`.github/workflows/workflow-kit-pull-check.yml` もマニフェストに含まれる。ただし CI はこれを適用できない（`GITHUB_TOKEN` は `.github/workflows/` の作成・更新を拒否し、自動PRの push が `remote rejected` になる）。CI は差分があることを `::warning::` で知らせるだけで、実際の取り込みはこのスキルの手動実行時に行われる。

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
git -C ../claude-workflow-kit config core.hooksPath .githooks
cd ../claude-workflow-kit && git fetch origin main -q
git rev-parse HEAD origin/main
```

`HEAD` != `origin/main` の場合の扱いは [workflow-kit-push.md](./workflow-kit-push.md) の Step 3-a と同じ（behind なら `git pull origin main`、ahead / diverged なら報告して終了）。

`../claude-workflow-kit` は現在のプロジェクトルート（`git rev-parse --show-toplevel`）から見た兄弟ディレクトリ。固定の絶対パスにはしないこと。

`core.hooksPath` は kit の `.githooks` を指定する。値を同じものに設定し直すだけなので、新規 clone・既存 clone のどちらでも冪等である。

### Step 2: マニフェスト自身の差分を先に処理する

`workflow-kit-files.txt` に差分がある場合、**先にこれを取り込んでから** Step 3 の全件 diff を行う。

```bash
diff ../claude-workflow-kit/.claude/manifests/workflow-kit-files.txt .claude/manifests/workflow-kit-files.txt
```

古いマニフェストのまま全件 diff すると、kit 側で新たに core に加わったファイルが対象一覧に載らず、見落とす。

### Step 3: core 一覧の各ファイルを diff する

更新後のマニフェストに列挙された各ファイルについて、kit 側と現在のプロジェクト側を比較する。

> **`<path>` はマニフェストの行そのもの**（リポジトリルート相対。`.claude/hooks/guard-rm-rf.js` のように
> 既に `.claude/` を含む）。kit 側も同じ構成のため、`../claude-workflow-kit/<path>` と連結する。
> `../claude-workflow-kit/.claude/<path>` と書くと `.claude/` が二重になる。また core には
> `.github/workflows/workflow-kit-pull-check.yml` も含まれ、これは `.claude/` 配下ではない。

```bash
diff ../claude-workflow-kit/<path> <path>
```

`diff` は差の有無しか返さず、kit とプロジェクトのどちらが新しいかを判別できない。単純に kit で上書きすると、プロジェクト側が先行しているファイルを巻き戻す。

そこで `workflow-kit-base.txt` に記録した SHA を**共通祖先**として三方向比較する。祖先のブロブは kit クローンから取得する。

```bash
git -C ../claude-workflow-kit fetch --depth=1 origin "$(cat .claude/manifests/workflow-kit-base.txt)"
git -C ../claude-workflow-kit show "<base_sha>:<path>"
```

| 祖先 | kit | project | 判定 | 対応 |
|---|---|---|---|---|
| A | A | A | 差分なし | スキップ |
| A | B | A | kit のみ変更 | 取り込む |
| A | A | B | project のみ変更 | 取り込まない。`/workflow-kit-push` を案内する |
| A | B | C | 双方変更 | 取り込まない。差分を提示して判断を仰ぐ |

その他の扱い:

- kit 側にのみ存在（祖先に無い）→ kit で新規追加された core ファイル。取り込む
- 祖先に無いが双方に存在し内容が異なる → 「kit の新規追加」と「project の独自作成」を内容では区別できない。双方変更と同様に取り込まず、両側の追加コミット（`git log --diff-filter=A -1 -- <path>`）を添えて判断を仰ぐ
- プロジェクト側にのみ存在 → core 範囲外か未 push の変更。取り込み対象外として報告するのみ（削除しない）
- 祖先を取得できない（base 未設定・force-push で消えた等）→ 方向判別できないため適用しない

### Step 4: 差分をユーザーに提示する

差分があったファイルの一覧と変更内容の要約を提示し、取り込んでよいか確認する。

### Step 5: 承認されたファイルをローカルに適用する

```bash
cp ../claude-workflow-kit/<path> <path>
```

まだコミットはしない。

### Step 5-b: フック登録を settings.json にマージする

```bash
node .claude/scripts/merge-hook-registrations.cjs
```

`settings.json` は配布できない（プロジェクトごとに permissions・MCP 設定が異なり、上書きすると壊れる）。しかし登録が無ければ、配られたフックは**一度も発火しない**。発火しないゲートは無いより悪い（効いていると思い込むため）。

このスクリプトは `.claude/manifests/hook-registrations.json` の宣言を読み、`settings.json` に**不足している登録だけを追記する**。既存エントリの変更・削除・並べ替えはせず、プロジェクト独自のフック登録にも触れない。冪等。

`--check` を付けると書き込まず、不足があれば exit 1 で報告する。

> `settings.json` の変更をコミットする前に、必ず差分をユーザーに提示して承認を得ること。

### Step 6: base SHA を更新する

kit の `origin/main` SHA を `.claude/manifests/workflow-kit-base.txt` に1行で書き込む。

ファイルが存在しなければ新規作成する。base SHA は配布対象外なので、core を導入した直後のプロジェクトには存在せず、この Step が唯一の生成契機になる。

```bash
git -C ../claude-workflow-kit rev-parse origin/main
```

**差分が1件もなかった場合も更新する。** 「取り込むものが無かった」＝「最新に追いついている」であり、base を進めないと以降の push が不必要に弾かれ続ける。

ただし**取り込み切れなかったファイルが1つでもある場合は base を進めてはならない**（双方変更・祖先不明・保留したファイルがある場合）。進めると共通祖先が kit と一致し、未取り込みのファイルが次回から「project が先行」と誤分類されて永久に同期されなくなる。

例外として、Step 4 で差分を確認したうえで解決方針が決まった場合（kit 側を採用する／プロジェクト側を維持して後で push する）は、その判断をもって base を進めてよい。CI は自動実行のため常に進めない。この例外が無いと、双方変更のファイルが存在する間は base を進められず、push ガードも base 不一致で弾き続けるため、どちらにも進めなくなる。

### Step 7: doc-push-agent に委譲してコミット・push する

`.claude/` の変更は既存ルール通り doc-push-agent に委譲する。対象ファイル（適用したファイル＋`workflow-kit-base.txt`）を明示的に列挙し、他のファイルは触らせない。

### Step 8: 完了報告

push されたコミットハッシュと、更新後の base SHA を報告する。
