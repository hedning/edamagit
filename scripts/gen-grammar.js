#!/usr/bin/env node
// Regenerates the per-language "hunk" rules in syntaxes/magit.tmGrammar.json
// and the matching `embeddedLanguages` map in the magit grammar contribution
// in package.json. Edit the LANGUAGES list below to add or change a language.
//
// Run: node scripts/gen-grammar.js
//
// Static parts of the grammar (hunk header, word-diff markers, etc.) stay
// editable directly in magit.tmGrammar.json — only rules whose name ends in
// `Hunk` and their includes are touched here. Structural lines like section
// and file headers are highlighted by the SemanticTokensProvider, not here.

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const GRAMMAR_PATH = path.join(REPO, 'syntaxes/magit.tmGrammar.json');
const PACKAGE_PATH = path.join(REPO, 'package.json');

// `language` is the VS Code language id (drives embeddedLanguages and the
// generated rule name). `scope` must be the scopeName registered by the
// owning grammar — these are all bundled with VS Code core, so they load
// automatically as long as the embedded-language contribution is present.
const LANGUAGES = [
  { language: 'python', scope: 'source.python', exts: ['py', 'pyi'] },
  { language: 'typescript', scope: 'source.ts', exts: ['ts', 'mts', 'cts'] },
  { language: 'typescriptreact', scope: 'source.tsx', exts: ['tsx'] },
  { language: 'javascript', scope: 'source.js', exts: ['js', 'mjs', 'cjs'] },
  { language: 'javascriptreact', scope: 'source.js.jsx', exts: ['jsx'] },
  { language: 'json', scope: 'source.json', exts: ['json'] },
  { language: 'jsonc', scope: 'source.json.comments', exts: ['jsonc'] },
  { language: 'yaml', scope: 'source.yaml', exts: ['yaml', 'yml'] },
  { language: 'go', scope: 'source.go', exts: ['go'] },
  { language: 'rust', scope: 'source.rust', exts: ['rs'] },
  { language: 'ruby', scope: 'source.ruby', exts: ['rb'] },
  { language: 'java', scope: 'source.java', exts: ['java'] },
  { language: 'c', scope: 'source.c', exts: ['c', 'h'] },
  { language: 'cpp', scope: 'source.cpp', exts: ['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx'] },
  { language: 'csharp', scope: 'source.cs', exts: ['cs'] },
  { language: 'shellscript', scope: 'source.shell', exts: ['sh', 'bash', 'zsh'] },
  { language: 'markdown', scope: 'text.html.markdown', exts: ['md', 'markdown'] },
  { language: 'html', scope: 'text.html.derivative', exts: ['html', 'htm'] },
  { language: 'css', scope: 'source.css', exts: ['css'] },
  { language: 'scss', scope: 'source.css.scss', exts: ['scss'] },
  { language: 'xml', scope: 'text.xml', exts: ['xml'] },
  { language: 'php', scope: 'source.php', exts: ['php'] },
  { language: 'lua', scope: 'source.lua', exts: ['lua'] },
  { language: 'swift', scope: 'source.swift', exts: ['swift'] },
];

const FILE_HEADER_PREFIX = '^(modified|new file|deleted|renamed|copied|unmerged)   ';
// Terminators that force the embedded region closed: the next file's header
// in the same section, or the start of any other magit section.
const SECTION_HEADERS = [
  'Untracked files',
  '((Unstaged|Staged) changes)',
  'Stashes',
  'Worktrees',
  'Terminals',
  'Recent commits',
  'Unmerged into',
  'Unpushed to',
  'Unpulled from',
  'HEAD',
  'Branches',
  'Remote',
  'Tags',
  'Pull Requests',
  'Issues',
  'GitError!',
  'Cherry Picking',
  'Reverting',
  'Stash@\\{\\d+\\}',
];
// `while`, not `end`: an unclosed multi-line construct in the embedded
// language (Python triple-quoted string, JSX expression, etc.) would
// otherwise swallow the next file header and prevent the region from
// closing. `while` is checked per-line at the parent level, so it pops
// any nested state when the line is a file/section header.
const WHILE_REGEX =
  `^(?!(modified|new file|deleted|renamed|copied|unmerged)   |(${SECTION_HEADERS.join('|')}))`;

function ruleName(lang) { return `${lang.language}Hunk`; }

function extPattern(lang) {
  return lang.exts.length === 1 ? lang.exts[0] : `(${lang.exts.join('|')})`;
}

function buildRule(lang) {
  // No `beginCaptures`: the file-header line that opens the region is colored
  // by the SemanticTokensProvider (magit-file-header token from
  // ChangeHeaderView), not by the grammar. `begin` still has to match it to
  // enter the embedded region.
  return {
    begin: `${FILE_HEADER_PREFIX}.*\\.${extPattern(lang)}$`,
    while: WHILE_REGEX,
    contentName: `meta.embedded.block.${lang.language}`,
    patterns: [
      { include: '#hunkHeader' },
      { include: '#wordinserted' },
      { include: '#worddeleted' },
      { include: lang.scope },
    ],
  };
}

function isHunkRuleName(name) {
  return name !== 'hunkHeader' && /Hunk$/.test(name);
}

function regenerateGrammar(existing) {
  // Drop all `*Hunk` repository entries and their `#*Hunk` top-level includes.
  // `hunkHeader` is unrelated and stays.
  const keptRepo = Object.entries(existing.repository).filter(
    ([k]) => !isHunkRuleName(k),
  );
  const keptPatterns = existing.patterns.filter(
    (p) => !(p.include && isHunkRuleName(p.include.replace(/^#/, ''))),
  );

  const langIncludes = LANGUAGES.map((l) => ({ include: '#' + ruleName(l) }));
  // Put language includes before `#expression` so the begin pattern wins on
  // file-header lines (otherwise `#modified` inside #expression consumes the
  // line first and the region is never entered).
  const expressionIdx = keptPatterns.findIndex((p) => p.include === '#expression');
  const insertAt = expressionIdx === -1 ? keptPatterns.length : expressionIdx;
  const patterns = [
    ...keptPatterns.slice(0, insertAt),
    ...langIncludes,
    ...keptPatterns.slice(insertAt),
  ];

  // Splice rule defs just before `helpKey` for stable ordering.
  const helpKeyIdx = keptRepo.findIndex(([k]) => k === 'helpKey');
  const splice = helpKeyIdx === -1 ? keptRepo.length : helpKeyIdx;
  const langRules = LANGUAGES.map((l) => [ruleName(l), buildRule(l)]);
  const repoEntries = [
    ...keptRepo.slice(0, splice),
    ...langRules,
    ...keptRepo.slice(splice),
  ];

  return {
    scopeName: existing.scopeName,
    patterns,
    repository: Object.fromEntries(repoEntries),
  };
}

function buildEmbeddedLanguages() {
  const out = {};
  for (const l of LANGUAGES) out[`meta.embedded.block.${l.language}`] = l.language;
  return out;
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function main() {
  const grammar = JSON.parse(fs.readFileSync(GRAMMAR_PATH, 'utf8'));
  writeJson(GRAMMAR_PATH, regenerateGrammar(grammar));

  const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
  const grammars = pkg.contributes && pkg.contributes.grammars;
  const magit = grammars && grammars.find((g) => g.scopeName === 'source.magit');
  if (!magit) throw new Error('magit grammar entry not found in package.json');
  magit.embeddedLanguages = buildEmbeddedLanguages();
  writeJson(PACKAGE_PATH, pkg);

  console.log(`Generated ${LANGUAGES.length} language hunk rules.`);
}

main();
