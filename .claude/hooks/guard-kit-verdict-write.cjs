// .cjs 拡張子の理由: このファイルは core kit 経由で他プロジェクト（"type": "module" のもの・
// そうでないもの・package.json を持たない環境）へ配布される。ESM と CommonJS 両環境で
// 動作させるには .cjs 拡張子で CommonJS として固定するのが標準。

let d = '';
process.stdin.on('data', (c) => (d += c));
process.stdin.on('end', () => {
  const o = JSON.parse(d);
  const filePath = (o.tool_input || {}).file_path || '';
  const agentType = o.agent_type;

  // agent_type はサブエージェント実行時のみハーネスが注入するフィールド。
  // メイン Claude から呼ばれた場合は undefined になる。
  // ハーネスが注入するため、ユーザーレベルでは偽造できない（偽造は kit 側 CI と
  // ユーザーの手動マージの層で対処）。

  // verdict ファイル（steering/reviews/[...]-kit-push[...].md）への Write/Edit を
  // kit-push-review-agent のみに制限。メイン Claude や他の agent による
  // 手動の verdict 作成を防ぎ、常に agent のレビュー経由になるようにする。
  if (filePath.includes('.claude/steering/reviews/') && filePath.includes('kit-push')) {
    if (agentType !== 'kit-push-review-agent') {
      console.error(
        'kit-push verdict ファイルの書き込みは kit-push-review-agent 専用です。ゲートに阻まれた場合は agent を再起動してレビューを得てください。'
      );
      process.exit(2);
    }
  }

  process.exit(0);
});
