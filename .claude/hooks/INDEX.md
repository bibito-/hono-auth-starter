# hooks/ 索引

PreToolUse フック（ツール実行前の検証・ゲート）の一覧。

| ファイル | matcher | 役割 |
|---|---|---|
| guard-env-read.js | Bash | `.env` / `.dev.vars` ファイルの内容読み取りコマンドを禁止 |
| guard-review-agent-no-test-run.js | Bash | review-agent によるテスト実行・型チェック実行を禁止（静的レビュー専任のため） |
| guard-rm-rf.js | Bash | プロジェクト外への `rm -rf` を禁止 |
| guard-kit-push-verdict.cjs | Bash | kit クローンへの `git push` の直前に clean verdict（レビュー完了証）をチェック。また `--context` モードで層名・対象リポジトリ・digest の算出も提供 |
| guard-kit-verdict-write.cjs | Write\|Edit | `.claude/steering/reviews/` 配下の kit-push verdict ファイルへの書き込みを kit-push-review-agent のみに制限 |
