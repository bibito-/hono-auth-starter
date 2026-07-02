# サーバーエラーログ出力ルール

## 生エラーオブジェクトのログ出力禁止

`console.error` / `console.warn` でエラーを出力する際、エラーオブジェクト全体（`error`）ではなく `error.message` など必要な情報のみを出力する。

```ts
// ❌ NG: エラーオブジェクト全体を出力
console.error("[updateUser] 更新に失敗", error);

// ✅ OK: message のみ出力
console.error("[updateUser] 更新に失敗", id, error.message);
```

### 理由

エラーオブジェクトには stack trace・内部プロパティ・場合によっては認証情報を含むリクエスト設定（Supabase クライアントの内部状態等）が含まれることがある。
CLAUDE.md の「絶対にやってはいけないこと」（環境変数の値を出力しない・個人情報をログに出力しない）を実装レベルで徹底するため、ログに出す情報を `error.message` 等の安全な文字列に限定する。

### 出力フォーマット

既存実装（`updateUser.ts` / `deleteUser.ts` / `listUsers.ts` / `requireRole.ts`）に倣い、以下の形式に統一する。

```ts
console.error("[<ハンドラー名>] <日本語の状況説明>", <関連ID等>, error.message);
console.warn("[<ハンドラー名>] <日本語の状況説明>", <関連ID等>);
```

- 先頭に `[ハンドラー名]` プレフィックスを付ける
- `error.message` 以外のフィールド（`error.stack` 等）は出力しない
- `userId` 等の ID は出力してよいが、メールアドレス・氏名等の個人情報は出力しない（CLAUDE.md 既存ルール）

### 適用範囲

`src/server/` 配下の全ハンドラー・ミドルウェアの catch ブロック。
