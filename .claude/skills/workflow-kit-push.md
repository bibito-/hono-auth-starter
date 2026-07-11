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

対象ファイル一覧は [`.claude/manifests/workflow-kit-files.txt`](../manifests/workflow-kit-files.txt)（1行1パス。末尾が`/`の行はディレクトリ配下を再帰対象とする）を単一の正とする。これ以外（impl/review agent 定義・スタック依存の docs/rules・specs/steering 等）は対象外。

このマニフェスト自身と push/pull スキル本体もマニフェストに含める（同期機構の自己ホスト）。含めないと、機構を改善しても配布先には古いスキルが残り、SHA ガードが素通りする。

> **`workflow-kit-base.txt` は絶対にマニフェストに載せない。** これはプロジェクトごとの同期状態であり、配布すると全プロジェクトの base SHA が上書きされてガードが壊れる。`.claude/manifests/` をディレクトリ行（末尾 `/`）で指定しないこと。ファイルを個別に列挙する。

> マニフェストを増減させたときは、`claude-workflow-kit` の README.md（core/template 切り分け表）も合わせて更新すること。

## 同期基準（base SHA）

`.claude/manifests/workflow-kit-base.txt` に、このプロジェクトの core が最後に同期した claude-workflow-kit のコミット SHA を1行だけ記録する。

push 時にこの SHA が kit の `origin/main` と一致しなければ、このプロジェクトは kit の最新を取り込んでいない。そのまま push すると他プロジェクトが反映済みの変更を巻き戻す（ロストアップデート）。

これは誤操作を防ぐためのガードであり、不正を防ぐものではない（`base.txt` を手で書き換えれば素通りする）。バイパス不能な強制は kit リポジトリ側の CI / branch protection でしか実現できない。

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

### Step 3: クローンの一致確認と base SHA 検証

```bash
cd ../claude-workflow-kit && git fetch origin main -q
git rev-parse HEAD origin/main
```

**3-a. クローンが `origin/main` と完全一致しているか確認する。**

`HEAD` != `origin/main` なら push せずに終了し、状況を報告する。

| 状態 | 判定方法 | 対応 |
|---|---|---|
| behind | `HEAD` が `origin/main` の祖先 | `git pull origin main` で更新してからやり直す |
| ahead | `origin/main` が `HEAD` の祖先 | クローンに未 push のコミットがある。内容を報告してユーザーの判断を仰ぐ（勝手に push しない） |
| diverged | どちらも祖先でない | 自動 rebase/merge はせず報告して終了する |

> 旧版は `git merge-base --is-ancestor origin/main HEAD` だけで判定していたが、これは ahead を "up-to-date" と誤判定する。その状態で `git push origin main` すると、素性不明のローカルコミットまで一緒に送ってしまう。完全一致で判定すること。

**3-b. base SHA を検証する。**

コピー元プロジェクト側の `.claude/manifests/workflow-kit-base.txt` を読み、kit の `origin/main` SHA と比較する。

```bash
base_sha=$(cat .claude/manifests/workflow-kit-base.txt 2>/dev/null || echo "")
```

**ファイルが存在しない場合は不一致として扱う。** base SHA は配布対象外なので、core を導入した直後のプロジェクトには存在しない。エラーで停止させず、未同期とみなして pull に作らせる。

不一致なら **push せずに終了し、先に `/workflow-kit-pull` を実行するよう案内する。**

一致していれば Step 4 へ進む。

### Step 4: 変更ファイルをコピーする

コピー元プロジェクトの該当ファイルを、claude-workflow-kit 側の同一パスへ上書きコピーする。

> **`<path>` はマニフェストの行そのもの**（リポジトリルート相対。`.claude/hooks/guard-rm-rf.js` のように
> 既に `.claude/` を含む）。kit 側も同じ構成のため、そのまま連結する。
> `../claude-workflow-kit/.claude/<path>` と書くと `.claude/` が二重になる。また core には
> `.github/workflows/workflow-kit-pull-check.yml` も含まれ、これは `.claude/` 配下ではない。

```bash
cp <path> ../claude-workflow-kit/<path>
```

### Step 5: プロジェクト固有の内容が紛れていないか確認する

コピーしたファイルを読み、コピー元プロジェクト固有の値（絶対パス・プロジェクト名・機能名の実例等）が残っていないか確認する。`documentation-guide.md` のような例示目的の固有名は許容するが、動作に影響する固定値（ハードコードされたリポジトリパス等）は汎用化してから進める。

補助として、スタック固有語が混入していないか grep する。ヒットしても自動拒否はせず、例示目的か動作依存かを判断する。

```bash
grep -rniE 'wrangler|cloudflare|supabase|\bhono\b' <コピーしたファイル>
```

### Step 6: コミットして push する

対象ファイルのみを `git add` する（他の未コミット変更を巻き込まない）。

```bash
git add .claude/<変更ファイルのみ列挙>
git commit -m "<変更内容の要約（日本語）>"
git push origin main
```

push 失敗（競合）の場合はエラーをそのまま報告する。

### Step 7: base SHA を更新する

push 直後の claude-workflow-kit の HEAD SHA を取得し、コピー元プロジェクトの `.claude/manifests/workflow-kit-base.txt` に1行で書き戻す。

```bash
git -C ../claude-workflow-kit rev-parse HEAD
```

このファイルはコピー元プロジェクト側の `.claude/` 配下なので、コミット・push は doc-push-agent に委譲する（対象ファイルを明示列挙する）。

これを忘れると次回 push が必ず弾かれる（base が古いままになるため）。

### Step 8: 完了報告

push したコミットハッシュと、更新後の base SHA を報告する。コピー元プロジェクト側の `steering/current.md` への記録は不要（claude-workflow-kit 側の commit history が記録そのもの）。
