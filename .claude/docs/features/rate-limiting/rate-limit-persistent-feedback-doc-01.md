# レート制限永続フィードバック UX 実装仕様書

最終更新: 2026-06-28
ステータス: 完了
前提: `.claude/docs/features/rate-limiting/rate-limiting-doc-01.md`（Phase 6 完了）

## 概要

account-scope の 429 は 00:00 UTC まで継続する長時間の制限状態だが、現状は自動消滅 Toast のため数秒で消える。これを `duration: Infinity` の永続 Toast に変更し、いつリセットされるかを表示する。user-scope（60 秒）は短命・自己解消のため変更しない。

## 設計方針

| 項目 | 決定内容 | 理由 |
|---|---|---|
| UI パターン | Sonner `duration: Infinity` + 固定 `id: "rate-limit-account"` | 既存の Toast インフラを最小変更で拡張できる。バナーは新レイヤーの実装コストが大きい |
| 重複集約 | Sonner の `id` 指定で自動集約 | 同じ id で再呼び出しすると既存 Toast を上書き。多発する 429 で Toast が積まれない |
| 解消タイミング | **a) 手動 dismiss** + **c) 次回 analyze 成功（202）で `toast.dismiss("rate-limit-account")`** | retryAfter タイマーはページリロードで失われ管理コストが高い。成功時に消すのが最も自然 |
| 説明文 | `retryAfter` 秒を時・分に変換し「あと約X時間Y分でリセットされます（00:00 UTC）」を表示 | いつ再試行できるか分かると actionable。動的カウントダウンはやりすぎなので固定文言に留める |
| user-scope | 変更なし（自動消滅 Toast のまま） | 60 秒で自己解消するため永続化の必要がない |

## `retryAfter` → 残り時間の変換

```ts
function formatRetryAfter(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.ceil((seconds % 3600) / 60);
  if (h === 0) return `約${m}分`;
  if (m === 0) return `約${h}時間`;
  return `約${h}時間${m}分`;
}
```

例: `retryAfter=7320` → 「約2時間2分でリセットされます（00:00 UTC）」

## 実装ステップ

### Step 1 — `showRateLimitToast` の account 分岐を永続化に変更

対象: `src/client/utils/toastHelpers.tsx`

```ts
// 変更前
toast.warning("本日の AI タグ付け上限に達しました", {
  description: "時間をおいて再度お試しください。",
});

// 変更後
toast.warning("本日の AI タグ付け上限に達しました", {
  id: "rate-limit-account",
  duration: Infinity,
  description: `あと${formatRetryAfter(retryAfter)}でリセットされます（00:00 UTC）`,
});
```

- `formatRetryAfter` をモジュール内に追加（pure function）、`export` して単体テスト可能にする

### Step 2 — 次回 analyze 成功時に Toast を消す

対象: `src/client/hooks/useAddTodo.ts`（`requestAiTagging` 関数）

```ts
.then(async (res) => {
  if (res.status === 202) {
    toast.dismiss("rate-limit-account");  // ← 追加
    return;
  }
  if (res.status !== 429) return;
  // ... 既存の 429 処理
})
```

202 を明示的に捕捉し `toast.dismiss` を呼ぶ。それ以外のステータスは既存動作のまま。

### Step 3 — `ux-feedback-policy.md` に追記

対象: `.claude/rules/ux-feedback-policy.md`

「レート制限フィードバック」節を追記：
- user-scope（60 秒）: 自動消滅 Toast のまま
- account-scope（00:00 UTC まで）: `duration: Infinity` + 固定 id。次回成功時に dismiss

## 関連ファイル

```
src/client/
├── utils/toastHelpers.tsx              # formatRetryAfter 追加・account 分岐を永続化
├── utils/toastHelpers.test.tsx         # formatRetryAfter・showRateLimitToast のユニットテスト
├── hooks/useAddTodo.ts                 # 202 時に toast.dismiss("rate-limit-account")
└── hooks/useAddTodo.test.tsx           # 202/429 レスポンスの挙動テスト
.claude/rules/ux-feedback-policy.md    # レート制限フィードバック方針を追記
```

## 開発者が押さえるべき要点（grill 由来）

- **dismiss の実装場所は `useAddTodo` の `requestAiTagging`、`useTodos` ではない。** `useTodos` は `useAddTodo` を内部で使う親 hook だが、`apiFetch` のレスポンスを直接見られるのは `requestAiTagging` のみ。「Todo 追加が成功した」ではなく「analyze の HTTP レスポンスが 202 だった」を捕捉する必要があるため、そこに置く必要がある。

## スコープ外

- per-user 日次上限（公平性）
- account Toast の残り時間カウントダウン（毎秒更新）
- account-scope 中にページ遷移→戻ったときの Toast 復元（リロード耐性）
