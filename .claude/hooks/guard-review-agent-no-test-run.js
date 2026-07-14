let d = '';
process.stdin.on('data', (c) => (d += c));
process.stdin.on('end', () => {
  const o = JSON.parse(d);
  const cmd = (o.tool_input || {}).command || '';
  const agentType = o.agent_type;

  // agent_type はサブエージェント実行時のみハーネスが注入するフィールド。
  // メイン Claude から呼ばれた場合は undefined になる。
  if (agentType !== 'kit-push-review-agent') {
    process.exit(0);
  }

  // kit-push-review-agent は静的レビュー専任のため、テスト実行・型チェックを禁止する。
  //
  // 言語ごとの列挙。スタックを増やしたらここに足す（プロジェクト側で上書き可能にすると
  // ガードを緩める抜け道になるため、列挙は core が持ち続ける）。
  //   単体コマンド: vitest・jest・tsc（JS/TS）／pytest・mypy・pyright（Python）／rspec（Ruby）／phpunit（PHP）
  //   <runner> test 形式: pnpm・npm・yarn・bun（JS/TS）／uv・poetry（Python）／go・cargo・dotnet／make・rake・gradle・mvn
  const forbidden =
    /\b(vitest|jest|tsc|pytest|mypy|pyright|rspec|phpunit)\b|\b(pnpm|npm|yarn|bun|uv|poetry|go|cargo|dotnet|make|rake|gradle|mvn)\s+(run\s+)?test\b/i;
  if (forbidden.test(cmd)) {
    console.error('禁止: 静的レビュー専任のため、テスト・型チェックは実行しない');
    process.exit(2);
  }
  process.exit(0);
});
