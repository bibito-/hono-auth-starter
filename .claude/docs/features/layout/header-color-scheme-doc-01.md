# header-color-scheme 実装仕様書

最終更新: 2026-07-01
ステータス: **完了**

## 概要

header-restyle（PR #45）で暫定採用していたヘッダーのログイン/ログアウトボタン配色（共有 `outline` variant）を、Claude Design handoff（`ds-bundle/handoff/updated-header-01/`、ローカル限定・gitignore 対象）指定どおりの配色に正式決定した。ヘッダー専用の新 Button variant を追加し、他画面で使われている共有 `outline` variant には手を入れていない。

## 設計方針

| 項目 | 決定内容 | 理由 |
|---|---|---|
| 配色方針 | handoff 指定どおり（`bg-transparent` + `border-border` + `text-foreground` + `hover:bg-secondary`）。新色は導入しない | 既存 CSS カスタムプロパティのみで完結する。将来 `.dark` クラスでダークモードを有効化した際も、トークン側の `.dark` 定義がそのまま効く |
| 対象範囲 | `button.tsx` に専用 variant `header-ghost` を新設し、`Header.tsx` の2箇所（ログアウトボタン・ログインリンク）のみ差し替える | 共有 `outline` variant は `TaskDetailModal` / `DateTimePickerModal` / `dialog.tsx` でも使用中。変更すると影響範囲が他画面まで広がるため |
| ダークモード対応 | 対象外 | `.dark` クラスを付与する仕組み（トグル・ThemeProvider 等）自体が未実装で、CSS 側のダークモード定義は現状死んでいる。トークンベースで実装しておけば将来対応時に追加コストなし |
| サイズ（padding） | handoff 指定 `px-3.5 py-1.5` を呼び出し側の `className` で上書きする（`cn()` が内部で `twMerge` を使うため、`className` prop は size variant の `px-2.5` より後勝ちで適用される） | 既存 size token（`default`/`sm`/`lg`）に厳密一致するものがなく、新 size を追加するほどの差分ではないため |

## 実装内容

### button.tsx
対象: `src/client/components/ui/button.tsx`
- `buttonVariants` の `variant` に追加:
  ```
  "header-ghost": "bg-transparent border-border text-foreground hover:bg-secondary",
  ```

### Header.tsx
対象: `src/client/components/layout/Header.tsx`
- ログアウトボタン: `<Button type="button" variant="outline" onClick={logout}>` → `<Button type="button" variant="header-ghost" className="px-3.5" onClick={logout}>`
- ログインリンク: `<Button variant="outline" asChild>` → `<Button variant="header-ghost" className="px-3.5" asChild>`

### テスト
対象: `src/client/components/layout/Header.test.tsx`（新規作成）
- 未認証時: ログインリンクが `header-ghost` variant で描画され、`/login` へのリンクになっていることを確認
- 認証時: ログアウトボタンが `header-ghost` variant で描画され、クリックで `logoutMutation.mutate` が呼ばれることを確認
- 挙動（クリックでログアウト等）自体は変更していないため、既存の他テストへの影響なし

## 関連ファイル

```
src/client/
├── components/
│   ├── ui/
│   │   └── button.tsx
│   └── layout/
│       ├── Header.tsx
│       └── Header.test.tsx
```

## 開発者が押さえるべき要点（理解必須・grill 由来）

grill-gate: スキップ（デザイン領域に工数をかけない判断のため）。要点の追記なし。

## 関連する後続タスク

header-restyle（PR #45）・本タスクの2回、ヘッダーのボタン配色を機能単位で個別決定した。アプリ全体のカラースキーマ・ダークテーマ方針は Claude Design 側とまとめて相談する予定（`ds-bundle/proposals/color-scheme-dark-theme-proposal.md` に論点整理済み、ローカル限定）。
