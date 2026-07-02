# Claude Code harness の技術的知見

最終更新: 2026-07-02
ステータス: 完了

## 概要

`.claude/` ディレクトリの更新を `doc-push-agent`（`permissionMode: bypassPermissions`）に委譲した際、
main への直接 push がユーザー確認待ちでブロックされる事象が発生した。原因と対処を記録する。

## 実装経験由来（公式未確認）

- `doc-push-agent` は `bypassPermissions` で動作するため、通常はツール呼び出しのたびに承認プロンプトは出ない
- しかし Claude Code harness には、agent の `permissionMode` 設定とは独立に、「[Git Push to Default Branch]」カテゴリの操作を検知する安全機構が存在する
- この機構は「エージェントがmainへpushしたら常に止める」という一律ルールではなく、**プロジェクト自身が宣言している手順（例: CLAUDE.md に書かれた `/doc-push` の説明文）と、エージェントが実際に取った行動が食い違っている場合に介入する**、という挙動が観測された
  - 具体例: CLAUDE.md の `/doc-push` の説明が「main 向け PR を作成する」となっていたが、実装（`doc-push-agent.md`）は PR を作らず直接 push するのみだった。この不一致が「プロジェクトの宣言した手順（PR経由）に反してレビューを経ずに直接pushした」という警告としてブロックされた
  - CLAUDE.md の説明文を実装（直接push）に一致させたところ、以降の同種の doc-push は警告なく push まで完了した
- **教訓:** エージェントの実行内容を説明するドキュメント（CLAUDE.md のスラッシュコマンド説明・`.claude/skills/*.md`・`.claude/agents/*.md`）は、実装と乖離させないこと。乖離があると harness の安全機構が意図せず発火し、本来「ユーザー関与不要」設計のワークフロー（doc-push等）で手動確認が挟まる
- **対処:** `.claude/` 配下のドキュメント（特に CLAUDE.md のスラッシュコマンド一覧）を変更したときは、対応する `.claude/skills/*.md` / `.claude/agents/*.md` の実装記述と食い違いがないか毎回突き合わせる

## 関連ファイル

```
CLAUDE.md                          # スラッシュコマンド説明（実装と一致させる）
.claude/skills/doc-push.md         # doc-push の実装手順
.claude/agents/doc-push-agent.md   # doc-push-agent の実装手順
```
