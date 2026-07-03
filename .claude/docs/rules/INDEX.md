# rules/ 索引

| ドキュメント | 役割 |
|---|---|
| error-logging-rules | サーバーハンドラー・ミドルウェアのcatchブロックでのログ出力ルール（生エラーオブジェクトの出力禁止） |
| local-dev-rules | ローカル動作確認時のコマンド（dev:cfw / dev:spa）の使い分け |
| react-rules | Reactコンポーネント・hooks実装時のルール（use()の使用等） |
| supabase-auth-rules | Supabase認証処理実装時のルール（onAuthStateChange内でのDBクエリ禁止等） |
| supabase-db-rules | DBマイグレーション・型定義更新時のルール（database.types.ts手動編集禁止、変更手順） |
| tanstack-query-rules | TanStack Query実装時のルール（QueryKey設計原則） |
| testing-comment-rules | テスト実装時のコメントルール（it()ブロック内のフェーズコメント） |
| ui-rules | UIコンポーネント実装時のルール（shadcn/ui使用方針） |
| ux-feedback-policy | トースト・エラー表示実装時の方針（画面遷移で伝わる場合はToast不要等） |
