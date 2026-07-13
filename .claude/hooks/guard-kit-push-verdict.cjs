// .cjs 拡張子の理由: このファイルは core kit 経由で他プロジェクト（"type": "module" のもの・
// そうでないもの・package.json を持たない環境）へ配布される。ESM と CommonJS 両環境で
// require() 構文を動作させるには .cjs 拡張子で CommonJS として固定するのが必須。
//
// --context モードについて: kit-push-review-agent は --context でこのスクリプトを呼び出し、
// 返される JSON（layer・target_repo・digest）を verdict frontmatter にそのまま転記する。
// 層名の判定をこのスクリプト側に一元化することで、agent が層名を誤判定する余地を無くす。
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 審査対象は 変更集合 ∩ 審査スコープ で決まる。スコープ外しか触っていない push では、
// 審査しても守るものが無いので verdict を要求しない。
//
// スコープの中核はマニフェスト（*-kit-files.txt）の配布物である。それに加えて、
// マニフェストに載らない配布経路（scaffold で一度きりコピーされる骨格、それを実行する
// スクリプト自身）がある。外へ出るのに列挙されていないので、ここで拾う。
//
// **審査するのは外へ出るものだけ。** 外へ出ないファイル（README・設計記録・ゲート定義・
// アプリのコード）は、配布先で意味をなさない語彙が混ざる先が無い。審査1回はエージェント
// 起動ぶんの金と時間であり、守るものが無い push には払わない。ゲート定義や正典の誤りは
// PR の人間レビューと main の保護で受け止める。
//
// **宣言ファイルが無ければ全変更を審査する。** このフックは配布されるが宣言ファイルは
// 配布されない。「無ければマニフェストだけ見る」にすると、宣言を持たない配布先の kit で
// template/ が無審査で外へ出る。宣言し忘れは安全側（審査過剰）に倒すこと。
const REVIEW_SCOPE_FILE = '.kit-push-review-scope.json';

// どの kit にも同じ役割で外へ出るもの。宣言の有無にかかわらず必ず審査する。個別の kit の
// 宣言漏れで配布物が審査を抜けないよう、宣言ファイルではなくここに持つ。
// （層固有の語彙ではなく、kit という構造そのものが持つ役割の名前である）
const MANDATORY_SCOPE = [
  REVIEW_SCOPE_FILE, // 唯一の非配布物。外すとスコープを空にする変更が無審査で通り、ゲートを自分で消せる
  'template/', // scaffold で外へ出る骨格
  'scripts/', // scaffold スクリプト本体。汚染が生成物すべてに焼き付く
];

// マーカー規則で層を判定する関数。kit かどうかの判定も含む。
// 層が判定できたら層名を返す、できなければ null を返す。
function resolveLayer(kitPath) {
  const manifestDir = path.join(kitPath, '.claude', 'manifests');

  if (fs.existsSync(manifestDir)) {
    const files = fs.readdirSync(manifestDir);
    for (const file of files) {
      // ファイル名が "<L>-kit-files.txt" にマッチしたら層名を捕捉
      const match = file.match(/^(.+)-kit-files\.txt$/);
      if (match) {
        const layer = match[1];
        const baseFile = path.join(manifestDir, `${layer}-kit-base.txt`);

        // base.txt が存在しなければこのリポジトリは層 L の kit（正）
        // （consumer リポジトリは files.txt も base.txt も両方持つため、
        //   base.txt なし = kit クローンの証）
        if (!fs.existsSync(baseFile)) {
          return layer;
        }
      }
    }
  }

  return null;
}

// agent とフックで同じ変更集合を使う。tracked の変更・削除と未追跡ファイルを
// 合わせることで、コミット前後で同じパス集合になる。
function getChangedPaths(kitPath) {
  const sh = (c) => execSync(c, { cwd: kitPath, encoding: 'utf8' });

  // origin/main との差分（作業ツリー比較）。tracked ファイルの変更・削除を拾う。
  // コミット前（未コミットの変更）とコミット後（working tree == HEAD）で同じ集合になる。
  // なぜ git status --porcelain ではなく origin/main 差分か: agent は Step 5（コピー後・
  // コミット前）に走り作業ツリーが dirty → 実際の内容から digest が出る。フックは
  // git push 時（コミット後）に走るため作業ツリーが clean → パス集合が空になり digest が
  // 潰れる。origin/main 差分ならコミット前後どちらでも同一集合が得られる。
  let changed = [];
  try {
    changed = sh('git diff --name-only origin/main').split('\n').filter(Boolean);
  } catch (e) {
    // origin/main ref が解決できない場合は失敗
    throw new Error(`origin/main との差分取得に失敗: ${e.message}`);
  }

  const untracked = sh('git ls-files --others --exclude-standard').split('\n').filter(Boolean);
  return [...new Set([...changed, ...untracked])].sort();
}

// パスの被覆規則。末尾 / の行はそのディレクトリ配下を再帰対象とし、それ以外は完全一致。
// マニフェストと scope 宣言で同じ規則を使う。
function covers(entry, target) {
  return entry.endsWith('/') ? target.startsWith(entry) : target === entry;
}

// マニフェスト（*-kit-files.txt）が列挙する配布パス。層は問わない。kit は自層の正で
// あると同時に上位層の consumer でもあり、どちらのペイロードも審査の網から外れては
// ならない。
function loadManifestPaths(kitPath) {
  const manifestDir = path.join(kitPath, '.claude', 'manifests');
  if (!fs.existsSync(manifestDir)) return [];

  const paths = [];
  for (const file of fs.readdirSync(manifestDir)) {
    if (!/-kit-files\.txt$/.test(file)) continue;
    const lines = fs.readFileSync(path.join(manifestDir, file), 'utf8').split('\n');
    for (const line of lines) {
      const entry = line.trim();
      if (entry) paths.push(entry);
    }
  }
  return paths;
}

// マニフェスト外で審査すべきパスの宣言を読む。宣言ファイルが無ければ null を返す
// （空配列ではない。「宣言が無い」と「宣言が空」を呼び出し側で区別するため）。
function loadScopeExtras(kitPath) {
  const scopePath = path.join(kitPath, REVIEW_SCOPE_FILE);
  if (!fs.existsSync(scopePath)) return null;

  let config;
  try {
    config = JSON.parse(fs.readFileSync(scopePath, 'utf8'));
  } catch (e) {
    throw new Error(`${REVIEW_SCOPE_FILE} の読み込みに失敗: ${e.message}`);
  }

  if (config?.version !== 1 || !Array.isArray(config.review_extra)) {
    throw new Error(`${REVIEW_SCOPE_FILE} は version: 1 と review_extra 配列を持つ必要があります`);
  }

  return config.review_extra.map((entry, index) => {
    if (
      !entry ||
      typeof entry.path !== 'string' ||
      !entry.path ||
      entry.path.startsWith('/') ||
      entry.path.includes('..') ||
      typeof entry.reason !== 'string' ||
      !entry.reason.trim()
    ) {
      throw new Error(`${REVIEW_SCOPE_FILE} の review_extra[${index}] が不正です`);
    }
    return entry.path;
  });
}

// 今回の変更のうち、実際に審査すべきパス。空なら審査は不要。
//
// 宣言ファイルが無い kit では絞り込まない。スコープを狭めるのは、狭めてよい範囲を
// 明示的に宣言した kit だけの特典である。宣言していない kit で黙って狭めると、
// このフックが配布された先で審査が外れる。
function getReviewPaths(kitPath, changedPaths = getChangedPaths(kitPath)) {
  const extras = loadScopeExtras(kitPath);
  if (extras === null) return changedPaths;

  const scope = [...MANDATORY_SCOPE, ...loadManifestPaths(kitPath), ...extras];
  return changedPaths.filter((changedPath) => scope.some((entry) => covers(entry, changedPath)));
}

// digest 計算関数。agent とフックで同一ロジックを保証するため
// 関数化し、--context モードと通常モード双方で使用する。
//
// digest の対象は「審査したパス」であり、変更したパス全部ではない。範囲を揃えないと、
// 審査を受けたあとに配布物でないファイル（アプリのコードなど）を1行触っただけで digest が
// 変わり、verdict が無効化されて再審査になる。審査していないものを digest に含めない。
function calculateDigest(kitPath, paths = getReviewPaths(kitPath)) {

  const lines = paths.map((p) => {
    const full = path.join(kitPath, p);
    // 作業ツリーの内容をハッシュ化する（コミット前後で同一）。削除済みは "deleted"。
    const content = fs.existsSync(full) ? fs.readFileSync(full) : Buffer.from('deleted');
    return crypto.createHash('sha256').update(content).digest('hex') + '  ' + p;
  });
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}

// クォートを尊重して、コマンド列を shell の「語」と外側の区切りに分解する。
// これは完全な Bash parser ではない。完全に評価できない展開は hasExpansion として残し、
// 後段で fail closed にする。一方、文字列リテラル中の `git push` は実行コマンドではない。
function tokenizeShell(cmd) {
  const segments = [];
  let tokens = [];
  let value = '';
  let quote = null;
  let hasExpansion = false;

  const finishToken = () => {
    if (value !== '') tokens.push({ value, hasExpansion });
    value = '';
    hasExpansion = false;
  };
  const finishSegment = () => {
    finishToken();
    if (tokens.length > 0) segments.push(tokens);
    tokens = [];
  };

  for (let i = 0; i < cmd.length; i += 1) {
    const ch = cmd[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else if (ch === '\\' && quote === '"' && i + 1 < cmd.length) {
        value += cmd[i + 1];
        i += 1;
      } else {
        value += ch;
        if (quote === '"' && (ch === '$' || ch === '`')) hasExpansion = true;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '\\' && i + 1 < cmd.length) {
      value += cmd[i + 1];
      i += 1;
    } else if (/\s/.test(ch)) {
      finishToken();
    } else if (ch === ';') {
      finishSegment();
    } else if (ch === '&' || ch === '|') {
      finishSegment();
      if (cmd[i + 1] === ch) i += 1;
    } else {
      value += ch;
      if (ch === '$' || ch === '`') hasExpansion = true;
    }
  }
  finishSegment();
  return segments;
}

// Bash コマンド文字列を、確実な push / 確実な非 push / 曖昧に分類する。
// "push" の部分文字列だけで判定してはいけない。kit-push/... は branch 名である。
function classifyPushCommand(cmd, cwd, nesting = 0) {
  let cdPath = null;
  const knownGitVariables = new Set();

  for (const toks of tokenizeShell(cmd)) {
    let executable = 0;
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[executable]?.value || '')) {
      const [name, assigned] = toks[executable].value.split(/=(.*)/s);
      if (!toks[executable].hasExpansion && assigned === 'git') knownGitVariables.add(name);
      executable += 1;
    }
    if (executable >= toks.length) continue;

    const command = toks[executable];
    if (command.value === 'cd' && toks[executable + 1] && !toks[executable + 1].hasExpansion) {
      cdPath = toks[executable + 1].value;
      continue;
    }

    if (nesting < 3 && /^(?:sh|bash|zsh|dash|fish)$/.test(command.value)) {
      const dashC = toks.findIndex((token, index) => index > executable && token.value === '-c');
      if (dashC !== -1) {
        const payload = toks[dashC + 1];
        if (!payload || payload.hasExpansion) return { kind: 'ambiguous' };
        const innerResult = classifyPushCommand(payload.value, cwd, nesting + 1);
        if (innerResult.kind !== 'not-push') return innerResult;
      }
      continue;
    }

    if (nesting < 3 && command.value === 'eval') {
      const payload = toks[executable + 1];
      if (!payload || payload.hasExpansion) return { kind: 'ambiguous' };
      const innerResult = classifyPushCommand(payload.value, cwd, nesting + 1);
      if (innerResult.kind !== 'not-push') return innerResult;
      continue;
    }

    if (command.value === 'command') executable += 1;
    const gitCommand = toks[executable];
    if (!gitCommand) continue;
    if (gitCommand.hasExpansion || /^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/.test(gitCommand.value)) {
      // `G=git; $G push` のような、git binary の変数間接参照は確実に復元できない。
      if (knownGitVariables.has(gitCommand.value.replace(/^\$\{?|\}?$/g, ''))) return { kind: 'ambiguous' };
      continue;
    }
    if (gitCommand.value !== 'git') continue;

    let i = executable + 1;
    let dashC = null;
    let unresolvedDashC = false;
    let unresolvedOption = false;
    while (i < toks.length) {
      const token = toks[i];
      if (token.value === '-C') {
        const target = toks[i + 1];
        if (!target) return { kind: 'ambiguous' };
        // -C の展開先は push の対象判定にだけ影響する。ここで曖昧として
        // 打ち切ると、後続が status など確実な非 push の通常作業まで止める。
        if (target.hasExpansion) unresolvedDashC = true;
        else dashC = target.value;
        i += 2;
      } else if (token.value === '-c') {
        const config = toks[i + 1];
        if (!config) return { kind: 'ambiguous' };
        i += 2;
      } else if (token.value.startsWith('-')) {
        // オプション自身や `--git-dir=$DIR` のような値の展開は、後続の
        // サブコマンドを変えない。サブコマンドを確定してから push だけを
        // 厳密に扱う。展開されたオプションは push の対象にも影響し得るため、
        // push だった場合だけ fail closed にする。
        if (token.hasExpansion) unresolvedOption = true;
        i += 1;
      } else {
        break;
      }
    }

    const subcommand = toks[i];
    if (subcommand?.hasExpansion || /^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/.test(subcommand?.value || '')) {
      return { kind: 'ambiguous' };
    }
    if (subcommand?.value === 'push') {
      // push のときだけ -C の未解決な展開を fail closed にする。
      if (unresolvedDashC || unresolvedOption) return { kind: 'ambiguous' };
      return { kind: 'push', target: dashC || cdPath || cwd || null };
    }
  }

  return { kind: 'not-push' };
}

function findCleanVerdict(kitPath, layerName, currentDigest) {
  // verdict は対象の kit 作業ツリーだけに置く。Claude Code の環境変数に依存すると、
  // Bash hook と Git の pre-push hook で探索先が分かれてしまう。
  const reviewDir = path.join(kitPath, '.claude', 'steering', 'reviews');
  const targetRepo = path.basename(kitPath);

  if (!fs.existsSync(reviewDir)) return false;

  for (const file of fs.readdirSync(reviewDir)) {
    if (!file.endsWith('.md')) continue;

    try {
      const content = fs.readFileSync(path.join(reviewDir, file), 'utf8');
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;

      const fm = fmMatch[1];
      const verdictMatch = fm.match(/verdict:\s*(clean|contaminated)/);
      const layerMatch = fm.match(/layer:\s*(\S+)/);
      const targetMatch = fm.match(/target_repo:\s*(\S+)/);
      const digestMatch = fm.match(/digest:\s*(\S+)/);
      if (
        verdictMatch &&
        verdictMatch[1] === 'clean' &&
        layerMatch &&
        layerMatch[1] === layerName &&
        targetMatch &&
        targetMatch[1] === targetRepo &&
        digestMatch &&
        digestMatch[1] === currentDigest
      ) {
        return true;
      }
    } catch (e) {
      // 壊れた verdict は clean とみなさない。
    }
  }

  return false;
}

function enforcePushVerdict(kitPath) {
  const layerName = resolveLayer(kitPath);
  if (!layerName) return true;

  let reviewPaths;
  try {
    reviewPaths = getReviewPaths(kitPath);
  } catch (e) {
    console.error(`審査対象の判定エラー: ${e.message}`);
    return false;
  }

  if (reviewPaths.length === 0) {
    console.error(
      '配布物に触れていない変更のため、kit-push-review-agent の verdict をスキップします。'
    );
    return true;
  }

  let currentDigest;
  try {
    currentDigest = calculateDigest(kitPath, reviewPaths);
  } catch (e) {
    console.error(`digest 計算エラー: ${e.message}`);
    return false;
  }

  if (!findCleanVerdict(kitPath, layerName, currentDigest)) {
    console.error(
      'kit への push には kit-push-review-agent による clean verdict が必要です。/kit-push で agent を起動してレビューを受けてください。（digest 不一致の場合はレビュー後にファイルが変更されています）'
    );
    return false;
  }

  return true;
}

// CLI 実行時だけ各モードを起動する。require() する検証コードからは純粋な関数として使える。
if (require.main === module) {
  // モード1: --context <kitpath> 引数が渡されたら JSON を計算・出力して終了
  // （agent がこのモードを呼ぶ。層名判定・digest 計算ロジックの単一ソース化）
  if (process.argv[2] === '--context') {
    const kitPath = process.argv[3];
    try {
      const layer = resolveLayer(kitPath);
      if (!layer) {
        console.error(`kit と判定できません: ${kitPath}`);
        process.exit(1);
      }
      const targetRepo = path.basename(kitPath);
      // agent は review_paths だけを読めばよい。ここに載らない変更は配布されないため、
      // 混入のしようがなく、審査しても守るものが無い。
      const reviewPaths = getReviewPaths(kitPath);
      const digest = calculateDigest(kitPath, reviewPaths);
      const result = { layer, target_repo: targetRepo, digest, review_paths: reviewPaths };
      console.log(JSON.stringify(result));
      process.exit(0);
    } catch (e) {
      console.error(`context 生成エラー: ${e.message}`);
      process.exit(1);
    }
  }

// モード2: git の pre-push フック。Bash 文字列の解析に依存せず、git が起動する
// たびに kit 作業ツリー内の同じ verdict を検証する。
  if (process.argv[2] === '--pre-push') {
    const kitPath = process.argv[3] || process.cwd();
    process.exit(enforcePushVerdict(kitPath) ? 0 : 2);
  }

// モード3: Claude Code の Bash matcher。git の pre-push より前の防御層。
  let d = '';
  process.stdin.on('data', (c) => (d += c));
  process.stdin.on('end', () => {
    let o;
    try {
      o = JSON.parse(d);
    } catch (e) {
      console.error(`Bash hook 入力の解析エラー: ${e.message}`);
      process.exit(2);
    }
    const cmd = (o.tool_input || {}).command || '';
    const cwd = o.cwd || '';
    const agentType = o.agent_type;

  // 役割C（ベストエフォート）: verdict ファイルへの Bash リダイレクト検知
  // メイン Claude（agent_type なし）が steering/reviews/[..]-kit-push[...] へ
  // 書き込もうとしたら阻止（善意の誤動作対策）
    const verdictWritePattern =
      /(?:>>?|tee|cp|mv|sed\s+-i)\s+[^|;]*steering\/reviews\/[^|;]*kit-push/;
    if (verdictWritePattern.test(cmd)) {
      if (agentType !== 'kit-push-review-agent') {
        console.error(
          'kit-push verdict ファイルの書き込みは kit-push-review-agent 専用です。ゲートに阻まれた場合は agent を再起動してレビューを得てください。'
        );
        process.exit(2);
      }
    }

    const pushCommand = classifyPushCommand(cmd, cwd);
    if (pushCommand.kind === 'not-push') {
      process.exit(0);
    }

  // Bash のラッパーや変数展開があれば、push 先を正しく特定できない。
  // 「kit ではなさそう」と推測して通すことはできないため、ここで fail closed する。
    if (pushCommand.kind === 'ambiguous') {
      console.error(
        'git push の可能性がある Bash コマンドを安全に解析できません。shell -c、eval、変数展開を使わずに直接 git push を実行してください。'
      );
      process.exit(2);
    }

    let kitPath = pushCommand.target;

  // 相対パスを絶対パスに変換
    if (!path.isAbsolute(kitPath)) {
      kitPath = path.resolve(cwd, kitPath);
    }

    process.exit(enforcePushVerdict(kitPath) ? 0 : 2);
  });
}

module.exports = {
  calculateDigest,
  classifyPushCommand,
  covers,
  enforcePushVerdict,
  findCleanVerdict,
  getChangedPaths,
  getReviewPaths,
  loadManifestPaths,
  loadScopeExtras,
  resolveLayer,
};
