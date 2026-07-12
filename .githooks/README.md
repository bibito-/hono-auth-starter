# Git hooks の有効化

この kit クローンで次を一度実行する。

```bash
git config core.hooksPath .githooks
```

これにより `pre-push` が Git 自身から毎回起動され、Claude Code の Bash コマンド解析を経由しない publish も clean verdict なしでは拒否される。

Bash の PreToolUse フックは実行前のコマンド文字列を見るため、シェルで包まれたり変数展開されたりすると解析できない。Git の `pre-push` は publish が起きる瞬間に Git 自身が呼ぶので、コマンドの綴り方に一切依存しない。

この `.githooks/` は kit リポジトリのローカル保護用であり、配布ペイロードではない。配布対象は `.claude/manifests/stack-kit-files.txt` に列挙されたファイルだけで、そこには `.githooks/` は含まれない。
