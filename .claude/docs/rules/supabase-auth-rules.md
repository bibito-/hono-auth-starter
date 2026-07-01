# Supabase 認証ルール

## onAuthStateChange コールバック内での DB クエリ禁止

`onAuthStateChange` のコールバック内で `async/await` によるDBクエリを実行してはならない。

```ts
// ❌ NG: コールバック内で await するとハングする
supabase.auth.onAuthStateChange(async (_event, session) => {
  const { data } = await supabase.from("profiles").select("role"); // ハングの原因
  callback({ ...user, role: data?.role });
});

// ✅ OK: まず callback を呼んで loading を解除し、setTimeout で外に出てから DB クエリ
supabase.auth.onAuthStateChange((_event, session) => {
  callback({ ...user, role: null }); // 即座に解決
  setTimeout(() => {
    supabase.from("profiles").select("role").then(({ data }) => {
      callback({ ...user, role: data?.role });
    });
  }, 0);
});
```

### 理由

Supabase JS クライアントの内部認証ステートマシンは、`onAuthStateChange` コールバックの実行中もアクティブである。この状態で DB クエリを `await` すると、クライアントがクエリをキューに積んだままブロックし、Promise が永遠に解決しない。

`setTimeout(0)` によって JS のイベントループを一周させると、Supabase の内部処理が完了した後にDBクエリが実行されるため、正常に解決する。

### 適用範囲

- `SupabaseAuthService.onAuthStateChange` の実装
- 将来 `onAuthStateChange` を直接使う箇所すべて

### バージョン情報

- `v2.74.0`: `onAuthStateChange` に async 関数を渡すことが **公式 deprecated** に（Supabase チームが問題を認識）
- `v2.91.0`: `exchangeCodeForSession` でのデッドロックを一部修正
- `v2.98.0`（現在）: Realtime 再接続時の `SIGNED_IN` 再発火などでは**まだハングする可能性あり**

関連 issue: https://github.com/supabase/auth-js/issues/762

### 参考実装

[src/services/SupabaseAuthService.ts](../../src/services/SupabaseAuthService.ts) の `onAuthStateChange` メソッドを参照。
