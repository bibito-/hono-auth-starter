# pnpm v11 セットアップ

## ビルドスクリプトの許可

pnpm v11 ではビルドスクリプトはデフォルトでブロックされる。
設定箇所は `pnpm-workspace.yaml`（`package.json` の `pnpm` キーは v10以前の書き方）。

```yaml
# pnpm-workspace.yaml
allowBuilds:
  esbuild: true
  workerd: true
  sharp: true
  # Cloudflare Agents SDK の推移依存（agents→just-bash）。workerd ランタイムでも
  # Vercel SPA ビルドでも未使用の native addon なのでビルドしない（ビルドすると
  # 環境によっては node-gyp が失敗する）。
  '@mongodb-js/zstd': false
  core-js-pure: true
  node-liblzma: false
```

## よくあるパッケージ対応表

| 警告に出るパッケージ | 追加する設定 | 備考 |
|---|---|---|
| esbuild | `esbuild: true` | |
| workerd | `workerd: true` | |
| sharp | `sharp: true` | |
| `@mongodb-js/zstd` | `'@mongodb-js/zstd': false` | `agents` SDK の間接依存。未使用なのでビルド自体をスキップする |
| core-js-pure | `core-js-pure: true` | `agents` SDK の間接依存 |
| node-liblzma | `node-liblzma: false` | `agents` SDK の間接依存。未使用なのでビルド自体をスキップする。ビルドすると devcontainer や Vercel で native addon のビルドに失敗することがある |

## 設定後の手順

```bash
pnpm install
```

`Ignored build scripts` の警告が消えれば完了。

## npm create との違い

`npm create cloudflare@latest -- ai-todo --framework hono`（`--` が必要）で作成後、
pnpm に切り替える場合：

```bash
rm package-lock.json
pnpm install
```
