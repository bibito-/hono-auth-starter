# TanStack Query ルール

## QueryKey の設計原則

QueryKey には「そのキーが変わったらデータを再フェッチすべき情報」だけを含める。

### 使ってよい値

- `string` / `number` / `boolean` などのスカラーリテラル
- スカラーのみで構成されたオブジェクト（フィルター条件など）

### 使ってはいけない値

- ステートオブジェクトまるごと（例: `authUser`、`currentUser`）
- ライフタイム中に内部プロパティが変化するオブジェクト

```ts
// ❌ NG: authUser は role が null → "staff" と変化するため、
//        role 確定後にキーが変わり useEffect クロージャが古いキーを参照し続ける
const queryKey = ["todos", "list", authUser];

// ✅ OK: id はログイン中に固定されるスカラー
const queryKey = ["todos", "list", authUser?.id];
```

### 理由

`useEffect` の依存配列でエフェクトの再実行を絞ると、クロージャは実行時点の QueryKey を閉じ込める。
その後 QueryKey が変わっても（オブジェクトの内部プロパティ変化など）クロージャは更新されず、
`invalidateQueries` が空振りして Realtime 同期や楽観的更新が機能しなくなる。

## QueryKey の構造

エンティティ → 操作 → 絞り込み条件 の順で階層化する。

```ts
["todos", "list", userId]          // 一覧
["todos", "detail", todoId]        // 単一取得（将来追加する場合）
["profiles", "list"]               // フィルターなし一覧
["profiles", "detail", profileId]  // 単一取得
```

- 先頭はエンティティ名（テーブル名に合わせる）
- 2番目は操作種別（`"list"` / `"detail"` など）
- 3番目以降は絞り込み条件（スカラーのみ）

この構造にすることで `invalidateQueries({ queryKey: ["todos"] })` で todos 関連を一括無効化できる。
