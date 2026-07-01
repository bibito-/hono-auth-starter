# app-color-scheme 実装仕様書

最終更新: 2026-07-01  
ステータス: **完了**  
改訂理由: Header・404ページに限定していたダーク対応スコープを、Todos一覧まわり5ファイルと UserManagementPage に拡張した。

## 概要

Claude Design との相談結果（`ds-bundle/handoff/design_handoff_color_schema_and_dark_mode/`）に基づき、アプリ全体のカラースキーマとダークテーマ方針を実装した。対象は次の5点に限定した。

1. `button.tsx` の直書き色 variant（`login`）をトークンベースへ統一
2. `next-themes` を使ったダークテーマ基盤 + ヘッダーの手動切替トグル
3. 404ページのダーク表示確認
4. Todos一覧まわり（5ファイル）のダーク対応
5. UserManagementPage のダーク対応

トグルは共通 `Header` に常設するため他ページも `.dark` の影響を受ける。Todos一覧と UserManagementPage 以外の直書き色は今回のスコープ外とし、気づいた範囲のみ別タスクで対応する（`src/client/components/ui/checkbox.tsx` の `danger` indicator に同種の直書き色が残っていることを確認済み・別途対応検討）。

## 設計方針

| 項目 | 決定内容 | 理由 |
|---|---|---|
| 対象範囲 | Header・404ページ・Todos一覧5ファイル・UserManagementPage に限定。他ページの網羅的なダーク対応サーベイはしない | スコープ肥大を防ぐ。ユーザー承認済み |
| PR分割 | 5段階（①button統一 → ②next-themes基盤+トグル → ③404ページ確認 → ④Todos一覧 → ⑤UserManagementPage）でそれぞれ別PR | レビュー単位を小さく保つ。ユーザー承認済み |
| ダークテーマ実装方式 | `next-themes` の `ThemeProvider`（`attribute="class"`, `defaultTheme="light"`, `enableSystem={false}`, `storageKey="ai-todo-theme"`）を `main.tsx` に追加 | `next-themes` は依存関係に既存（`sonner.tsx` が `useTheme()` を呼ぶが Provider 未設置のため現状不発）。`attribute="class"` は `App.css` の `@custom-variant dark (&:is(.dark *))` と合致し、Tailwind の `dark:` バリアントがそのまま効く。`enableSystem={false}` は handoff の「OS設定への自動追従は不採用」と一致 |
| login variant 撤去 | `button.tsx` から `login` variant 定義を削除し、`LoginFooter.tsx` の送信ボタンを `default` variant に統一 | モノクロ方針でブランド色（青）が廃止されたため。`login` variant の使用箇所は `LoginFooter.tsx` のみ（確認済み） |
| トグルボタンの配置・実装 | `Header.tsx` のユーザーエリア、ログアウトボタンの左に 32×32px アイコンボタンを追加。アイコンは handoff のテキスト絵柄（☾/☀）ではなく `lucide-react` の `Moon`/`Sun` を使う | プロジェクト内の他コンポーネント（`sonner.tsx` 等）が既に `lucide-react` でアイコンを統一しているため、一貫性を優先 |
| 404ページの背景・装飾色 | 外側コンテナ背景・「404」装飾文字色の2箇所のみ、既存の inline style から Tailwind の任意値クラス + `dark:` バリアントに変更する。他の inline style（`var(--foreground)` 等トークン参照）は変更しない | inline style の `style` 属性は `.dark` セレクタで値を出し分けられない。一方 `var(--*)` を直接参照している箇所は `.dark` 切替時にトークン自体が変わるため inline のままで自動追従し、変更不要 |
| CTAボタンの hover 色 | handoff 指定のダーク hover 値（`oklch(0.75 0 0)`）をそのまま個別指定せず、既存の `default` variant の `hover:bg-primary/80`（相対値）をそのまま使う | 個別の固定値を入れると、他画面の同じ `default` ボタンと挙動が変わり一貫性が崩れる。相対値は `--primary` トークンの変化に自動追従するため、既存の他ボタンと同じ土俵で正しく暗転する |
| Todos一覧トークン化方針 | 直書き色を既存トークン（`--muted-foreground`・`--border`・`--destructive`等）または `dark:` バリアント付き任意値クラスに置き換える | 色が既存トークンの意味に合致する場合はトークン参照に統一。意味が一致しない場合は `dark:` バリアント付き任意値で個別調整 |
| ロールバッジ色の扱い（UserManagementPage） | `ROLE_COLORS`（admin/manager/staff/temporary の4色）を既存トークンに統合せず、`dark:` バリアント追加のみに留める | これらの色は「役割の識別」という意味を持ち、既存トークンのどれとも意味が一致しない。無理に統合すると役割を区別する情報自体が失われるため、色は維持しつつダークモードでの視認性のみ個別調整 |
| 手動確認範囲 | マージ前の手動確認は、トグルを押して全対象ページ（Header・404・Todos一覧・UserManagementPage）がダークで正しく見えることを確認。他ページ全部の目視確認は求めない | 実装スコープに合わせた最小確認。ユーザー承認済み |

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

### Step 4 — Todos一覧まわりのトークン化（PR #51）
対象: `src/client/components/features/todo/TaskView.tsx`、`AddTodoForm.tsx`、`TaskDetailModal.tsx`、`TaskListView.tsx`、`DoneVisibilityToggle.tsx`
- `TaskView.tsx`: `isExpired` 赤色表示の `text-red-400` をトークン（`--destructive`）参照に置き換え。`text-amber-50`・`text-gray-400` は既存トークン `--muted-foreground` 相当に置き換え。`border-gray-400/700`・`hover:bg-white hover:text-black` は `dark:` バリアント付き任意値に変更
- `AddTodoForm.tsx`: `bg-gray-600`・`border-gray-400/600` → トークン・`dark:` バリアント。`text-red-400` → `--destructive` 参照
- `TaskDetailModal.tsx`: `text-gray-200/500` → `--muted-foreground`。`text-red-400` → `--destructive`
- `TaskListView.tsx`: `text-gray-300/400` → `--muted-foreground`
- `DoneVisibilityToggle.tsx`: `text-amber-50` → 既存トークン相当の light/dark 対応色

### Step 5 — UserManagementPageのトークン化（PR #52）
対象: `src/client/components/pages/UserManagementPage.tsx`
- ロールバッジ4色（admin/manager/staff/temporary）の `bg-purple/blue/gray/yellow-100` と対応 text 色に `dark:` バリアントを追加。色値自体は維持（役割識別の意味を保持）
- 補助テキスト（`text-gray-500/600`）→ `--muted-foreground` 参照
- hover 背景（`hover:bg-gray-50`）→ light テーマ維持。dark テーマでは適切な暗色に `dark:` バリアント付き任意値
- エラーバナー（`bg-red-50 border-red-200 text-red-700`）→ light/dark 別色を `dark:` バリアント付き任意値で指定

## 関連ファイル

```
src/client/
├── main.tsx
├── components/
│   ├── ui/
│   │   └── button.tsx
│   ├── layout/
│   │   └── Header.tsx
│   ├── features/
│   │   ├── auth/login/
│   │   │   └── LoginFooter.tsx
│   │   └── todo/
│   │       ├── TaskView.tsx
│   │       ├── AddTodoForm.tsx
│   │       ├── TaskDetailModal.tsx
│   │       ├── TaskListView.tsx
│   │       └── DoneVisibilityToggle.tsx
│   └── pages/
│       ├── NotFoundPage.tsx
│       └── UserManagementPage.tsx
```

## 開発者が押さえるべき要点（理解必須・grill 由来）

### Step1（button.tsx トークン統一）
grill-gate: 実施なし。単純な削除+置換で、理解確認すべき非自明な設計判断が無かったため。

### Step2（next-themes 基盤 + ヘッダートグル）
`ThemeProvider` の `attribute="class"` は、`App.css` の `@custom-variant dark (&:is(.dark *));`（`.dark` クラスを持つ祖先があるときだけ `dark:` を有効化する Tailwind v4 の custom variant）と対になっている。`attribute` を `"class"` 以外（例: `"data-theme"`）にすると、`setTheme("dark")` を呼んでも属性が変わるだけで `.dark` クラスは付与されず、アプリ中の `dark:` ユーティリティがエラーも警告もなく全滅する。画面が暗転しない不具合が起きたら、まずこの `attribute` 設定を疑うこと。

### Step3（404ページのダーク確認）
`NotFoundPage.tsx` は見出し・サブテキスト・CTAボタン等ほとんどが inline style のままで、外側コンテナの背景色と「404」装飾文字の色の2箇所だけ Tailwind の任意値クラス（`dark:`バリアント）に変更した。この2箇所だけを変えた理由は「モノトーンだから」ではなく、この2値が**既存のどのトークンにも属さない404ページ専用の生値で、かつライト/ダークで別の値を持つ**ため。inline style の `style` 属性は `.dark` に応じた値の出し分けができないので、`dark:` バリアントが使える class 記法に移す必要があった。他の箇所は `var(--foreground)` 等の既存トークンをそのまま参照しているだけなので、inline のままで `.dark` 切替に自動追従する（トークン参照であれば inline/class を問わず追従する、という点を「モノトーン方針だから」と混同しないこと）。

### Step4（Todos一覧まわりのトークン化・PR #51）

**①destructive背景のlight/dark別opacity（`bg-destructive/10` → dark時 `/20`、border `dark:border-destructive/50`）**

`--destructive` トークン自体の値が light（`oklch(0.577...)`）と dark（`oklch(0.704...)`、より明るい）で異なるため、同じ不透明度のままだと dark 背景上で視認性バランスが崩れる。トークンの色相は共通でも、明度が変わる分は個別チューニングが必要という帰結。ユーザーが将来的に `--destructive` トークン値を調整する場合は、この opacity 値も見直す必要があることに注意。

**②AddTodoForm.tsx が Textarea の直書き色を削除しベースコンポーネント任せにした判断**

メリットは変更元が一箇所になる管理性（DRY）。裏返しのリスクとして、今後 base `Textarea` コンポーネントのデフォルトスタイルが変わると、`AddTodoForm.tsx` 自体は無変更のまま見た目が変わる暗黙の結合が生まれる。`Textarea` の色を将来変更するときは、このコンポーネントが影響を受けることを認識しておくこと。

**③新規テスト未作成の妥当性**

変更はTailwindクラス（見た目）のみでロジック・分岐・データフローに変更なし。既存の振る舞いテストが green のままであることで十分に担保される。UI 回帰テストの追加は、現在のプロジェクトのテスト戦略（単体テスト中心）では優先度外。

### Step5（UserManagementPage のトークン化・PR #52）

**①`ROLE_COLORS`（ロールバッジ4色: admin/manager/staff/temporary）を既存トークンに統合せず、`dark:` バリアント追加のみに留めた判断**

これらの色は「役割の識別」という意味を持ち、`--destructive`（エラー）や `--muted-foreground`（補助テキスト）等の既存トークンのどれとも意味が一致しない。無理に統合すると4役割を区別する情報自体が失われるため、色は維持しつつダークモードでの視認性のみ `dark:` バリアントで個別調整した。セマンティクスと実装技術（トークン vs 直書き色）を区別し、意味を失わないことを優先。

**②`text-foreground` と `text-muted-foreground` の使い分け（削除確認テキスト vs ローディング/メール列表示）**

`--foreground` は本文相当の主役テキスト色、`--muted-foreground` は補助情報・優先度の低いテキスト用の控えめな色。「本当に削除？」はユーザーに能動的な判断を迫る重要文言のため `--foreground`、ローディング表示やメールアドレスは補足情報のため `--muted-foreground`、という重要度による使い分け。複数の意味の色が存在する場合、トークン設計の初期段階で「どの意味にどの色を充てるか」を明示的に決めておくことで、後続の色置換作業が判断基準を失わずに進行する。

## 関連する後続タスク

- `src/client/components/ui/checkbox.tsx` の `danger` indicator に直書き色（`text-yellow-300`）が残っている。今回のスコープ外だが、将来の配色統一で扱うか検討する
- `src/client/components/pages/TodoListPage.tsx`・`LoginPage`（login/signup関連コンポーネント）・`src/client/index.css` 等アプリ全体のベース背景色が、旧来の黒背景（`.dark` 前提の固定色）のまま外側コンテナに残っており、light テーマ時に文字が背景に埋もれて視認できない問題が導通テストで発覚。404ページは正しく `.dark` に追従するが、それ以外の画面（todos/user-management/login/signup）の外側背景色が未対応。次のタスクで対応予定

## 修正履歴

### 各ページ外枠のbg-black直書きを修正（2026-07-01）

**種別:** バグ修正  
**対象ファイル:** `src/client/components/pages/TodoListPage.tsx`, `src/client/components/features/auth/LoginWithEmail.tsx`, `src/client/components/features/auth/SignUp.tsx`, `src/client/components/features/auth/EmailConfirmationNotice.tsx`, `src/client/components/ui/CustomSpinner.tsx`, `src/client/components/pages/PageSkeleton.tsx`

**問題:** 各ページの外側 `<main>` に直書きされていた `bg-black`（固定ダーク色）が、ライトテーマに切り替えても黒いままで、テーマ追従できていなかった。

**原因:** アプリ初期設計がダークテーマ限定前提で実装されていたため、ダークテーマ基盤（next-themes）とテーマトグルを導入した際に修正が漏れた。

**対応:** `bg-black` を `bg-background`（テーマ追従 CSS トークン）に置き換えることで、`.dark` の有無に応じて自動的にライト/ダークの背景色が切り替わるようにした。

**grill で確認した設計判断の帰結:**
- `CustomSpinner.tsx` は `ProtectedRoute.tsx`（Todos含む全保護ルート）と `RoleProtectedRoute.tsx`（ユーザー管理画面）の両方から import される単一の共有コンポーネントであるため、1ファイルの修正が複数ページの表示に同時に伝播する。修正効果の波及範囲は「コンポーネントの呼び出し元の数」ではなく「そのコンポーネントが何度実装されているか（実装の集約度）」で決まる
- `EmailConfirmationNotice.tsx` の `text-white` テキストはこの修正では対象外とした（理由：背景色 `bg-gray-700` がテーマ追従対象外だったため、固定ダーク背景の修正に含める意味がなかった）。ただし次の修正（認証カードのlight mode対応）でこの前提そのものが変わる

### 認証画面カードのlight mode対応（2026-07-01）

**種別:** バグ修正  
**対象ファイル:** `src/client/components/features/auth/LoginWithEmail.tsx`, `src/client/components/features/auth/SignUp.tsx`, `src/client/components/features/auth/EmailConfirmationNotice.tsx`, `src/client/components/features/auth/AuthTextField.tsx`, `src/client/components/features/auth/signup/OrLogin.tsx`

**問題:** 前の修正（各ページ外枠を `bg-background` テーマ追従に変更）の結果、認証画面のカード背景（`bg-gray-700` 固定ダーク色）だけが取り残され、ライトテーマで白背景に暗いカードが浮いて見える。

**原因:** 認証画面は当初「常時ダーク固定」の意図的デザインだったが、外枠のみがテーマ追従に変更されたことで、内側カードだけが矛盾を露出させた。

**対応:** カード・テキスト・リンク色を全て CSS トークン（`bg-card border-border text-primary` 等）に置き換え、外枠と一貫してテーマに追従させるよう修正した。

**grill で確認した設計判断の帰結:**
- `EmailConfirmationNotice.tsx` は shadcn の `Card` コンポーネント（トークン参照で自動レスポンシブ）を使う一方、`LoginWithEmail.tsx`・`SignUp.tsx` は生 div に `bg-card border-border` を明示している。実装方法は異なるが、両者とも同じ CSS 変数トークンを参照するため視認結果は同一。生 div を `Card` コンポーネントに構造統一する選択肢も検討したが、「ライトモード視認問題を直す」という修正スコープを逸脱するため、カラートークン置換に絞った（将来の構造リファクタ候補）
