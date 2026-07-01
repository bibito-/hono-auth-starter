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
```

## よくあるパッケージ対応表

| 警告に出るパッケージ | 追加する設定 |
|---|---|
| esbuild | `esbuild: true` |
| workerd | `workerd: true` |
| sharp | `sharp: true` |

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
