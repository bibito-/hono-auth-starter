# ローカル動作確認ルール

## コマンド

| コマンド | 起動内容 | 用途 |
|---|---|---|
| `pnpm dev:cfw` | Miniflare（ローカル CFW 環境）+ Vite（ポート 5173 固定） | API サーバー（`/api/*` のみ。SPA は配信しない）。サーバーサイド（Workers）を含む動作確認 |
| `pnpm dev:spa` | SPA モード（CFW なし）、Vite（ポート 5174 固定） | クライアントサイドのみの動作確認。または server-client 疎通時のクライアント側 |

## 使い分け

- **`src/client/` のみの変更** → `pnpm dev:spa` だけ起動（ポート 5174）
- **`src/server/` を含む変更 / server-client 疎通確認** → `dev:cfw`（5173）と `dev:spa`（5174）を別ターミナルで同時起動

## 手順

1. 必要なコマンドを起動
   - ポートは固定（dev:cfw=5173、dev:spa=5174）。`--strictPort` 設定のため、指定ポートが空いていなければエラーで停止する
   - ポート競合で起動失敗した場合は、`pnpm dev:clean` を実行して残留プロセスを kill してから再起動する
2. server-client 疎通確認する場合は、`.env`（リポジトリに含まれないローカルファイル）に以下を追記する
   ```
   VITE_API_BASE_URL="http://localhost:5173"
   ```
   未設定だと SPA（5174）から API リクエストが CFW（5173）に届かず、自身のオリジン（5174）に飛んでしまう
3. ブラウザで `http://localhost:5174/<確認したいパス>` を開く（dev:cfw は API のみなので 5173 をブラウザで開いても UI は見えない）
4. コードを変更したらサーバーを再起動してブラウザをリロード（HMR は WSL2 環境では動作しない）
5. 確認が終わったらサーバーを落とす

## 注意

- `dev:cfw` の AI バインディング（`this.env.AI`）はリモート接続のため Cloudflare への通信が発生する
- スモーク（本番での最終確認）は merge-gate.md に従い main マージ後に実施する
- ポートを固定しているのは、`src/server/cors.ts` の `ALLOWED_ORIGINS` と実際のアクセスオリジンを一致させるため。Vite のポート自動繰り上げに任せると CORS エラーで疎通確認ができなくなる

## DO SQLite の確認（enrich_errors など）

ローカルの Durable Object SQLite は `.wrangler/state/v3/do/` に保存される。
`scripts/do-query.cjs` を使って SQL で直接確認できる。

```bash
# REPL モード
node scripts/do-query.cjs

# ワンライナー
node scripts/do-query.cjs "SELECT * FROM enrich_errors"
node scripts/do-query.cjs "SELECT id, todo_id, datetime(failed_at/1000,'unixepoch') AS ts, error_msg FROM enrich_errors"
```

REPL 内のコマンド:
- `.tables` — テーブル一覧
- `.quit` または Ctrl+C — 終了

> `dev:cfw` 起動前は `.wrangler/state/` が存在しないためエラーになる。
