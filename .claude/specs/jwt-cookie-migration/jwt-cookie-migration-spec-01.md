# jwt-cookie-migration 実装仕様書

最終更新: 2026-07-04
ステータス: **仕様確認中**

## 概要

JWT（`access_token`・`refresh_token`）の保存先をブラウザの `localStorage`/`Authorization` ヘッダー方式から httpOnly Cookie へ移行し、XSS 発生時のトークン窃取を防ぐ。Cookie 化に伴い新たに生じる CSRF リスクを HMAC ベースの二重送信トークン（Signed Double-Submit Cookie）で防御し、認証フロー（ログイン・サインアップ・リフレッシュ・ログアウト・プロフィール取得）を Supabase 直叩きから Hono 経由のプロキシ方式へ切り替える。

## 移植元

`ai-todo` の `.claude/docs/features/auth/jwt-cookie-migration-doc-01.md`（確定仕様。実装・grill・本番スモークテストまで完了済み、2026-07-04時点）を hono-auth-starter の現行実装（Phase 1 JWT 検証ミドルウェア・`Authorization: Bearer` ヘッダー方式）に移植する。設計判断は検証済みのため踏襲し、hono-auth-starter 固有の差分（`TodoAgent`/todos 機能が存在しない）のみ調整する。

**実装方針:** ai-todo の `main` ブランチの該当ファイルをそのまま移植する。TDD の Red を人工的にやり直さず、移植したテスト込みでコードを持ち込み、hono-auth-starter 固有の差分（import パス・既存ファイルとの統合箇所）のみ調整する。`AuthService` / `SigninResult` / `AuthUser` の型は両リポジトリで完全一致していることを確認済み（フィールド差分調整は不要）。

## 設計方針

| 項目 | 決定内容 | 理由 |
|---|---|---|
| JWT保存先 | httpOnly Cookie（`access_token`・`refresh_token`） | JSから一切読めない唯一の保存先。`localStorage`や非httpOnly Cookieは、XSS注入コードから見れば正規JSと同一実行コンテキストのため区別なく読み取られる |
| 認証フロー | Hono経由のプロキシ方式（`login`/`signup`/`refresh`/`logout`/`me`を新設） | httpOnly Cookieの発行（`Set-Cookie`）はサーバーでしかできない。`supabase-js`のブラウザ直接呼び出しでは実現不可 |
| CSRF対策 | Signed Double-Submit Cookie（HMACベース） | Cookieの自動送信（`SameSite=None`）により新たに生じるCSRFリスクへの対処。素の二重送信より、Cookie注入型の偽装にも耐性がある |
| Cookie属性 | `httpOnly; Secure; SameSite=None; Path=/`、Max-Age省略（セッションCookie） | Vercel/CFWが別ドメインのため暫定的に`None`必須。ブラウザを閉じたら寿命を切る設計 |
| クライアントの`supabase-js` | クライアントコードからの使用・importを完全撤去（`supabaseClient.ts`削除）。npm依存自体は`package.json`から削除しない | ログイン・profiles取得が全てHono経由になり、client側にSupabase直叩きの用途がなくなる。ただしサーバー側（`src/server/`）は引き続き使用するため依存除去は不可 |
| `useUserManagement.ts`のRealtime | Supabase Realtime購読を削除し、`fetchUsers()`の手動再取得のみに縮退 | `profiles`のSELECT RLSが`auth.uid()`依存のため、Cookie化後はブラウザがSupabase JWTを持たずanonロール扱いになりRLSで弾かれ機能しなくなる。ライブ反映の復活は別spec「user-management-realtime」に切り出す（下記スコープ外を参照） |
| マルチタブ同期 | 対応しない（`BroadcastChannel`不採用）。他タブでのログアウトは次のAPI呼び出し時の401検知に委ねる | Cookieはブラウザ全体で共有されるため、ログアウト後は他タブの次回リクエストが自動的に401になる |
| `apiFetch`の401処理 | 即ログアウトではなく`/api/auth/refresh`を1回試行→成功なら元のリクエストをリトライ、失敗時のみログアウト | `supabase-js`自動リフレッシュと同等の、セッションが途切れないUXを維持するため |
| 同一ドメイン化（`SameSite=Lax`化） | 今回のスコープ外 | 独自ドメイン取得・DNS設定という外部依存があり、XSS対策という本題の実装を遅らせるべきではない |

## 認証プロキシのレスポンス契約

```
POST /api/auth/login   { email, password }
  → 200 { user: AuthUser, csrf_token: string }
  → 401 { error: "invalid_credentials" }

POST /api/auth/signup  { email, password }
  → 200 { status: "verified", user: AuthUser, csrf_token: string }   (即セッションが張られた場合)
  → 200 { status: "pending" }                                        (data.session が null＝メール確認待ち)
  → 400 { status: "failure", error: string }                         (signUpエラー or data.user.identities.length === 0)

POST /api/auth/refresh  (ボディなし。refresh_token Cookieを使う)
  → 200 { csrf_token: string }   (新しいaccess_token/refresh_token/csrf_secretをSet-Cookie、csrf_tokenを再計算して返す)
  → 401 {}                       (refresh失敗。clearAuthCookies(c)してから401)

POST /api/auth/logout  (CSRF検証対象)
  → 200 {}  (Supabase側のsignOut呼び出し結果に関わらず必ずclearAuthCookies(c)する。fail-safe)

GET /api/auth/me  (authMiddleware通過が前提)
  → 200 { user: AuthUser, csrf_token: string }  (csrf_secret Cookieから再計算)
  → 401 {}
```

`role`・`username`は`profiles`テーブルから取得する（既存`requireRole.ts`と同じ「caller JWT + publishable key → RLS」パターン。`src/server/lib/fetchUserProfile.ts`に共通化）。`name`/`email`は`supabase.auth.getUser(accessToken)`から取得する（`authMiddleware`は`{ id }`しか公開しないため、`me`ハンドラーが個別に取得する）。

## ミドルウェア適用ルール（authGuard・csrfGuard）

ログイン前は有効な`access_token`が存在し得ないため、パス単位で除外する。`src/server/middleware/routeGuards.ts`に集約（`authMiddleware`/`csrfMiddleware`自体はパスを意識せず単体テスト可能なまま維持）。

| ルート | authGuard | csrfGuard |
|---|---|---|
| `POST /api/auth/login` | 適用しない | 適用しない |
| `POST /api/auth/signup` | 適用しない | 適用しない |
| `POST /api/auth/refresh` | **適用しない**（access_tokenが期限切れの状態で呼ばれるのが前提のため） | 適用する |
| `POST /api/auth/logout` | 適用する | 適用する |
| `GET /api/auth/me` | 適用する | 適用しない（GETのため対象外） |
| 既存の`/api/users*` | 適用する | POST/PATCH/DELETEに適用する |

## 実装ステップ

### Step 1 — サーバー: 認証基盤ライブラリの新規追加

対象: `src/server/lib/{authCookies,csrf,supabaseClients,fetchUserProfile}.ts` + 各 `.test.ts`

- ai-todoの`main`ブランチの同名ファイルをそのまま移植する。import パス（`@server/`・`@shared/`エイリアス）は共通のため調整不要
- `authCookies.ts`: `setAuthCookies`/`clearAuthCookies`/`getAccessToken`/`getRefreshToken`/`setCsrfSecretCookie`/`getCsrfSecret`。Cookie属性は`httpOnly: true, secure: true, sameSite: "None", path: "/"`（Max-Age指定なし）
- `csrf.ts`: `generateCsrfSecret`/`deriveCsrfToken`/`verifyCsrfToken`（HMAC-SHA256、Web Crypto API使用）

### Step 2 — サーバー: ミドルウェア改修・新規追加

対象: `src/server/middleware/{auth.ts, requireRole.ts}`（改修）, `src/server/middleware/{csrf.ts, routeGuards.ts}`（新規+`.test.ts`）

- `auth.ts`: トークン取得元を`c.req.header("Authorization")`から`getAccessToken(c)`（Cookie）に変更。JWKS検証ロジック自体は変更なし
- `requireRole.ts`: トークン取得元を同様に`getAccessToken(c)!`に変更。それ以外のロジックは変更なし
- `src/server/handlers/listUsers.ts`（改修・実装時に判明）: `requireRole.ts`と同様に`c.req.header("Authorization")`直読みが残っていたため`getAccessToken(c)`に変更（Step 5とは無関係だがCookie移行の影響を受けるため同時に対応）
- `csrf.ts`（新規）: Signed Double-Submit Cookie検証ミドルウェア
- `routeGuards.ts`（新規）: `authGuard`/`csrfGuard`。`AUTH_EXEMPT_PATHS = ["/api/auth/login", "/api/auth/signup", "/api/auth/refresh"]`、`CSRF_EXEMPT_PATHS = ["/api/auth/login", "/api/auth/signup"]`（ai-todoには`/api/todos/ws`関連の除外があるが、hono-auth-starterには存在しないため対象外）

### Step 3 — サーバー: 認証プロキシハンドラー新規追加

対象: `src/server/handlers/auth/{login,signup,refresh,logout,me}.ts` + 各 `.test.ts`

- ai-todoからそのまま移植。レスポンス契約は上記の通り

### Step 4 — サーバー: 型定義

対象: `src/server/types/cloudflare-env.d.ts`（新規）, `src/shared/entities/AuthUser.ts`（新規）

- `cloudflare-env.d.ts`: `wrangler types`が生成する`worker-configuration.d.ts`（自動生成・直接編集禁止）に対する宣言マージ専用ファイル。import/exportを書かない素のグローバルスクリプトとして`interface CloudflareBindings { CSRF_HMAC_SECRET: string }`を追加
- `shared/entities/AuthUser.ts`: `{ id: string; name: string; email: string | undefined; role: UserRole | null; username: string | null }`。既存の`src/client/entities/AuthUser.ts`と完全に同型（確認済み）

### Step 5 — サーバー: server.ts配線・cors.ts改修

対象: `src/server.ts`, `src/server/cors.ts`

- `server.ts`: `app.use("/api/*", authMiddleware)`の直接適用を`authGuard`・`csrfGuard`（`routeGuards.ts`）に置き換え、`/api/auth/*`ルート（login/signup/refresh/logout/me）を追加。既存の`/api/users*`ルート・`export { RateLimiter }`は変更なし
- `cors.ts`: `credentials: false → true`、`allowHeaders`に`X-CSRF-Token`を追加（`X-Ws-Connection-Id`は対象外。追加は別spec「user-management-realtime」で行う）。`ALLOWED_ORIGINS`のTODOプレースホルダーはそのまま維持

### Step 6 — クライアント: HonoAuthService新規追加・main.tsx差し替え

対象: `src/client/services/HonoAuthService.ts` + `.test.ts`, `src/client/main.tsx`

- ai-todoからそのまま移植（`AuthService`インターフェース・`SigninResult`型が完全一致のため調整不要）
- `main.tsx`: `isDev ? new MockAuthService() : new SupabaseAuthService()` を `isDev ? new MockAuthService() : new HonoAuthService()` に変更

### Step 7 — クライアント: apiFetch改修

対象: `src/client/lib/apiFetch.ts` + `.test.ts`

- `credentials: "include"`を追加、`Authorization`ヘッダー付与ロジックを削除
- 状態変更メソッド（POST/PATCH/DELETE）に`HonoAuthService`が保持するCSRFトークンを`X-CSRF-Token`ヘッダーで付与
- 401受信時（`login`/`signup`/`refresh`自身へのリクエストを除く）は`/api/auth/refresh`を1回試行し、成功すれば元のリクエストを1回だけリトライ。失敗時はログイン画面へ遷移
- **重要（移植時に必ず最初から入れること）**: `/api/auth/me`は上記のリトライ・強制遷移ロジックの除外パスとして扱う（refreshの試行はするが、失敗しても`/login`へ強制遷移しない）。理由は下記「移植時に必ず踏襲すべき注意点」を参照。ai-todoの初回実装ではこのガードを見落として無限リロードループを起こしたため、必ず`main`ブランチの最新版（修正後）を参照すること

### Step 8 — クライアント: useUserManagement.ts改修（縮退移植）

対象: `src/client/hooks/useUserManagement.ts`

- `useEffect`内の`supabase.channel("profiles-modify").on("postgres_changes", ...)`購読を削除。それに伴い`@client/clients/supabaseClient`のimportも削除
- マウント時の`fetchUsers()`呼び出しは維持
- `updateUser`/`deleteUser`が成功した直後に明示的に`fetchUsers()`を呼び、一覧を再取得する形に変更（他管理者による同時編集はライブ反映されず、次回操作・再訪問時に反映される縮退運用）

### Step 9 — 削除対象

- `src/client/clients/supabaseClient.ts`
- `src/client/services/SupabaseAuthService.ts`

削除後、`src/client/`配下に`@supabase/supabase-js`のimportが残っていないことを確認する（grep）。

## スコープ外（この spec では対応しない）

- **user-management-realtime**（WebSocket再実装によるユーザー管理画面のRealtime復活） — 別specとして後続実施する（`ai-todo`の`.claude/docs/features/user-management/user-management-realtime-doc-01.md`が参照仕様）
- **CSP（`vercel.json`等）の新規導入** — 上記realtime specでWebSocket（`wss://`）許可とセットで対応する。今回のコア移植ではWebSocketを扱わないため不要
- 同一ドメイン化（`SameSite=Lax`化） — 本番ドメイン構成の確定が前提のため対象外
- マルチタブ即時同期（`BroadcastChannel`）
- レート制限・RBAC自体の変更 — 既存実装のまま。今回は認証方式（トークンの運搬手段）の変更のみが対象

## 移植時に必ず踏襲すべき注意点（ai-todoで実際に踏んだ落とし穴）

### 不具合: `apiFetch`の`/api/auth/me`で無限リロードループ

未ログイン状態でログイン画面を開くと、`getSession()`（`GET /api/auth/me`）の401→自動`refresh`試行→未ログインのため`csrf_secret`が無く`refresh`も403で失敗→`window.location.href = "/login"`で強制遷移、という流れが`/login`表示中でも発生し、フルリロード→再マウント→再度401…の無限ループになる。

原因: `/api/auth/me`は「ログイン状態を確認するための呼び出し」であり401は正常系（未ログイン）だが、`apiFetch`の401処理（保護リソースへのアクセス中にセッションが切れたケースを想定した「refresh試行→失敗なら強制遷移」ロジック）を無条件に適用してしまうと発生する。

対応: `/api/auth/me`のみ「refreshは試みる（access_token期限切れからの復帰は維持）が、失敗しても強制遷移はしない」例外パスとして扱う。401はそのまま呼び出し元へ返し、`getSession()`の`!res.ok → null`処理とルーティングガード（`ProtectedRoute`等）のSPA内遷移に委ねる。

## 開発者が押さえるべき要点（理解必須・ai-todoでのgrill由来）

- CSRFトークンとJWTは役割が別レイヤー。CSRFトークンはユーザー識別能力を持たない乱数由来の値で、「同一オリジンの正規セッションの手続きを経て発行されたリクエストか」だけを保証する。「誰のリクエストか」の識別は引き続きJWT（JWKS署名検証）が担う
- XSS対策とCSRF対策は防ぐ攻撃者モデルが異なる。XSS注入コードは正規JSと同一実行コンテキストで動くため、JS到達可能な場所（`localStorage`・非httpOnly Cookie）に置いた値はCSRFトークンの堅牢さに関わらず読み取られる。httpOnly化だけがXSSに対する実効的な対策になる
- `/api/auth/refresh`は`authMiddleware`の対象外にする。`login`/`signup`の除外理由（トークンがまだ存在しない）とは異なり、`refresh`が呼ばれるのは主に「`access_token`が期限切れになった後」。ここに`authMiddleware`をかけると期限切れトークンが先に401で弾かれて`refresh`ハンドラーに到達できず、セッション更新手段そのものが失われる
- `refresh`成功時、サーバーは`csrf_secret`を新しい値へローテートする。クライアントが新しい`csrf_token`（レスポンスボディ）を保持し直さないと、以降の状態変更リクエストが403で失敗し続ける（`apiFetch`は`refresh`成功時のレスポンスから`csrf_token`を再取得して更新する実装が必須）
- `me`ハンドラーは`authMiddleware`が公開する`{ id }`だけでは`name`/`email`が取れないため、`supabase.auth.getUser(accessToken)`を別途呼ぶ必要がある（`role`/`username`は`fetchUserProfile`で`profiles`から取得）

## 別途必要な対応（実装外・ユーザー自身が行う）

- `CSRF_HMAC_SECRET`をhono-auth-starter用のCloudflare Workers環境に登録する（`ai-todo`とは別プロジェクト・別シークレット値。`wrangler secret put CSRF_HMAC_SECRET`はユーザー自身が実行する）
- README・CLAUDE.md側の認証方式に関する記述更新（Supabase直叩き→Hono経由Cookie方式への言及）は、この spec の実装確定後に別途検討する

## 関連ファイル

```
src/
├── server/
│   ├── lib/
│   │   ├── authCookies.ts          # 新規
│   │   ├── csrf.ts                 # 新規
│   │   ├── supabaseClients.ts      # 新規
│   │   └── fetchUserProfile.ts     # 新規
│   ├── middleware/
│   │   ├── auth.ts                 # 改修: トークン取得元をgetAccessToken(c)（Cookie）に変更
│   │   ├── requireRole.ts          # 改修: 同上
│   │   ├── csrf.ts                 # 新規
│   │   └── routeGuards.ts          # 新規: authGuard/csrfGuard
│   ├── handlers/
│   │   ├── auth/
│   │   │   ├── login.ts            # 新規
│   │   │   ├── signup.ts           # 新規
│   │   │   ├── refresh.ts          # 新規
│   │   │   ├── logout.ts           # 新規
│   │   │   └── me.ts               # 新規
│   │   ├── listUsers.ts            # 改修（実装時に判明）: token取得元をgetAccessToken(c)（Cookie）に変更。RLS委任・service_role不使用のパターン自体は変更なし
│   │   ├── updateUser.ts           # 変更なし（service_role使用のため対象外）
│   │   └── deleteUser.ts           # 変更なし（同上）
│   ├── types/cloudflare-env.d.ts   # 新規
│   └── cors.ts                     # 改修: credentials true、X-CSRF-Token許可
├── shared/entities/AuthUser.ts     # 新規
└── client/
    ├── services/
    │   ├── HonoAuthService.ts      # 新規
    │   └── SupabaseAuthService.ts  # 削除
    ├── clients/supabaseClient.ts   # 削除
    ├── lib/apiFetch.ts             # 改修: credentials include、X-CSRF-Token付与、401時のrefresh再試行
    ├── hooks/useUserManagement.ts  # 改修: profiles Realtime購読を削除、fetchUsers()手動再取得に変更
    └── main.tsx                    # 改修: SupabaseAuthService → HonoAuthServiceの差し替え
```
