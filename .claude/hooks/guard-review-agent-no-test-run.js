let d = '';
process.stdin.on('data', (c) => (d += c));
process.stdin.on('end', () => {
  const o = JSON.parse(d);
  const cmd = (o.tool_input || {}).command || '';
  // review-agent は静的レビュー専任のため、テスト実行・型チェックは
  // impl-agent / 型チェック agent(tsc-agent・mypy-agent) の担当領域であり
  // review-agent 側での実行を禁止する。
  //
  // 言語ごとの列挙。スタックを増やしたらここに足す（プロジェクト側で上書き可能にすると
  // ガードを緩める抜け道になるため、列挙は core が持ち続ける）。
  //   単体コマンド: vitest・jest・tsc（JS/TS）／pytest・mypy・pyright（Python）／rspec（Ruby）／phpunit（PHP）
  //   <runner> test 形式: pnpm・npm・yarn・bun（JS/TS）／uv・poetry（Python）／go・cargo・dotnet／make・rake・gradle・mvn
  const forbidden =
    /\b(vitest|jest|tsc|pytest|mypy|pyright|rspec|phpunit)\b|\b(pnpm|npm|yarn|bun|uv|poetry|go|cargo|dotnet|make|rake|gradle|mvn)\s+(run\s+)?test\b/i;
  if (forbidden.test(cmd)) {
    console.error('禁止: review-agentはテスト・型チェックを実行しない（静的レビュー専任。テストはimpl-agent、型チェックはtsc-agent/mypy-agentが担当）');
    process.exit(2);
  }
});
