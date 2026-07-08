# TDD ワークフロー

引数で指定した機能・ファイルを TDD（Red → Green → Refactor）で実装するための手順とパターン集。

---

## マージゲートの確認（着手時に1度）

実装に入る前に、[merge-gate.md](./merge-gate.md) の **grill ゲート適用可否**を確認する。

- `specs/proceed.md` または `steering/current.md` の「運用ゲート」に `grill-gate: 適用 / スキップ` の**記録があれば、それに従い再質問しない**
- 記録が無い場合（spec を経ず `/tdd` 直行など）だけ、ここで尋ねる。その際**事前に意図を伝える**:
  > あなたの回答を基に、spec を「あなたの今後の理解を助ける形」に追記する予定です（誤解しやすい設計判断の帰結を要点として残します）。
  ```
  A) 適用（既定・推奨）   B) スキップ（軽微変更）
  ```
- 選択結果を `steering/current.md` の「運用ゲート」に記録する
- スモーク・公式照合は grill とは別軸で、該当変更なら常に適用（選択不要）

> **注意**: このセクションは「将来 grill を実行するか」を記録するだけ。実際の grill 質問は Refactor 完了後、PR 作成前に実行する（「Refactor 完了後の仕上げ」を参照）。

## 作業ブランチの作成（着手時に必ず実施）

新規タスク開始時は **main ではなく専用ブランチで作業する**。ブランチ名は spec 名に合わせる。

```bash
git checkout -b feat/<spec名>   # 例: feat/fetch-todos-hono-migration
```

- main で作業しているまま Red フェーズに入らない
- ブランチ作成は steering/current.md 更新の直前に行う
- フィーチャーブランチは `.claude/` を直接編集・commit してはならない。`.claude/` の変更が必要なときは doc-push-agent 経由で行うこと

---

## 実装の委譲

ブランチ作成後、対象ドメインに応じて sub-agent に実装を委譲する。

| 対象 | 委譲先 |
|---|---|
| `src/server/` | `server-impl-agent` |
| `src/client/` | `client-impl-agent` |
| 両方にまたがる | `server-impl-agent` → `client-impl-agent` の順で直列 |

### 委譲の方法

spec の内容をブリーフとして渡し、Red → Green → Refactor を一括で委譲する。

**単一ドメイン（server または client のみ）:**

```
Agent(subagent_type: "server-impl-agent", prompt: "<spec の内容>")
Agent(subagent_type: "client-impl-agent", prompt: "<spec の内容>")
```

**両ドメイン並行:**

`isolation: "worktree"` を指定することで Agent が自動的に worktree を作成・クリーンアップする。変更があった場合はブランチ名が返るので、完了後に Main がマージする。

```
# 並行起動
Agent(subagent_type: "server-impl-agent", isolation: "worktree", prompt: "<spec の内容>")
Agent(subagent_type: "client-impl-agent", isolation: "worktree", prompt: "<spec の内容>")

# 両 Agent 完了後、返却されたブランチを feature branch にマージ
# git merge --no-ff <returned-branch>
```

### ブランチの扱い

**単一ドメイン:** sub-agent はメインワーキングツリーの feature branch をそのまま引き継いで作業する。Server-agent がコミット → Client-agent が続けてコミット → Main がレビュー・マージの順で進める。

**両ドメイン並行:** `isolation: "worktree"` で各 sub-agent が専用 worktree で独立して作業する。`.claude/worktrees/` は `.gitignore` 登録済みのため追加設定不要。両 Agent の完了後に返却ブランチを feature branch へマージし、worktree は自動クリーンアップされる。

### 設計判断が発生した場合

sub-agent が実装中に設計判断を返してきた場合（「【設計判断が必要です】」形式）、Main が判断して再度 sub-agent を呼び出す。

---

## steering/current.md の管理

### 新規タスク開始時

`steering/current.md` の先頭（「進行中のタスクなし」を置き換える形）に以下を書く：

```markdown
# 進行中タスク

## ゴール
<機能名> の <何を達成するか>（サブエージェントが文脈なしで読んでも理解できる粒度）

## フェーズ
- [ ] Red: テスト作成（`<テストファイルパス>`）
- [ ] Green: 最小実装（`<実装ファイルパス>`）
- [ ] Refactor: 整理

## 次のステップ
Red フェーズ: テストファイルを作成する
```

### 各フェーズ完了時

| フェーズ完了 | フェーズのチェックを入れる | 「次のステップ」を更新する |
|---|---|---|
| Red 完了 | `- [x] Red: ...` | `Green フェーズ: <実装ファイルパス> に最小実装を書く` |
| Green 完了 | `- [x] Green: ...` | `Refactor フェーズ: テストが Green のままリファクタする` |
| Refactor 完了 | `- [x] Refactor: ...` | （次のステップ欄を削除） |

### タスク完了時

`current.md` からゴール・フェーズ・次のステップを削除する：

```markdown
# 進行中タスク

進行中のタスクなし。
```

完了済み一覧は `steering/history.md` の「完了済み」セクションに追記する（`current.md` には保持しない）：

```markdown
- <機能名>（<日付>）
（既存の完了済み一覧）
```

> Refactor 完了は「TDD 内側ループの完了」であって「main マージ可」ではない。main マージ前に必ず [merge-gate.md](./merge-gate.md)（grill ゲート → スモーク → 公式照合）を通すこと。grill ゲートを適用する場合、合格後に誤解しやすかった設計判断の帰結を spec の「押さえるべき要点」節へ中立表現で追記する（理解の補強）。

---

## Refactor 完了後のレビューループ

Refactor 完了後、PR 作成前に必ず review-agent と型チェック Agent を起動してルール違反・型エラーがないことを確認する。

### レビューの起動

実装が完了した側から順次 review-agent を起動する。同時に `tsc-agent` も並行起動する。両方にまたがる場合は実装完了を待たず、先に終わった方から即レビューを開始する。

| 対象 | 起動する agent |
|---|---|
| `src/client/` のみ | `client-review-agent` + `tsc-agent`（並行） |
| `src/server/` のみ | `server-review-agent` + `tsc-agent`（並行） |
| 両方 | server-impl-agent 完了 → server-review-agent を background 起動 → client-impl-agent 実装 → client-review-agent + `tsc-agent` を並行起動 |

**単一ドメイン（server のみ）:**

```
Agent(subagent_type: "server-review-agent", ...)
Agent(subagent_type: "tsc-agent")
# ↑ 両方完了後に分岐判定
```

**単一ドメイン（client のみ）:**

```
Agent(subagent_type: "client-review-agent", ...)
Agent(subagent_type: "tsc-agent")
# ↑ 両方完了後に分岐判定
```

**両ドメイン:**

```
Agent(subagent_type: "server-impl-agent", ...)          # server 実装
Agent(subagent_type: "server-review-agent", ..., run_in_background: true)  # server レビュー開始
Agent(subagent_type: "client-impl-agent", ...)          # client 実装（server レビューと並行）
Agent(subagent_type: "client-review-agent", ...)        # client レビュー
Agent(subagent_type: "tsc-agent")                       # 型チェック
# ↑ client-review-agent + tsc-agent の両方完了後に分岐判定
# （server-review-agent は background で先行している）
```

### レビュー後の分岐

review-agent と型チェック Agent の結果に基づいて処理を分岐する。

- **review-agent で違反あり** → `current.md` に「レビュー違反修正」タスクが記載される。対象 agent（`client-impl-agent` / `server-impl-agent`）に修正を委譲し、完了後に再度 review-agent + 型チェック Agent を並行起動する
- **impl-agent が修正を行った場合は必ず再レビュー**: TDD のどのフローから修正の impl-agent が走った場合でも（grill 後の追加修正・違反修正・型エラー修正いずれも含む）、完了後に必ず review-agent + 型チェック Agent を並行起動する。`steering/reviews/` に積まれたレビューチケットは再レビューで "違反なし" を確認するまで残り続けるため、impl-agent 完了 → review-agent 再起動は省略不可
- **型チェックでエラーあり** → 対象 agent（`client-impl-agent` / `server-impl-agent`）に修正を委譲し、完了後に再度 review-agent + 型チェック Agent を並行起動する
- **両方とも OK** → `current.md` が「進行中タスクなし」になる。次の「Refactor 完了後の仕上げ」へ進む

---

## Refactor 完了後の仕上げ（doc-push と並行）

Refactor が完了したら doc-push-agent への委譲と同時に以下を実施する。

### PR の作成

feature ブランチを push して PR を作成する。doc-push は `.claude/` を main に直接 push するだけで feature ブランチとは無関係なため、並行して実行できる。

```bash
git push -u origin <ブランチ名>
gh pr create --base main --head <ブランチ名> --title "..." --body "..."
```

PR body の Test plan は「実施済み」と「手動確認」を分けて記載する：

```markdown
## Test plan

**実施済み**
- [x] `pnpm exec vitest run` — <N> ファイル / <N> テスト全 Green
- [x] `pnpm tsc --noEmit` — 型エラーなし

**手動確認（マージ前）**
- [ ] <ブラウザで確認すべき動作>
```

PR 作成後は必ず PR の URL をユーザーに伝える（最終行に URL のみ貼る）。マージの促しや補足説明は不要。

### 導通テスト（smoke test）がある場合

merge-gate.md にスモークテスト手順が定義されている場合は、PR 作成後にテストを実行し結果をユーザーに伝える。

### docs 昇格後の specs/proceed.md 削除

TDD 完了後に spec を docs/ に昇格させたら、`specs/proceed.md` が残っている場合は削除する。

```bash
rm -f .claude/specs/proceed.md
```

### grill の対象スコープ

- **対象**: 当該 spec に記載された実装済み決定事項のみ
- **対象外**: spec の「スコープ外」に明記された将来タスクの設計判断（それは次の spec で詰める）
- **実装中に spec で詰められなかったことが判明したとき**: 実装を止めてユーザーに質問し、合意を得てから続ける

---

## 参照すべき rules

作業前に必ず確認：

- [merge-gate.md](./merge-gate.md) … main マージ前のゲート（grill・スモーク・公式照合）。TDD の外側ループ
- [testing-comment-rules.md](../docs/rules/testing-comment-rules.md) … フェーズコメント規約
- [repository-structure-doc-01.md](../docs/repository-structure/repository-structure-doc-01.md) … ファイル配置ルール
- テスト対象のインターフェース・型定義（entities/, repositories/, services/）

### DBが絡む機能の場合

マイグレーション追加・型定義の更新が必要なときは [supabase-db-rules.md](../docs/rules/supabase-db-rules.md) を参照すること。マイグレーション SQL 作成 → `supabase db push` → `npm run types:supabase` の順で実行してから、テストと実装を書く。

---

## Step 1: Red フェーズ（失敗するテストを書く）

### テストファイルの配置

テストファイルは **テスト対象と同じディレクトリ** に置く。

```
src/hooks/useAddTodo.ts        → src/hooks/useAddTodo.test.tsx
src/services/AuthService.ts   → src/services/AuthService.test.ts
```

### カスタムフック（hooks/）のボイラープレート

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../contexts/AuthContext";
import type { AuthUser } from "../entities/AuthUser";
import type { Task } from "../entities/Task";
import { TodosRepositoryContext } from "../contexts/TodosRepositoryContext";
import type { TodosRepository } from "../repositories/TodosRepository";

// ── モックデータ ────────────────────────────────────────
const mockUser: AuthUser = {
  id: "user-1",
  name: "テストユーザー",
  email: "test@example.com",
  role: "staff",
};

const mockTasks: Task[] = [
  { id: "task-1", title: "タスク1", done: false, updatedAt: new Date().toISOString() },
];

// ── ミューテーションモック ───────────────────────────────
// vi.mock はファイル先頭にホイストされるので必ずモジュールレベルに書く
const mockAddMutate = vi.fn();
vi.mock("./useAddTodo", () => ({
  useAddTodo: () => ({ mutate: mockAddMutate }),
}));

// ── リポジトリモック ────────────────────────────────────
const mockRepository: TodosRepository = {
  getTodosByUserId: vi.fn().mockResolvedValue([]),
  add: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

// ── 認証コンテキストモック ──────────────────────────────
const mockAuthContext = {
  authUser: mockUser,
  pendingEmail: null,
  loading: false,
  loginMutation: {} as unknown,
  signinMutation: {} as unknown,
  logoutMutation: {} as unknown,
} as InstanceType<typeof AuthContext>;

// ── Wrapper ─────────────────────────────────────────────
// プロバイダー階層: QueryClientProvider > AuthContext > TodosRepositoryContext
function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        AuthContext.Provider,
        { value: mockAuthContext as never },
        createElement(
          TodosRepositoryContext.Provider,
          { value: mockRepository },
          children,
        ),
      ),
    );
}

// ── テスト本体 ───────────────────────────────────────────
describe("useXxx", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(["todos", "list", mockUser], mockTasks);
    mockAddMutate.mockClear();
  });

  describe("xxxHandler", () => {
    it("正常系: ○○のとき △△を呼ぶ", () => {
      // 準備: hookを初期化
      const { result } = renderHook(() => useXxx(), {
        wrapper: createWrapper(queryClient),
      });
      // Arrange: テスト対象ハンドラーを取り出す
      const [, { xxxHandler }] = result.current;

      // Act
      act(() => {
        xxxHandler("引数");
      });

      // Assert
      expect(mockAddMutate).toHaveBeenCalledWith("引数");
    });

    it("異常系: ○○のとき △△を呼ばない", () => {
      // 準備: hookを初期化
      const { result } = renderHook(() => useXxx(), {
        wrapper: createWrapper(queryClient),
      });
      // Arrange: テスト対象ハンドラーを取り出す
      const [, { xxxHandler }] = result.current;

      // Act
      const ret = xxxHandler("");

      // Assert
      expect(ret).toBe(false);
      expect(mockAddMutate).not.toHaveBeenCalled();
    });
  });
});
```

---

## Step 2: Green フェーズ（最小限の実装で通す）

1. `pnpm vitest run <テストファイルパス>` で Red を確認
2. テストが通る **最小限の実装** だけ書く
3. 余分な処理・最適化は一切しない

### 実装ファイルの配置

| 対象 | 配置先 |
|---|---|
| カスタムフック | `src/hooks/` |
| ビジネスロジック | `src/services/` |
| データアクセス | `src/repositories/` |
| 型定義 | `src/entities/` |

---

## Step 3: Refactor フェーズ

- テストが全部 Green のまま整理する
- 重複するモック定義をまとめる
- ハンドラーの命名を `<action>Handler` 形式に統一する
- クエリキーを `["todos", "list", authUser]` の階層構造で統一する

---

## パターン集

### TanStack Query キャッシュの事前注入

非同期フェッチをスキップして同期的にテストするための基本パターン：

```ts
queryClient.setQueryData(["todos", "list", mockUser], mockTasks);
```

### Optimistic Update をテストする

```ts
it("楽観的更新: mutate前にキャッシュが更新される", async () => {
  // 準備: hookを初期化
  const { result } = renderHook(() => useTodos(), {
    wrapper: createWrapper(queryClient),
  });
  // Arrange: テスト対象ハンドラーを取り出す
  const [, { toggleTaskDoneHandler }] = result.current;

  // Act
  act(() => {
    toggleTaskDoneHandler("task-1");
  });

  // Assert: mutate 前にキャッシュが更新されていること
  const cached = queryClient.getQueryData<Task[]>(["todos", "list", mockUser]);
  expect(cached?.find(t => t.id === "task-1")?.done).toBe(true);
});
```

### サービス層のテスト（wrapper 不要）

```ts
describe("MockAuthService", () => {
  it("ログイン成功時に AuthUser を返す", async () => {
    const service = new MockAuthService();

    // Act
    const user = await service.login({ email: "test@test.com", password: "pass" });

    // Assert
    expect(user.email).toBe("test@test.com");
  });
});
```

---

## チェックリスト

**Red:**
- [ ] テストファイルを対象と同じディレクトリに作成した
- [ ] `createWrapper` に必要なプロバイダーを揃えた
- [ ] `beforeEach` で QueryClient を再作成・キャッシュを注入した
- [ ] モック関数を `beforeEach` で `.mockClear()` した
- [ ] 各 `it()` にフェーズコメントを書いた
- [ ] `pnpm vitest run` で Red を確認した

**Green:**
- [ ] 最小限の実装で全テストが通った
- [ ] 余分な処理を追加していない

**Refactor:**
- [ ] テストが全部 Green のままリファクタした
- [ ] 命名規約に沿っている（`<action>Handler`、クエリキー階層）
