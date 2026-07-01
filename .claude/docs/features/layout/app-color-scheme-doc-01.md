# app-color-scheme 実装仕様書

最終更新: 2026-07-01
ステータス: **完了**

## 概要

Claude Design との相談結果（`ds-bundle/handoff/design_handoff_color_schema_and_dark_mode/`）に基づき、アプリ全体のカラースキーマとダークテーマ方針を実装した。対象は次の3点に限定した。

1. `button.tsx` の直書き色 variant（`login`）をトークンベースへ統一
2. `next-themes` を使ったダークテーマ基盤 + ヘッダーの手動切替トグル
3. 404ページのダーク表示確認

トグルは共通 `Header` に常設するため他ページも `.dark` の影響を受けるが、他ページの直書き色による見た目の細部の崩れは今回のスコープ外とし、気づいた範囲のみ別タスクで対応する（`src/client/components/ui/checkbox.tsx` の `danger` indicator に同種の直書き色が残っていることを確認済み・別途対応検討）。

## 設計方針

| 項目 | 決定内容 | 理由 |
|---|---|---|
| 対象範囲 | 上記3点に限定。他ページの網羅的なダーク対応サーベイはしない | スコープ肥大を防ぐ。ユーザー承認済み |
| PR分割 | 3段階（①button統一 → ②next-themes基盤+トグル → ③404ページ確認）でそれぞれ別PR | レビュー単位を小さく保つ。ユーザー承認済み |
| ダークテーマ実装方式 | `next-themes` の `ThemeProvider`（`attribute="class"`, `defaultTheme="light"`, `enableSystem={false}`, `storageKey="ai-todo-theme"`）を `main.tsx` に追加 | `next-themes` は依存関係に既存（`sonner.tsx` が `useTheme()` を呼ぶが Provider 未設置のため現状不発）。`attribute="class"` は `App.css` の `@custom-variant dark (&:is(.dark *))` と合致し、Tailwind の `dark:` バリアントがそのまま効く。`enableSystem={false}` は handoff の「OS設定への自動追従は不採用」と一致 |
| login variant 撤去 | `button.tsx` から `login` variant 定義を削除し、`LoginFooter.tsx` の送信ボタンを `default` variant に統一 | モノクロ方針でブランド色（青）が廃止されたため。`login` variant の使用箇所は `LoginFooter.tsx` のみ（確認済み） |
| トグルボタンの配置・実装 | `Header.tsx` のユーザーエリア、ログアウトボタンの左に 32×32px アイコンボタンを追加。アイコンは handoff のテキスト絵柄（☾/☀）ではなく `lucide-react` の `Moon`/`Sun` を使う | プロジェクト内の他コンポーネント（`sonner.tsx` 等）が既に `lucide-react` でアイコンを統一しているため、一貫性を優先 |
| 404ページの背景・装飾色 | 外側コンテナ背景・「404」装飾文字色の2箇所のみ、既存の inline style から Tailwind の任意値クラス + `dark:` バリアントに変更する。他の inline style（`var(--foreground)` 等トークン参照）は変更しない | inline style の `style` 属性は `.dark` セレクタで値を出し分けられない。一方 `var(--*)` を直接参照している箇所は `.dark` 切替時にトークン自体が変わるため inline のままで自動追従し、変更不要 |
| CTAボタンの hover 色 | handoff 指定のダーク hover 値（`oklch(0.75 0 0)`）をそのまま個別指定せず、既存の `default` variant の `hover:bg-primary/80`（相対値）をそのまま使う | 個別の固定値を入れると、他画面の同じ `default` ボタンと挙動が変わり一貫性が崩れる。相対値は `--primary` トークンの変化に自動追従するため、既存の他ボタンと同じ土俵で正しく暗転する |
| 手動確認範囲 | マージ前の手動確認は、トグルを押して Header と 404ページがダークで正しく見えることのみ。他ページ全部の目視確認は求めない | 今回の実装スコープに合わせた最小確認。ユーザー承認済み |

## 実装内容

### Step 1 — button.tsx トークン統一（PR #48）
対象: `src/client/components/ui/button.tsx`, `src/client/components/features/auth/login/LoginFooter.tsx`
- `buttonVariants` の `variant` から `login: "bg-blue-500 hover:bg-blue-400 text-white"` を削除
- `LoginFooter.tsx` の `<Button variant="login" ...>` → `<Button variant="default" ...>`

### Step 2 — next-themes 基盤 + ヘッダートグル（PR #49）
対象: `src/client/main.tsx`, `src/client/components/layout/Header.tsx`
- `main.tsx`: `next-themes` から `ThemeProvider` を import し、ツリー全体をラップ
  ```tsx
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="ai-todo-theme">
  ```
- `Header.tsx`: `next-themes` の `useTheme()` を使い、`theme`/`setTheme` を取得。ユーザーエリアのログアウトボタンの左に、`Moon`/`Sun`（`lucide-react`）を出し分けるアイコンボタンを追加（`Button variant="header-ghost" size="icon"`）
  - クリックで `setTheme(theme === "dark" ? "light" : "dark")`
  - 認証状態に関わらず常時表示

### Step 3 — 404ページのダーク確認（PR #50）
対象: `src/client/components/pages/NotFoundPage.tsx`
- 外側コンテナの `className` に `bg-[oklch(0.955_0_0)] dark:bg-background` を追加
- 「404」装飾文字の `className` に `text-[oklch(0.87_0_0)] dark:text-[oklch(0.24_0_0)]` を追加（`color: "var(--border)"` インライン指定は削除）
- 他の inline style（見出し・サブテキスト・CTAボタン）は変更なし

## 関連ファイル

```
src/client/
├── main.tsx
├── components/
│   ├── ui/
│   │   └── button.tsx
│   ├── layout/
│   │   └── Header.tsx
│   ├── features/auth/login/
│   │   └── LoginFooter.tsx
│   └── pages/
│       └── NotFoundPage.tsx
```

## 開発者が押さえるべき要点（理解必須・grill 由来）

### Step1（button.tsx トークン統一）
grill-gate: 実施なし。単純な削除+置換で、理解確認すべき非自明な設計判断が無かったため。

### Step2（next-themes 基盤 + ヘッダートグル）
`ThemeProvider` の `attribute="class"` は、`App.css` の `@custom-variant dark (&:is(.dark *));`（`.dark` クラスを持つ祖先があるときだけ `dark:` を有効化する Tailwind v4 の custom variant）と対になっている。`attribute` を `"class"` 以外（例: `"data-theme"`）にすると、`setTheme("dark")` を呼んでも属性が変わるだけで `.dark` クラスは付与されず、アプリ中の `dark:` ユーティリティがエラーも警告もなく全滅する。画面が暗転しない不具合が起きたら、まずこの `attribute` 設定を疑うこと。

### Step3（404ページのダーク確認）
`NotFoundPage.tsx` は見出し・サブテキスト・CTAボタン等ほとんどが inline style のままで、外側コンテナの背景色と「404」装飾文字の色の2箇所だけ Tailwind の任意値クラス（`dark:`バリアント）に変更した。この2箇所だけを変えた理由は「モノトーンだから」ではなく、この2値が**既存のどのトークンにも属さない404ページ専用の生値で、かつライト/ダークで別の値を持つ**ため。inline style の `style` 属性は `.dark` に応じた値の出し分けができないので、`dark:` バリアントが使える class 記法に移す必要があった。他の箇所は `var(--foreground)` 等の既存トークンをそのまま参照しているだけなので、inline のままで `.dark` 切替に自動追従する（トークン参照であれば inline/class を問わず追従する、という点を「モノトーン方針だから」と混同しないこと）。

## 関連する後続タスク

- `src/client/components/ui/checkbox.tsx` の `danger` indicator に直書き色（`text-yellow-300`）が残っている。今回のスコープ外だが、将来の配色統一で扱うか検討する
- 今回ダーク対応したのは Header と 404ページのみ。他ページ（Todos一覧・ログイン画面等）は未確認で、直書き色による見た目の崩れが残っている可能性がある
