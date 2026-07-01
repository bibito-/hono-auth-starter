# Supabase DB ルール

## database.types.ts は手動編集禁止

`src/types/database.types.ts` は自動生成ファイルのため、直接編集しない。
DB スキーマの変更は必ず以下の手順で行う。

## DBスキーマ変更の手順

```
1. supabase/migrations/ にマイグレーション SQL を作成
2. ユーザーに SQL の内容を提示し、承認を得る   ← 必須。承認なしで次へ進まない
3. supabase db push          — リモートの Supabase プロジェクトに適用
4. npm run types:supabase    — database.types.ts を再生成
```

- **手順 2 の承認フェーズ**: マイグレーション SQL をユーザーに提示し、「このマイグレーションを適用してよいですか？」と明示的に確認を取る。承認が得られるまで手順 3 以降を実行しない
- 手順 3・4 は Claude が Bash ツールで実行する
- 手順 3 が失敗した場合はユーザーに報告して止まること（認証エラー等）
- 手順 4 完了後、`database.types.ts` に新しいカラムが反映されていることを確認してから次のステップへ進む

## マイグレーションファイルの命名

```
supabase/migrations/<YYYYMMDDHHmmss>_<変更内容>.sql
```

例: `20260518000000_add_deadline_at_to_todos.sql`

## 参考

- `types:supabase` スクリプト: `supabase gen types typescript --linked > src/types/database.types.ts`
- `--linked` はリモートの Supabase プロジェクトを参照する
