# ドキュメント作成ガイド（ポインタ）

書き方・配置・INDEX.md 運用・修正履歴の記録方法の全文は
[.claude/docs/rules/documentation-guide.md](../docs/rules/documentation-guide.md) にある。
**specs/・docs/ への書き込み、INDEX.md の更新、doc の改訂を行う前に必ず全文を読むこと。**

常時適用される最低限のルール:

- ライフサイクルは specs/（実装前の仕様書）→ 実装 → docs/（永続アーカイブ）
- docs/ を参照するときは同フォルダで最も連番が高いファイルを読む
- 独自ドメイン・メールアドレス・DNS値・外部サービス設定値などセンシティブ情報を含む
  ドキュメントは `.claude/docs/`（git追跡）に置かず、ルートの `docs/`（gitignore）に置く
