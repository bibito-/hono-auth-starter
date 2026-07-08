# 実装の agent 委譲ルール

`src/client/` または `src/server/` 配下のコードを変更するとき（規模・ファイル数を問わず）、
必ず専任 agent に委譲する。メイン Claude が直接 Edit / Write / Bash で実装してはならない。

| 変更対象 | 使用する agent |
|---|---|
| `src/client/` | `client-impl-agent` |
| `src/server/` | `server-impl-agent` |

## 理由

agent は `bypassPermissions` で動作するため、ツール呼び出しのたびにユーザーへ承認プロンプトが飛ばない。
メイン Claude が直接実装すると権限プロンプトで作業が長時間止まり、ユーザーの作業フローが中断される。

## 適用範囲

- テストファイル（`*.test.ts` / `*.test.tsx`）も含めて agent 内で完結させる
- grill・spec・ドキュメント作成・PR 作成はメイン Claude が行う
- `.claude/` 配下の変更は `doc-push-agent` が行う（このファイル自身がその例）

## 関連ルール

- コミットの粒度・`git add` のスコープは [commit-guide.md](commit-guide.md) を参照
