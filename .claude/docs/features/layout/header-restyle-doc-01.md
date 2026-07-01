# header-restyle 実装仕様書

最終更新: 2026-07-01
ステータス: **完了**

## 概要

共通ヘッダー（`Header.tsx` / `ContentNavigation.tsx`）を、ダーク基調（`bg-gray-800` + inset シャドウ）から、
Claude Design ハンドオフ（`ds-bundle/handoff/updated-header-01/`、ローカル限定・gitignore 対象）に沿った明るい backdrop-blur 基調に見た目のみ変更した。
構造・振る舞い（`AuthContext` 連携・ルーティング・ロールベースのナビ表示）は変更していない。

## 設計方針

| 項目 | 決定内容 | 理由 |
|---|---|---|
| 変更範囲 | `Header.tsx` の className のみ。ロジック・構造は不変 | handoff doc の明示指示（機能はそのまま、見た目のみ） |
| ContentNavigation | pill 型 hover (`hover:bg-secondary`) に変更 | Header と統一しないとダーク hover だけ浮く |
| active 状態のハイライト | 追加しない | 現状 `Link` のみで active 判定の仕組みがなく、追加は className 変更を超える新規実装になるため対象外 |
| NotFoundPage の高さ計算 | `calc(100vh - 5rem)` → `calc(100vh - 64px)` に修正 | Header 高さが `h-20+padding` から `h-16`(64px) に変わるため、放置すると 404 本文下に余白/ズレが発生する |
| 404 ページ背景色（ライトグレー化） | 対象外 | 依頼は「header」のみ。ページ全体の配色変更は別スコープ |
| ロゴマーク | 26px 角丸（`bg-primary text-primary-foreground rounded-md`）+ "T" を追加 | handoff doc の指定通り |
| ログアウト/ログインボタン | 独自 Tailwind 実装（塗り）→ shadcn/ui `Button` の `outline` variant に置き換え | client-review-agent 指摘（ui-rules.md: shadcn/ui コンポーネントの再利用を優先）を受けて、handoff doc の個別指定値ではなく既存コンポーネントを採用 |

## 実装内容

### Header.tsx
対象: `src/client/components/layout/Header.tsx`
- `<header>`: `bg-gray-800 text-white p-4 [box-shadow:inset...]` → `bg-background/80 backdrop-blur-md border-b border-border`
- 内側コンテナ: `h-20` → `h-16`、`max-w-[1280px] mx-auto px-6`
- ロゴ: `<h1>` テキストのみ → 26px 角丸マーク（`bg-primary text-primary-foreground rounded-md` に "T"）+ `text-base font-semibold` の "Todos"
- ログアウトボタン（`AutenticatedUser`）: `<Button type="button" variant="outline" onClick={logout}>ログアウト</Button>` に置き換え
- ログインリンク（`UserProfile`）: `<Button variant="outline" asChild><Link to="/login">ログイン</Link></Button>` に置き換え
- 表示名テキスト: `text-sm text-muted-foreground` を付与

### ContentNavigation.tsx
対象: `src/client/components/features/header/ContentNavigation.tsx`
- `ContentTitle` の `rounded-lg hover:bg-gray-700 px-2 py-3` → `px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground`

### NotFoundPage.tsx
対象: `src/client/components/pages/NotFoundPage.tsx`
- `minHeight: "calc(100vh - 5rem)"` → `minHeight: "calc(100vh - 64px)"`

## 関連ファイル

```
src/client/
├── components/
│   ├── layout/
│   │   └── Header.tsx
│   ├── features/header/
│   │   └── ContentNavigation.tsx
│   └── pages/
│       └── NotFoundPage.tsx
```

## 開発者が押さえるべき要点（理解必須・grill 由来）

- ログアウト/ログインボタンは、レビュー指摘（ui-rules.md: shadcn/ui コンポーネントの再利用）を受けて handoff doc の個別 Tailwind 指定値ではなく既存 `Button` の `outline` variant に置き換えた。そのため配色は handoff doc とピクセル単位では一致しない。カラースキーマ自体を別タスクで再決定する予定があるため、現時点での厳密なピクセル一致は意図的に保証していない（暫定実装）。
