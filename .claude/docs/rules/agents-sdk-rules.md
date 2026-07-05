# Agents SDK 実装ルール

Cloudflare Agents SDK（`agents` パッケージ）の `Agent` クラスを実装・追加するときのルール。

## instance name に機微な値を使う場合は sendIdentityOnConnect を無効化する

`Agent` クラスは既定で `sendIdentityOnConnect: true`（`agents` パッケージの `DEFAULT_AGENT_STATIC_OPTIONS`）であり、`idFromName(name)` / `getAgentByName(binding, name)` に渡したインスタンス名を、クライアント接続（WebSocket）確立時に以下のプロトコルメッセージとしてそのまま送信する。

```json
{ "type": "cf_agent_identity", "name": "<instance name>", "agent": "<kebab-case class name>" }
```

`user_id` のような機微な値をインスタンス名に使うクラス（per-user の Durable Object。例: per-user 通知用 Agent）を実装する場合、本番デプロイ前に該当クラスへ以下を追加すること:

```typescript
export class MyPerUserAgent extends Agent<CloudflareBindings> {
  static options = { sendIdentityOnConnect: false };
  // ...
}
```

### 適用対象外

`idFromName("global")` のような固定文字列・非機微な値をインスタンス名に使う共有インスタンス型の Agent（例: 本テンプレートの `RateLimiter`、将来実装予定の `UserManagementAgent`）は対象外。インスタンス名自体に秘匿性が無いため。

### 背景

`agents` パッケージ側もこの既定挙動に対し、`static options` で `sendIdentityOnConnect` を明示指定していないクラスには以下の警告を出す（`console.warn`、実装確認済み: `agents@0.16.2`）:

> [Agent] {ClassName}: sending instance name "{name}" to clients via sendIdentityOnConnect (the name is not visible in the URL with custom routing). If this name is sensitive, add `static options = { sendIdentityOnConnect: false }` to opt out. Set it to true to silence this message.

このテンプレートは clone 直後〜プロジェクト launch までの開発中は既定値（`true`）のままで問題ない。本番デプロイ前に、追加した Agent クラスのインスタンス名が機微な値かどうかを確認し、該当する場合のみ `false` に切り替える。
