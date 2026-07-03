# skills/ 索引

| ドキュメント | 役割 |
|---|---|
| doc-push | `.claude/`（rules/skills/CLAUDE.md）の変更をbackground agentに委譲し、mainへ直接pushする（`/doc-push`） |
| docs-index-setup | `.claude/docs/`・`.claude/skills/`にフォルダ索引（INDEX.md）を一括作成・更新する |
| extract-template | 本プロジェクトから再利用可能な資産を抜き出し新規プロジェクトの土台にする手順 |
| merge-gate | mainへマージ可能な変更のDefinition of Done（grillゲート・スモーク・公式照合） |
| pnpm-setup | pnpm v11のビルドスクリプト許可設定（pnpm-workspace.yaml） |
| spec-workflow | 新機能の仕様書をspecs/に作成しユーザー承認を得てから実装へ渡す（`/spec`） |
| tdd-workflow | TDD（Red→Green→Refactor）で機能実装を進める手順とパターン集（`/tdd`） |
