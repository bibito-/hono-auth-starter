# agents/ 索引

| ドキュメント | 役割 |
|---|---|
| client-impl-agent | React / Vite クライアントサイド実装専任。コンポーネント・hooks・contexts・repositories とそのユニットテストを担当 |
| client-review-agent | クライアントコード静的レビュー専任。docs/rules/ のルールに照らして src/client/ をレビューし違反・改善点を報告 |
| doc-push-agent | `.claude/` ディレクトリ（rules / skills / docs / CLAUDE.md）の更新専任。fetch → 編集 → commit → push を実行 |
| server-impl-agent | Hono / Cloudflare Workers サーバーサイド実装専任。ハンドラー・ミドルウェア・レートリミット・Agents SDK とそのユニットテストを担当 |
| server-review-agent | サーバーコード静的レビュー専任。docs/rules/ のルールに照らして src/server/ をレビューし違反・改善点を報告 |
| tsc-agent | TypeScript 型チェック専任。`pnpm tsc --noEmit` を実行し結果を返す。他の Agent と並行起動して使う想定 |
