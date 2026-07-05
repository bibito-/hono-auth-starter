let d = '';
process.stdin.on('data', (c) => (d += c));
process.stdin.on('end', () => {
  const o = JSON.parse(d);
  const cmd = (o.tool_input || {}).command || '';
  // review-agent は静的レビュー専任のため、テスト実行(vitest)・型チェック(tsc)は
  // impl-agent / tsc-agent の担当領域であり review-agent 側での実行を禁止する。
  const forbidden = /\b(vitest|tsc)\b|\bpnpm\s+(run\s+)?test\b/i;
  if (forbidden.test(cmd)) {
    console.error('禁止: review-agentはvitest/tscを実行しない（静的レビュー専任。テストはimpl-agent、型チェックはtsc-agentが担当）');
    process.exit(2);
  }
});
