#!/usr/bin/env node
// .claude/manifests/hook-registrations.json の宣言を .claude/settings.json へマージする。
//
// なぜ必要か: フック本体（.claude/hooks/）は配布されるが、settings.json は配布できない
// （プロジェクトごとに permissions・MCP 設定が異なり、上書きすると壊れる）。その結果
// 「フックは配られているが一度も登録されておらず、一度も発火していない」状態が生まれる。
// 発火しないゲートは、無いより悪い（効いていると思い込むため）。
//
// 契約:
//   1. 宣言のうち不足している登録だけを足す。既存エントリの変更・削除・並べ替えはしない
//   2. プロジェクト独自のフック登録（core が知らないもの）には触れない
//   3. hooks 以外のキー（permissions 等）には触れない
//   4. 冪等
//   5. 意味を変えない。インデント幅と末尾改行は既存ファイルを踏襲する。
//      ただし1行に畳んであるオブジェクトは JSON の往復で展開される（書式情報が残らないため）。
//      これは初回だけの正規化であり、意味は変わらない
//   6. --check は書き込まず、不足があれば exit 1
//   7. 想定外の構造を見つけたら、書き込まずに exit 1 で止まる。壊れた settings.json を
//      黙って作るくらいなら、何もせず失敗するほうがよい
//
// .cjs の理由: 配布先の package.json が "type": "module" でも、そもそも package.json が
// 無くても動く必要がある。
//
// 使い方:
//   node .claude/scripts/merge-hook-registrations.cjs           不足分を書き込む
//   node .claude/scripts/merge-hook-registrations.cjs --check   書き込まず、不足があれば exit 1
const fs = require('fs');
const path = require('path');

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const manifestPath = path.join(root, '.claude', 'manifests', 'hook-registrations.json');
const settingsPath = path.join(root, '.claude', 'settings.json');
const checkOnly = process.argv.includes('--check');

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

if (!fs.existsSync(manifestPath)) {
  console.error(`宣言ファイルがありません: ${manifestPath}`);
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const registrations = manifest.registrations || [];

let raw = '';
let settings = {};
if (fs.existsSync(settingsPath)) {
  raw = fs.readFileSync(settingsPath, 'utf8');
  settings = JSON.parse(raw);
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// 構造の検証。想定外の形を見つけたら書き込まずに止める。
// 例えば settings.hooks が配列だと、settings.hooks[event] への代入は配列の
// 名前付きプロパティになり JSON 化で消える。「追記しました」と表示しながら
// 何も書かれない、という最悪の失敗になるため、その前に落とす。
if (!isPlainObject(settings)) fail('settings.json のトップレベルがオブジェクトではありません');
if (settings.hooks !== undefined && !isPlainObject(settings.hooks)) {
  fail('settings.json の hooks がオブジェクトではありません');
}
settings.hooks = settings.hooks || {};

for (const [event, groups] of Object.entries(settings.hooks)) {
  if (!Array.isArray(groups)) fail(`settings.json の hooks.${event} が配列ではありません`);
  for (const g of groups) {
    if (!isPlainObject(g)) fail(`settings.json の hooks.${event} に非オブジェクトの要素があります`);
    if (g.hooks !== undefined && !Array.isArray(g.hooks)) {
      fail(`settings.json の hooks.${event}[matcher=${g.matcher}].hooks が配列ではありません`);
    }
    if (g.hooks && g.hooks.some((h) => !isPlainObject(h))) {
      fail(`settings.json の hooks.${event}[matcher=${g.matcher}].hooks に非オブジェクトの要素があります`);
    }
  }
}

// インデント幅と末尾改行は既存ファイルを踏襲する。JSON.stringify の既定値で書き戻すと、
// 追記が1エントリでもファイル全体が再インデントされ、diff が全面書き換えになって
// レビュー不能になる。
const indentMatch = raw.match(/^([ \t]+)"/m);
const indent = indentMatch ? indentMatch[1] : '  ';
const trailingNewline = raw === '' || raw.endsWith('\n');

// 登録済み判定。単なるパス文字列の検索では、echo '.claude/hooks/...' のような
// 表示専用コマンドまで登録済みと誤認する。そこで、単純な `node <引数...>` を最低限
// 字句分割し、フックが独立した引数として node に渡る場合だけ登録済みとみなす。
//
// これは意図的に保守的である。シェルの複雑な構文、別のランナー、判別できないクォート
// は未登録扱いにする。その場合は重複登録される可能性があるが、未登録なのに「不足なし」
// と報告してゲートを入れ損なうより安全である。
const splitShellWords = (command) => {
  if (typeof command !== 'string') return null;

  const words = [];
  let word = '';
  let quote = null;
  let escaping = false;
  let hasWord = false;

  for (const char of command) {
    if (escaping) {
      word += char;
      hasWord = true;
      escaping = false;
      continue;
    }
    if (char === '\\') {
      escaping = true;
      hasWord = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else word += char;
      hasWord = true;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      hasWord = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (hasWord) {
        words.push(word);
        word = '';
        hasWord = false;
      }
      continue;
    }
    // 演算子やリダイレクトを含むコマンドは、誤検出を避けるため判定しない。
    if (';&|<>`()'.includes(char)) return null;
    word += char;
    hasWord = true;
  }

  if (quote || escaping) return null;
  if (hasWord) words.push(word);
  return words;
};

const referencesHook = (command, hook) => {
  const words = splitShellWords(command);
  if (!words || words[0] !== 'node') return false;
  // `node -e '...hook path...'` はフックの実行ではなく、コード中の文字列かもしれない。
  if (words.includes('-e') || words.includes('--eval')) return false;

  const acceptedPaths = new Set([
    hook,
    `./${hook}`,
    `$CLAUDE_PROJECT_DIR/${hook}`,
    `\${CLAUDE_PROJECT_DIR}/${hook}`,
  ]);
  return words.slice(1).some((word) => acceptedPaths.has(word));
};

const added = [];

for (const reg of registrations) {
  const { event, matcher, hook } = reg;
  if (!event || !matcher || !hook) fail(`宣言が不完全です: ${JSON.stringify(reg)}`);

  settings.hooks[event] = settings.hooks[event] || [];
  const groups = settings.hooks[event];

  // 登録済みかは「同じ event かつ同じ matcher のグループ」の中だけで判定する。
  // event 全体を走査すると、宣言が Write|Edit なのに同じ event の Bash に同名フックが
  // あるだけで「登録済み」と誤認し、必要な登録が永久に入らない。
  const matchingGroups = groups.filter((g) => g.matcher === matcher);
  const target = matchingGroups[0];
  const alreadyRegistered = matchingGroups.some((g) =>
    (g.hooks || []).some((h) => referencesHook(h.command, hook))
  );
  if (alreadyRegistered) continue;

  const entry = {
    type: 'command',
    command: `node "$CLAUDE_PROJECT_DIR/${hook}"`,
  };
  if (reg.if) entry.if = reg.if;
  if (reg.blocking) entry.blocking = true;

  if (target) {
    target.hooks = target.hooks || [];
    target.hooks.push(entry);
  } else {
    groups.push({ matcher, hooks: [entry] });
  }

  added.push(`${event} / ${matcher} / ${path.basename(hook)}`);
}

if (added.length === 0) {
  console.log('フック登録: 不足なし');
  process.exit(0);
}

if (checkOnly) {
  console.error('settings.json に未登録のフックがあります:');
  for (const a of added) console.error(`  - ${a}`);
  process.exit(1);
}

// 一時ファイルへ書いてから rename する。原ファイルへ直接書くと、途中で I/O が
// 失敗したときに settings.json が切り詰められた状態で残る。
const tmpPath = `${settingsPath}.tmp-${process.pid}`;
const existingMode = fs.existsSync(settingsPath) ? fs.statSync(settingsPath).mode & 0o7777 : null;
try {
  fs.writeFileSync(tmpPath, JSON.stringify(settings, null, indent) + (trailingNewline ? '\n' : ''));
  if (existingMode !== null) fs.chmodSync(tmpPath, existingMode);
  fs.renameSync(tmpPath, settingsPath);
} catch (e) {
  try {
    fs.unlinkSync(tmpPath);
  } catch (_) {
    // 一時ファイルが無ければ何もしない
  }
  fail(`settings.json の書き込みに失敗しました: ${e.message}`);
}

console.log('settings.json に追記しました:');
for (const a of added) console.log(`  - ${a}`);
