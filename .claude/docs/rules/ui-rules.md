# UIルール

## UIライブラリ

UIコンポーネントは **shadcn/ui** を使用する。

- インポートパスは `@/components/ui/<コンポーネント名>`
- shadcn/ui に存在するコンポーネントは独自実装せず、shadcn/ui のものを使う
- 実装前に https://ui.shadcn.com/docs/components でコンポーネント一覧を確認することを推奨（web 上でサンプルを確認できる）
- プロジェクトに未追加のコンポーネントは `pnpm dlx shadcn@latest add <コンポーネント名>` でインストールしてから使う
- shadcn/ui にないコンポーネントが必要な場合は `src/components/` に独自実装する

## フォームUI

フォームの実装仕様は [ux-feedback-policy.md](./ux-feedback-policy.md) の「フォーム入力 UI の仕様」セクションを参照すること。
