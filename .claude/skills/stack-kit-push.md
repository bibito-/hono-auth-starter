# stack-kit-push スキル

このプロジェクト（および同じ Hono+Supabase スタックを採用した兄弟プロジェクト）で `.claude/` の**スタック層**（Hono+Supabase 固有の実装ルール・専任 agent 定義）に変更が入ったとき、[hono-auth-starter](https://github.com/bibito-/hono-auth-starter) へ直接 push して反映する手順。`/workflow-kit-push`（core 層向け）のスタック版。

## 位置づけ

```
ai-todo（実験場）─┐
hono-user-point   ├─ スタック層の変更を都度 push ─→ hono-auth-starter（スタックの正）
（他 Hono+Supabase 系プロジェクト）─┘
```

hono-auth-starter は GitHub Template repository として新規プロジェクト作成時の一括取り込み元（[extract-template.md](./extract-template.md) 参照）であると同時に、作成後も継続的に同期する対象ファイル群の正（source of truth）を兼ねる。

core（`workflow-kit-push`/`workflow-kit-pull` が対象とする `claude-workflow-kit`）とスタック層（本スキルが対象とする `hono-auth-starter`）は対象ファイルが完全に排他的なため、同一プロジェクト内で両方の仕組みを運用しても衝突しない。

## スタック（Hono+Supabase）の範囲（単一の正）

対象ファイル一覧は [`.claude/manifests/stack-kit-files.txt`](../manifests/stack-kit-files.txt)（1行1パス）を単一の正とする。これ以外（`docs/features/`・`docs/migrations/`・`specs/`・`steering/` などプロジェクト固有の実装記録）は対象外。

このマニフェスト自身と push/pull スキル本体もマニフェストに含める（同期機構の自己ホスト）。含めないと、機構を改善しても配布先には古いスキルが残り、SHA ガードが素通りする。

> **`stack-kit-base.txt` は絶対にマニフェストに載せない。** これはプロジェクトごとの同期状態であり、配布すると全プロジェクトの base SHA が上書きされてガードが壊れる。`.claude/manifests/` をディレクトリ行（末尾 `/`）で指定しないこと。ファイルを個別に列挙する。

> マニフェストを増減させたときは、`claude-workflow-kit` の README.md（core/template 切り分け表）も合わせて更新すること。

## 同期基準（base SHA）

`.claude/manifests/stack-kit-base.txt` に、このプロジェクトのスタック層が最後に同期した hono-auth-starter のコミット SHA を1行だけ記録する。

push 時にこの SHA が `origin/main` と一致しなければ、このプロジェクトは最新を取り込んでいない。そのまま push すると他プロジェクトが反映済みの変更を巻き戻す（ロストアップデート）。

hono-auth-starter は Template repository を兼ねるため、古い内容で上書きされると **これから template から作られる新規プロジェクト全部**が初期状態としてそれを受け取る。pull 時の diff 承認という関門が効かない経路であり、core より被害範囲が大きい。

hono-auth-starter 自身は `stack-kit-base.txt` を持たない（自分がスタックの正であり、比較相手が存在しないため）。core については pull する側なので `workflow-kit-base.txt` は持つ。

push 側のこの検証は誤操作を防ぐ第一関門であり、それ自体は不正を防がない（`base.txt` を手で書き換えれば素通りする）。バイパス不能な強制は kit 側にある。kit の main は ruleset `protect-main`（bypass 空・PR 必須）で保護され、`kit-push-guard` CI が PR のコミットに埋めた `Stack-Kit-Base:` トレーラを kit の main HEAD と照合する（2026-07-12 導入）。push 側の base SHA は、この**トレーラとして kit へ渡すための値**でもある。

## 呼び出し方

```
/stack-kit-push <変更したファイルの説明>
```

**例:**
```
/stack-kit-push supabase-auth-rules.md にonAuthStateChangeのデッドロック回避策を追記
/stack-kit-push client-review-agentのレビュー観点にaria属性チェックを追加
```

## 実行手順

**Main が直接実行する（doc-push-agent には委譲しない）。** doc-push-agent の worktree 隔離は同一リポジトリ内での push を前提にしており、hono-auth-starter は別リポジトリのクローンのため、そのモデルに乗らない。

### Step 1: 変更ファイルがスタック範囲か確認する

引数で指定された変更ファイルを、上記「スタック（Hono+Supabase）の範囲」一覧と照合する。範囲外なら「スタック対象外のためpush不要」と報告して終了する。core 範囲（`workflow-kit-push.md` 参照）に該当する場合はそちらを使うよう案内する。

### Step 2: hono-auth-starter のクローンを確認する

```bash
ls ../hono-auth-starter 2>/dev/null || gh repo clone bibito-/hono-auth-starter ../hono-auth-starter
```

`../hono-auth-starter` は現在のプロジェクトルート（`git rev-parse --show-toplevel`）から見た兄弟ディレクトリ。固定の絶対パスにはしないこと。

### Step 3: クローンの一致確認と base SHA 検証

```bash
cd ../hono-auth-starter && git fetch origin main -q
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

コピー元プロジェクト側の `.claude/manifests/stack-kit-base.txt` を読み、`origin/main` SHA と比較する。

```bash
base_sha=$(cat .claude/manifests/stack-kit-base.txt 2>/dev/null || echo "")
```

**ファイルが存在しない場合は不一致として扱う。** base SHA は配布対象外なので、スタック層を導入した直後のプロジェクトには存在しない。エラーで停止させず、未同期とみなして pull に作らせる。

不一致なら **push せずに終了し、先に `/stack-kit-pull` を実行するよう案内する。**

一致していれば Step 4 へ進む。

### Step 4: 変更ファイルをコピーする

> **`<path>` はマニフェストの行そのもの**（リポジトリルート相対。`.claude/agents/client-impl-agent.md` のように
> 既に `.claude/` を含む）。hono-auth-starter 側も同じ構成のため、そのまま連結する。
> `../hono-auth-starter/.claude/<path>` と書くと `.claude/` が二重になる。またスタック範囲には
> `.github/workflows/stack-kit-pull-check.yml` も含まれ、これは `.claude/` 配下ではない。

```bash
cp <path> ../hono-auth-starter/<path>
```

### Step 5: プロジェクト固有の内容が紛れていないか確認する

コピーしたファイルを読み、コピー元プロジェクト固有の値（プロジェクト名・機能名の実例・そのプロジェクト限定の業務ロジックなど）が残っていないか確認する。Hono+Supabase スタック全般に通用する内容かどうかを基準に判断する。

補助として、プロジェクト名・固有機能名が混入していないか grep する。ヒットしても自動拒否はせず、例示目的か動作依存かを判断する。

```bash
grep -rniE 'ai-todo|hono-user-point|cloudflare-actions' <コピーしたファイル>
```

> core 側の grep と対象語が異なる点に注意。スタック層は `hono` / `supabase` を含んで当然であり、弾くべきなのは**プロジェクト固有名**のみ。

### Step 5-b: rules がコードの構造に言及していないか確認する

`docs/rules/` のファイルを push するときは、**そこに書かれたコードの構造（定数名・関数名・設定キー）が hono-auth-starter の `src/` に実在するか**を確認する。

```bash
grep -nE '`[A-Z_]{3,}`|`[a-z][a-zA-Z]+\(\)`' <コピーしたファイル>   # 定数名・関数名の言及を拾う
grep -rn '<拾った識別子>' ../hono-auth-starter/src/                  # starter のコードに実在するか
```

存在しなければ push しない。コピー元プロジェクトだけで進化したコードの説明であり、そのまま流すとドキュメントだけが同期されコードが追随しない状態になる。

対応は次のどちらか。**rules を書き戻してはならない**（コピー元の rules は自分のコードと一致しているため、書き戻すと同一パスのファイルが両リポジトリで別々に正しくなり、pull/push のたびに往復する）。

- コード側を hono-auth-starter へ移植して構造を収束させる（推奨。starter はテンプレの正なので新規プロジェクトが良い設計を継げる）
- rules から実装詳細への言及を外し、構造に依存しない記述にする

> 実例（2026-07-11）: `local-dev-rules.md` が `LOCAL_ORIGINS` と `vars.PROD_VERCEL_ORIGIN` を説明していたが、hono-auth-starter の `src/server/cors.ts` は `ALLOWED_ORIGINS`（本番オリジン直書き）のままだった。ドキュメントだけが同期され、コードが追随していなかった。`src/` は stack-kit の同期対象ではない（プロジェクト固有）ため、**コードの実装詳細に踏み込んだ rules は構造的に必ず乖離する**。この関門が唯一の検出手段になる。

### Step 6: ブランチを切って PR を作る

kit の main は ruleset `protect-main` で保護されており直 push できない。PR 経路で反映する。

対象ファイルのみを `git add` する（他の未コミット変更を巻き込まない）。コミットには **`Stack-Kit-Base:` トレーラ**を必ず含める。値は Step 3-b で一致を確認した base SHA（= kit の main HEAD）。kit 側の `kit-push-guard` がこれを main HEAD と照合し、欠落・不一致なら PR を落とす。

```bash
cd ../hono-auth-starter
git switch -c kit-push/$(date +%Y%m%d)-<要約>
git add <変更ファイルのみ列挙>
git commit -m "$(cat <<'EOF'
<変更内容の要約（日本語）>

Stack-Kit-Base: <base SHA>
EOF
)"
git push -u origin kit-push/$(date +%Y%m%d)-<要約>
gh pr create --base main --title "<変更内容の要約>" --body "スタック層の同期"
```

追加行が禁止語（`ai-todo|hono-user-point|cloudflare-actions`）にヒットするが、それが**言及であって依存ではない**場合（禁止語パターンの定義そのもの・位置づけ図での consumer 列挙など）は、コミットに `Kit-Grep-Mention: <理由>` トレーラを足す。理由が空だと落ちる。これは例外を通す口ではなく「この語は言及であって依存ではない」と表明するもの。

### Step 7: CI green を確認してマージを依頼する

`gh pr checks <PR番号>` で `kit-push-guard` が green になったことを確認する。

**マージはユーザーが実行する。Claude はマージしない。** 事故の最終的な検知手段は「他人の変更を消す hunk が diff に見える」ことであり、自動マージするとその diff を誰も見ないまま通る。`gh pr merge <PR番号> --squash` をユーザーに依頼する。

CI が赤い場合は、落ちた検査（鮮度 / 混入）と CI の出力をそのまま報告して終了する。勝手に base.txt を書き換えて通そうとしないこと。

### Step 8: base SHA を更新する

**マージ後に実行する。** 取得する SHA は「push 直後の HEAD」ではなく「**マージ後の kit の main HEAD**」なので、コピー元プロジェクトの `.claude/manifests/stack-kit-base.txt` に書き戻す。

```bash
git -C ../hono-auth-starter fetch origin main -q && git -C ../hono-auth-starter rev-parse origin/main
```

このファイルはコピー元プロジェクト側の `.claude/` 配下なので、コミット・push は doc-push-agent に委譲する（対象ファイルを明示列挙する）。

これを忘れると次回 push が必ず弾かれる（base が古いままになるため）。

### Step 9: 完了報告

マージされた PR 番号と、更新後の base SHA を報告する。
