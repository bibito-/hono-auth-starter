# テストのドキュメントコメントルール

テストを読んだときに処理の流れがひと目でわかるように、各 `it()` ブロック内にフェーズコメントを記載する。
テスト種別（hook テスト / component テスト）によって最初のフェーズ名が異なる。

## フェーズ構成

```
// 準備: hookを初期化              ← hook テストの場合
// Render: componentをレンダリング  ← component テストの場合
// Arrange: テスト対象のハンドラー・要素を取り出す
// Act
// Assert
```

### 各フェーズの役割

| フェーズ | 適用対象 | 内容 | 典型的なコード |
|---|---|---|---|
| **準備** | hook テスト | hookを初期化する | `renderHook(() => useFoo(), { wrapper })` |
| **Render** | component テスト | componentをレンダリングする（直前の `vi.fn()` 生成・モック設定を含む） | `render(<Foo />)` |
| **Arrange** | 共通 | テスト対象のハンドラー・要素を取り出す | `const [, { someHandler }] = result.current` / `screen.getByRole(...)` |
| **Act** | 共通 | ハンドラーを実行する | `act(() => { someHandler(args) })` / `fireEvent.click(...)` |
| **Assert** | 共通 | 期待する結果を検証する | `expect(mockMutate).toHaveBeenCalledWith(...)` |

Act を伴わないテスト（クリックなどの操作がない）は Arrange / Act をまとめて省略し、
準備（または Render）→ Assert のみで完結してよい。

## 記載例

### hook テストの例

```tsx
it("存在しない id のとき mutate を呼ばない", () => {
  // 準備: hookを初期化
  const { result } = renderHook(() => useTodos(), {
    wrapper: createWrapper(queryClient),
  });
  // Arrange: テスト対象ハンドラーを取り出す
  const [, { taskTextUpdateHandler }] = result.current;

  // Act
  act(() => {
    taskTextUpdateHandler("non-existent-id", "新タイトル");
  });

  // Assert
  expect(mockUpdateMutate).not.toHaveBeenCalled();
});
```

### component テストの例（Act あり）

```tsx
it("テーマ切り替えボタンをクリックすると setTheme が反対のテーマで呼ばれる", () => {
  // Render: ライトテーマとして useTheme をモックしてレンダリング
  mockUseTheme.mockReturnValue({ theme: "light", setTheme: mockSetTheme });
  renderWithAuth({ authUser: null });
  // Arrange: テーマ切り替えボタンを取得
  const themeButton = screen.getByRole("button", { name: "ダークテーマに切り替え" });

  // Act
  fireEvent.click(themeButton);

  // Assert
  expect(mockSetTheme).toHaveBeenCalledWith("dark");
});
```

### component テストの例（Act なし）

```tsx
it("ライトテーマ時、テーマ切り替えボタンに Moon アイコンが表示される", () => {
  // Render: ライトテーマとして useTheme をモックしてレンダリング
  mockUseTheme.mockReturnValue({ theme: "light", setTheme: mockSetTheme });
  renderWithAuth({ authUser: null });

  // Assert
  const themeButton = screen.getByRole("button", { name: "ダークテーマに切り替え" });
  expect(themeButton.querySelector("svg.lucide-moon")).not.toBeNull();
});
```

## 補足

- **`準備` と `Render` の違い**：`準備` は hook テスト専用（`renderHook` による初期化）、`Render` は component テスト専用（`render` によるマウント）。両者は別フェーズであり混同しない。
- **`準備`/`Render` と `Arrange` を分けている理由**：`renderHook`/`render` はテスト対象全体の初期化・マウントであり、Arrange（テスト対象の特定）とは目的が異なるため分離する。
- **`act()` が不要なとき**：状態更新を伴わない同期的な呼び出し（例：バリデーションのみで副作用なし）は `act()` を省略してよい。コメントは `// Act` のみ残す。
- **`beforeEach` はフェーズコメント不要**：各テストで共有されるセットアップであり、`it()` 内のフェーズとは別物として扱う。

## サーバーテストの環境アノテーション

`src/server/` 配下のテストファイルは必ず先頭行に以下を追加する：

```ts
// @vitest-environment node
```

**理由**: vitest のデフォルト環境が `happy-dom` のため、サーバーテストをそのまま実行すると
happy-dom の forbidden headers 制約（`Content-Length` 等）が干渉し誤った結果になる。
