# Vitest セットアップ技術仕様書

最終更新: 2026-06-30  
ステータス: 完了  
改訂理由: doc-01 は happy-dom + singleFork の構成を記録していたが、調査の結果 cacheDir の変更のみが本質的な修正であることが判明したため改訂

## 概要

並行 Agent 実行時の vitest キャッシュ競合を解消するための最小構成。

## 結論：変更は cacheDir 1 箇所のみ

```ts
// vitest.config.ts
export default defineConfig({
  cacheDir: path.resolve(__dirname, ".vitest-cache"),  // ← これだけ追加
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
  // ...
});
```

それ以外（`maxWorkers`・`fileParallelism`・`singleFork`・`happy-dom`）は**不要**。

## 問題の因果関係

並行 Agent が同じ `node_modules/.vitest`（vitest のデフォルトキャッシュ）に同時書き込みすることでキャッシュが破損し、以下のエラーが発生していた：

```
Error: [vitest-pool]: Failed to start forks worker for test files src/client/hooks/useAddTodo.test.tsx.
Caused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond
```

この結果、実行のたびに通過ファイル数が変動していた（19〜26 ファイル）。

`cacheDir` を worktree ローカル（`__dirname` 相対の `.vitest-cache`）に変えることで、各 worktree が独立したキャッシュを持ち競合が発生しなくなった。

## なぜ cacheDir だけで十分か

- `maxWorkers` はデフォルトで CPU コア数に応じて自動設定される。devcontainer の制約で timeout が出ていたのはキャッシュ破損が原因であり、並行数の問題ではなかった
- `happy-dom` への切り替えは高速化になるが、pnpm の peer dependency 解決で `node_modules/vitest` が jsdom-only インスタンスを指す場合に `ERR_MODULE_NOT_FOUND` が発生するリスクがある。jsdom のままが安全
- `singleFork`（vitest 4 で削除）や `fileParallelism: false` は直列実行によりむしろ遅くなる（98s → 499s）

## 環境の使い分け

デフォルト環境は `jsdom`。サーバーテストは DOM 不要かつ happy-dom の forbidden headers 制約を避けるため、ファイル先頭でオーバーライドする：

```ts
// @vitest-environment node
import { describe, it } from "vitest"
```

対象: `src/server.test.ts` と `src/server/**/*.test.ts` の全ファイル。

**なぜサーバーテストに node 環境が必要か**: jsdom（および happy-dom）はブラウザの forbidden headers 仕様を実装しており、`Content-Length` などをリクエストヘッダーにセットできない。Hono の `app.request()` を使うサーバーテストでは CORS・ボディサイズ制限の検証が正しく動作しなくなるため、DOM を持たない `node` 環境を使う。

## パフォーマンス実測（devcontainer）

### 試した構成と結果

| 構成 | 時間 | テスト数 | 備考 |
|---|---|---|---|
| jsdom + 並行（キャッシュ破損あり・修正前） | 167s | 19/30 ファイル・128 tests | worker timeout 11 件 |
| jsdom + cacheDir のみ追加（**現在の構成**） | 98s | 30/30 ファイル・170 tests | エラー 0 件 |
| jsdom + maxWorkers: 1（直列） | 499s | 30/30 ファイル・170 tests | 不要に遅くなった |
| happy-dom + maxWorkers: 1 | 532s | 30/30 ファイル・170 tests | pnpm 解決問題あり |
| happy-dom + isolate: false | 47s | 27/30 ファイル・163 tests | DOM 汚染で 7 テスト失敗 |

### happy-dom を採用しなかった理由

pnpm が `node_modules/vitest` を jsdom-only インスタンスに解決する場合、happy-dom 環境のワーカーが以下のエラーで起動できない：

```
Error: Cannot find package 'happy-dom' imported from
node_modules/.pnpm/vitest@4.1.9_.../node_modules/vitest/dist/chunks/index.js
Caused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond
```

`pnpm add -D happy-dom` を実行しても `node_modules/vitest` が更新されない限り解消されない。jsdom のままが安全。

### isolate: false を採用しなかった理由

DOM 環境（jsdom/happy-dom）でファイル間のモジュールグラフを共有すると、前のファイルでレンダリングされたコンポーネントが `document.body` に残り次のファイルのテストが失敗する：

```
TestingLibraryElementError: Found multiple elements by: [data-testid="navigate"]
```

`@testing-library/react` の `cleanup()` はファイル内の `afterEach` で動くが、ファイル境界をまたいだリセットは行われないため。

## 関連ファイル

```
vitest.config.ts                              # cacheDir のみ追加
.gitignore                                    # .vitest-cache を追加済み
.claude/docs/rules/testing-comment-rules.md  # @vitest-environment node ルール
src/server.test.ts                            # // @vitest-environment node
src/server/handlers/*.test.ts                 # // @vitest-environment node
src/server/middleware/*.test.ts               # // @vitest-environment node
```
