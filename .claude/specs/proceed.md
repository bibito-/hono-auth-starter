# 進行中の作業

機能名: jwt-cookie-migration
ステータス: 仕様確認中
仕様書: .claude/specs/jwt-cookie-migration/jwt-cookie-migration-spec-01.md
grill-gate: スキップ
次のアクション: ユーザーが仕様を確認・修正し、承認後に `/tdd jwt-cookie-migration` を実行する

## 運用ゲート

- すり合わせ方式: バッチ質問
- マージ前grillゲート: スキップ（既に ai-todo 側で検証済みの移植作業のため）

## スコープ関連の申し送り

- `user-management-realtime`（WebSocket再実装）は今回のspecから除外し、別specとして後続実施する方針（ユーザー承認済み）
- CSP（`vercel.json`）新規導入は上記realtime spec側で対応する
