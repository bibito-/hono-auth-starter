let d = '';
process.stdin.on('data', (c) => (d += c));
process.stdin.on('end', () => {
  const o = JSON.parse(d);
  const cmd = (o.tool_input || {}).command || '';
  // $CLAUDE_PROJECT_DIR から動的にプロジェクトパスを解決する。テンプレート化して
  // 他プロジェクトへコピーしても、パスのハードコード置換が不要になる。
  const projectDirBody = (process.env.CLAUDE_PROJECT_DIR || '').replace(/^\//, '');
  const escaped = projectDirBody.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`rm\\s+-rf\\s+(\\/(?!${escaped})|~|\\$HOME|\\.\\.\\/)`, 'i');
  if (pattern.test(cmd)) {
    console.error('危険: プロジェクト外への rm -rf は禁止');
    process.exit(2);
  }
});
