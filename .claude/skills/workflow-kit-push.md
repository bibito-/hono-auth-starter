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

push 側のこの検証は誤操作を防ぐ第一関門であり、それ自体は不正を防がない（`base.txt` を手で書き換えれば素通りする）。バイパス不能な強制は kit 側にある。kit の main は ruleset `protect-main`（bypass 空・PR 必須）で保護され、`kit-push-guard` CI が PR のコミットに埋めた `Workflow-Kit-Base:` トレーラを kit の main HEAD と照合する（2026-07-12 導入）。push 側の base SHA は、この**トレーラとして kit へ渡すための値**でもある。

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
git -C ../claude-workflow-kit config core.hooksPath .githooks
```

`../claude-workflow-kit` は現在のプロジェクトルート（`git rev-parse --show-toplevel`）から見た兄弟ディレクトリ。固定の絶対パスにはしないこと。

2行目は kit 側の Git-level `pre-push` を有効化する。値を同じ `.githooks` に設定し直すだけなので、新規 clone・既存 clone のどちらでも冪等である。

### Step 3: クローンの一致確認と base SHA 検証

```bash
git -C ../claude-workflow-kit fetch origin main -q
git -C ../claude-workflow-kit rev-parse HEAD origin/main
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

### Step 5: kit-push-review-agent で審査を受ける

コピー元プロジェクト固有の内容が紛れていないかを、専任エージェント `kit-push-review-agent` に審査させる。agent は文意レベルで「この手順文や構成はスタック非依存の core として汎用か、それとも特定プロジェクトの都合が混ざっているか」を判断する（grep では表現できない線引き）。

```bash
/kit-push-review-agent \
  kit_path="../claude-workflow-kit" \
  universality_criterion="スタック非依存であること。特定のフレームワーク・BaaS・ランタイムに依存する記述は core に置けない。加えてコピー元プロジェクト固有の値（絶対パス・プロジェクト名・機能名の実例）も混入とみなす。ただし例示目的の言及・位置づけ図での consumer 列挙は許容する" \
  exclusion_list="<コピー元プロジェクトのディレクトリ名>,<親ワークスペースのディレクトリ名>,<同居する兄弟プロジェクトのディレクトリ名>"
```

> `exclusion_list` の実際の値をこのスキルに直書きしないこと。このスキル自身が配布物であり、名前は配布先ごとに違う。加えて具体名を書くと kit 側 CI の混入 grep に当たる。起動時にプロジェクトの実名へ展開する。

agent が `clean` verdict を出すまで、Step 6 へ進めない。**`guard-kit-push-verdict.cjs` フックが `git push` をブロックするため、これは推奨ではなく強制である。**

agent が `contaminated` と判定した場合、指摘を読んで対応する。誤検知だと考える場合は、反論理由を添えて agent を再起動する。裁定者は常にこのエージェント（メイン Claude は verdict を自分で書けない設計のため）。

### Step 6: ブランチを切って PR を作る

kit の main は ruleset `protect-main` で保護されており直 push できない。PR 経路で反映する。

対象ファイルのみを `git add` する（他の未コミット変更を巻き込まない）。コミットには **`Workflow-Kit-Base:` トレーラ**を必ず含める。値は Step 3-b で一致を確認した base SHA（= kit の main HEAD）。kit 側の `kit-push-guard` がこれを main HEAD と照合し、欠落・不一致なら PR を落とす。

> `-C` フラグを使い、コマンド文字列に kit パスを明示することで、フックが push 対象を正しく識別できるようにする。`cd <path>` だけでは、push のコマンド文字列に kit が現れず、フックが kit への push だと識別できない。

```bash
git -C ../claude-workflow-kit switch -c kit-push/$(date +%Y%m%d)-<要約>
git -C ../claude-workflow-kit add <変更ファイルのみ列挙>
git -C ../claude-workflow-kit commit -m "$(cat <<'EOF'
<変更内容の要約（日本語）>

Workflow-Kit-Base: <base SHA>
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
# トレーラが認識されているか push 前に確認する（空なら CI が必ず落ちる）
git -C ../claude-workflow-kit log -1 --format='[%(trailers:key=Workflow-Kit-Base,valueonly)]'
git -C ../claude-workflow-kit push -u origin kit-push/$(date +%Y%m%d)-<要約>
gh pr create -R bibito-/claude-workflow-kit --base main --title "<変更内容の要約>" --body "core の同期"
```

> **トレーラ行の間に空行を入れないこと。** git はコミットメッセージの**最後の段落**だけをトレーラブロックとして解釈する。`Workflow-Kit-Base:` と `Co-Authored-By:` を空行で分けると、最後の段落（`Co-Authored-By:` だけ）がトレーラとみなされ、base トレーラは無かったことになる。CI は「トレーラ欠落」で落ちるが、コミットメッセージ上は行が見えているため原因に気付きにくい。上記の `git log -1 --format=...` が空でないことを push 前に確かめる。

追加行が禁止語（`wrangler|cloudflare|supabase|\bhono\b`）にヒットするが、それが**言及であって依存ではない**場合（禁止語パターンの定義そのもの・位置づけ図での consumer 列挙など）は、コミットに `Kit-Grep-Mention: <理由>` トレーラを足す。理由が空だと落ちる。これは例外を通す口ではなく「この語は言及であって依存ではない」と表明するもの。

### Step 7: CI green を確認してマージを依頼する

`gh pr checks <PR番号>` で `kit-push-guard` が green になったことを確認する。

**マージはユーザーが実行する。Claude はマージしない。** 事故の最終的な検知手段は「他人の変更を消す hunk が diff に見える」ことであり、自動マージするとその diff を誰も見ないまま通る。`gh pr merge <PR番号> --squash` をユーザーに依頼する。

CI が赤い場合は、落ちた検査（鮮度 / 混入）と CI の出力をそのまま報告して終了する。勝手に base.txt を書き換えて通そうとしないこと。

`kit-push-guard` は **PR の HEAD コミットのトレーラしか見ない**。修正のために新しいコミットを積むと HEAD が入れ替わり、トレーラが失われて今度は「トレーラ欠落」で落ちる。同じ PR 内で直す限り赤いままになる。

**修正は必ず `git commit --amend` で積むこと。** 新しいコミットを重ねてはならない。

```bash
# 修正を加えたあと
git -C ../claude-workflow-kit add <修正したファイル>
git -C ../claude-workflow-kit commit --amend --no-edit   # トレーラを保ったまま HEAD を差し替える
git -C ../claude-workflow-kit push --force-with-lease
```

1コミット = 1回の同期、という単位を保つための制約でもある（トレーラは「このコピーがどの時点の kit 由来か」の表明なので、コミットが増えるとどれが正なのか決まらない）。

なお `--force-with-lease` は自分の PR ブランチに対してのみ。kit の main は ruleset `protect-main` で force push が禁止されており、そもそも通らない。

### Step 8: base SHA を更新する

**マージ後に実行する。** 取得する SHA は「push 直後の HEAD」ではなく「**マージ後の kit の main HEAD**」なので、コピー元プロジェクトの `.claude/manifests/workflow-kit-base.txt` に書き戻す。

```bash
git -C ../claude-workflow-kit fetch origin main -q && git -C ../claude-workflow-kit rev-parse origin/main
```

このファイルはコピー元プロジェクト側の `.claude/` 配下なので、コミット・push は doc-push-agent に委譲する（対象ファイルを明示列挙する）。

これを忘れると次回 push が必ず弾かれる（base が古いままになるため）。

### Step 9: 完了報告

マージされた PR 番号と、更新後の base SHA を報告する。コピー元プロジェクト側の `steering/current.md` への記録は不要（claude-workflow-kit 側の commit history が記録そのもの）。
