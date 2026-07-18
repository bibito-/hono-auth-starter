# UXフィードバック方針

## 基本原則

**画面遷移自体がフィードバックになる場合は、Toast通知は不要。**

Toast が有効なのは「画面が変わらないのに何かが起きた」場面に限定する。

## 操作別の方針

| 操作 | Toast | 理由 |
|---|---|---|
| ログイン成功 | 不要 | `/todos` への遷移が成功の証 |
| ログイン失敗 | **必要** | 画面が変わらず、ユーザーが原因を知れない |
| ログアウト成功 | 不要 | `/login` への遷移で伝わる |
| SignUp成功（pending） | **必要** | メール確認を促す必要がある |
| SignUp失敗 | **必要** | 画面が変わらず、ユーザーが原因を知れない |

## Toast の実装場所

Toast の呼び出しは `AuthContextProvider` の各 mutation の `onSuccess` / `onError` に集約する。

- UI コンポーネント（LoginWithEmail, SignUp 等）は Toast を呼ばない
- ナビゲーション（`navigate()`）は UI コンポーネントが担当
- 認証状態の通知は Provider が担当

## リダイレクト着地による失敗表示の例外

ページ遷移時に失敗情報がクエリパラメータで届くケース（例：外部認証フロー完了後のリダイレクト）では、Toast ではなく**インラインエラー表示**（`role="alert"` + `text-destructive` 等のスタイル）を使用する。

**理由：**

1. 失敗がページロード時点で既に確定しており、ページコンテキストに紐づく表示が自然
2. ユーザーが失敗原因を読んで再試行を判断する情報のため、一過性の Toast より **留まる表示**が適切
3. この経路は mutation ではないため、Provider の `onError` に集約する既存パターンが構造的に適用できない

このインラインエラー表示は UI コンポーネントが直接行うが、これは既存規約「UI コンポーネントは Toast を呼ばない」に**抵触しない**（Toast ではなくインライン要素であるため）。

## レート制限フィードバック（AI タグ付け 429）

scope によって通知の寿命を使い分ける。

| scope | 通知種別 | 理由 |
|---|---|---|
| `user`（60 秒窓） | 自動消滅 Toast（sonner 既定） | 短命・自己解消するため永続化不要 |
| `account`（00:00 UTC まで） | **永続 Toast**（`duration: Infinity` + `id: "rate-limit-account"`） | 数時間続く制限を数秒で消すと「なぜタグが付かないか」の手がかりが消える |

### account-scope の永続 Toast の挙動

- **表示**: `showRateLimitToast("account", retryAfter)` で呼ぶ（`toastHelpers.tsx`）
- **解消条件**: ① 手動 dismiss（ユーザーが × を押す）、② 次回 analyze 成功（202）時に `toast.dismiss("rate-limit-account")` を呼ぶ
- **重複集約**: 同 id を複数 429 で連続呼び出しても Toast は1つに集約される（Sonner の id 仕様）
- **dismiss の実装場所**: `useAddTodo.ts` の `requestAiTagging` — 202 レスポンスを受けたタイミングで呼ぶ

## フォーム入力 UI の仕様

### Textarea の使用

複数行入力が想定されるフォームフィールドは `input` ではなく `Textarea`（`@/components/ui/textarea`）を使用する。

- `field-sizing-content` クラスを付与し、入力内容に応じて高さが自動伸縮するようにする
- shadcn/ui の `Textarea` コンポーネントはデフォルトで `field-sizing-content` を持つが、`className` を渡す場合は明示的に含めること

```tsx
<Textarea
  {...register("title")}
  className="field-sizing-content w-96 ..."
/>
```

### フォームの送信方法

入力項目の数によって送信UIを使い分ける。

| 入力項目数 | 送信方法 |
|---|---|
| **単一** | Enter キー（またはワンボタン）で即送信。送信ボタンを別途用意しない |
| **複数** | submit ボタンなど、送信の意図を明示するUIパーツを用意する |

単一項目フォームで `textarea` を使う場合、Enter で送信・Shift+Enter で改行とする：

```tsx
onKeyDown={(e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault(); // 改行挿入をキャンセル
    handleSubmit(onSubmit)();
  }
}}
```

### react-hook-form との接続

`register("fieldName")` を呼び出した結果をスプレッドする。関数をそのままスプレッドしても動作しない。

```tsx
// ✅ OK
<Textarea {...register("title")} />

// ❌ NG: register は関数。スプレッドしても name/onChange/ref が渡らない
<Textarea {...register} name="todo-textarea" />
```
