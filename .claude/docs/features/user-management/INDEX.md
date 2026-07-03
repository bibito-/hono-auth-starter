# user-management/ 索引

| ドキュメント | 役割 |
|---|---|
| user-management-doc | ユーザー管理機能（表示名・ロール編集、削除、Hono API移行）全体の実装仕様 |
| event-logs-doc | `profiles`テーブルのCREATE/UPDATE(role)/DELETEを`event_logs`にトリガー記録する監査ログ仕様 |
| delete-user-hono-migration-doc | ユーザー削除をSupabase Edge FunctionからHono `DELETE /api/admin/users/:id`へ移行した仕様 |
| fetchUsers-hono-migration-doc | ユーザー一覧取得をクライアント直読みからHono `GET /api/users`へ移行した仕様 |
| role-change-hono-migration-doc | ロール・表示名編集をHono `PATCH /api/users/:id`へ移行し権限マトリクスで守る仕様 |
