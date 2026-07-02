let d = '';
process.stdin.on('data', (c) => (d += c));
process.stdin.on('end', () => {
  const o = JSON.parse(d);
  const cmd = (o.tool_input || {}).command || '';
  // verb の直後（フラグ・クォート引数を挟んでもよい）に .env / .dev.vars 系ファイルが
  // 続く場合のみブロックする。heredoc 本文中の無関係な文言との組み合わせで
  // 誤検知しないよう、verb とファイルの位置関係を見る（単純な存在チェックではない）。
  const dangerous =
    /\b(cat|less|more|head|tail|bat|nl|tac|od|xxd|hexdump|strings|awk|sed|grep|egrep|fgrep|vim|vi|nano|emacs|node|python|perl|ruby)\b(?:\s+(?!<<)[^\s|;&]+)*\s+\S*\.(?:env(?:\.[\w-]+)?|dev\.vars(?:\.[\w-]+)?)\b/i;
  if (dangerous.test(cmd)) {
    console.error('危険: .env/.dev.vars の内容を読み取るコマンドは禁止');
    process.exit(2);
  }
});