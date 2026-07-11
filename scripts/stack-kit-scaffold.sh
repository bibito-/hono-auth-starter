#!/usr/bin/env bash
# hono-auth-starter（Hono+Supabase スタックの正）の同期ループに、
# template 複製で作られたプロジェクトを結線するスクリプト。
#
# 使い方: 対象プロジェクトのルートで実行する
#   ../hono-auth-starter/scripts/stack-kit-scaffold.sh
#
# 実物コード（src/・package.json 等）は GitHub Template repository の複製が配る。
# このスクリプトが配るのは同期ループへの結線に必要なものだけ:
#   - stack マニフェスト記載ファイル（skill / command / agent / rules / CI）
#   - .claude/manifests/stack-kit-base.txt（複製では届かない。正が持たないため）
#
# ファイル配置とレポートのみを行い、git 操作（add/commit/push）は一切しない。
# 既存ファイルは上書きせずスキップし、最後に一覧報告する（再実行しても安全）。
set -euo pipefail

KIT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST_REL=".claude/manifests/stack-kit-files.txt"
MANIFEST="$KIT_ROOT/$MANIFEST_REL"
BASE_FILE=".claude/manifests/stack-kit-base.txt"

created=()
skipped_same=()
skipped_diff=()
gitignore_added=()
notes=()

# --- Step 1: 前提チェック ---

if ! toplevel="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "エラー: git リポジトリ内で実行してください（対象プロジェクトのルートで実行する）" >&2
  exit 1
fi
if [ "$toplevel" != "$(pwd -P)" ] && [ "$toplevel" != "$(pwd)" ]; then
  echo "エラー: リポジトリのルート（$toplevel）で実行してください" >&2
  exit 1
fi
if [ "$(pwd)" = "$KIT_ROOT" ]; then
  echo "エラー: kit リポジトリ自身には実行できません。対象プロジェクトのルートで実行してください" >&2
  exit 1
fi
if [ ! -f "$MANIFEST" ]; then
  echo "エラー: マニフェストが見つかりません: $MANIFEST" >&2
  exit 1
fi

echo "kit:    $KIT_ROOT"
echo "target: $(pwd)"
echo

# --- Step 2: ディレクトリ作成（冪等） ---

mkdir -p \
  .claude/agents \
  .claude/commands \
  .claude/docs/rules \
  .claude/manifests \
  .claude/rules \
  .claude/skills \
  .github/workflows

# --- Step 3: .gitignore 追記（行単位で冪等） ---

ensure_gitignore_line() {
  local line="$1"
  if ! grep -qxF "$line" .gitignore 2>/dev/null; then
    echo "$line" >>.gitignore
    gitignore_added+=("$line")
  fi
}

ensure_gitignore_line ".claude/steering/"
ensure_gitignore_line ".claude/worktrees/"
ensure_gitignore_line "/docs/"

# --- Step 4: マニフェスト記載ファイルのコピー ---

copy_file() {
  local rel="$1"
  local src="$KIT_ROOT/$rel"
  local dst="./$rel"
  if [ -e "$dst" ]; then
    if cmp -s "$src" "$dst"; then
      skipped_same+=("$rel")
    else
      skipped_diff+=("$rel")
    fi
  else
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    created+=("$rel")
  fi
}

while IFS= read -r line; do
  # 空行・コメント行はスキップ
  [ -z "$line" ] && continue
  case "$line" in \#*) continue ;; esac

  if [[ "$line" == */ ]]; then
    # ディレクトリ行: 配下の全ファイルを個別に同ロジックでコピー
    if [ ! -d "$KIT_ROOT/$line" ]; then
      notes+=("マニフェスト記載のディレクトリが kit に存在しません: $line")
      continue
    fi
    while IFS= read -r f; do
      copy_file "${f#"$KIT_ROOT"/}"
    done < <(find "$KIT_ROOT/$line" -type f | sort)
  else
    if [ ! -f "$KIT_ROOT/$line" ]; then
      notes+=("マニフェスト記載のファイルが kit に存在しません: $line")
      continue
    fi
    copy_file "$line"
  fi
done <"$MANIFEST"

# --- Step 5: base.txt 初期化 ---

# CI（stack-kit-pull-check.yml）は kit の origin/main を checkout して比較する。
# base は「その origin/main のどこまでを取り込み済みか」なので、
# ローカル作業ツリーの HEAD ではなく origin/main の SHA を書く。
kit_sha="$(git -C "$KIT_ROOT" rev-parse origin/main 2>/dev/null || true)"

if [ ${#skipped_diff[@]} -gt 0 ]; then
  # ここで base を書くと「kit の変更を取り込み済み」と誤認され、
  # 未取り込みの差分が翌回から local 判定に化けて永久に同期されなくなる。
  notes+=("kit と差分のある既存ファイルがあるため $BASE_FILE を書きません。/stack-kit-pull で差分を解決してから再実行してください")
elif [ -f "$BASE_FILE" ]; then
  notes+=("$BASE_FILE は既に存在するため上書きしません（現在: $(cat "$BASE_FILE")）")
elif [ -z "$kit_sha" ]; then
  notes+=("kit の origin/main を解決できないため $BASE_FILE を書きません。kit 側で git fetch origin してから再実行してください")
else
  echo "$kit_sha" >"$BASE_FILE"
  created+=("$BASE_FILE（kit origin/main: ${kit_sha:0:7}）")
fi

# --- Step 6: 最終レポート ---

report_list() {
  local title="$1"
  shift
  echo "## $title ($#)"
  local item
  for item in "$@"; do
    echo "  - $item"
  done
  [ $# -eq 0 ] && echo "  （なし）"
  echo
}

echo "==== stack-kit scaffold 結果 ===="
echo
report_list "作成" ${created[@]+"${created[@]}"}
report_list ".gitignore 追記" ${gitignore_added[@]+"${gitignore_added[@]}"}
report_list "スキップ（kit と同一）" ${skipped_same[@]+"${skipped_same[@]}"}
report_list "スキップ（差分あり・要手動解決）" ${skipped_diff[@]+"${skipped_diff[@]}"}
report_list "補足" ${notes[@]+"${notes[@]}"}

cat <<'EOF'
==== 残りの手動作業 ====

1. リポジトリの Secrets に `STACK_KIT_PAT` を登録する
   （Settings → Secrets and variables → Actions → New repository secret）

   hono-auth-starter は PRIVATE のため、これが無いと stack-kit-pull-check.yml の
   checkout が落ちる。Secrets は template 複製では引き継がれない。
   必要な権限: hono-auth-starter への read（Fine-grained PAT なら Contents: Read-only）。

   ※ シークレットの登録操作はユーザー自身が行うこと。

2. hooks を発火させるため `.claude/settings.json` に登録する
   （settings.json はどの kit も配布しない。hooks 本体は claude-workflow-kit の
     scaffold.sh が配置するので、未実行ならそちらを先に流すこと）

   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Bash",
           "hooks": [
             { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-rm-rf.js\"", "if": "Bash(rm -rf *)", "blocking": true },
             { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-env-read.js\"", "blocking": true }
           ]
         }
       ]
     }
   }

3. 配置されたファイルの内容を確認のうえ、コミット対象を明示列挙して git add → commit する
   （git add -A は使わない）
EOF
