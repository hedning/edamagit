import { Uri } from 'vscode';
import { buildMagitUri, MagitUri } from '../common/magitUri';
import { MagitLogPEntry } from '../models/magitLogPCommit';
import { MagitRepository } from '../models/magitRepository';
import { Ref, RefType } from '../typings/git';
import { gitRunInUri, LogLevel } from '../utils/gitRawRunner';
import { diffToMagitChanges } from '../utils/diffParser';
import MagitUtils from '../utils/magitUtils';
import { ChangeView } from './changes/changeView';
import { CommitLongFormItemView } from './logView';
import { DocumentView, RebuildableViewKind } from './general/documentView';
import { Section } from './general/sectionHeader';
import { LineBreakView } from './general/lineBreakView';
import { TextView } from './general/textView';
import { SemanticTextView, Token } from './general/semanticTextView';
import { SemanticTokenTypes } from '../common/constants';
import { View } from './general/view';

// `git log -p` rendered with per-commit folds. Each commit's first line is
// the same single-line summary the regular log shows, so folding everything
// collapses back to the familiar log view; expanded, the commit body and
// per-file diffs sit below, each independently foldable via `ChangeView`.
//
// `--graph` is deliberately unsupported here — combining ASCII graph rails
// with patch output would require interleaved parsing and we don't need it.
// The format below is `%x00`-bracketed so we can split commits out of the
// stream even when the body or diff contains line patterns we'd otherwise
// confuse for delimiters.
export class LogPView extends DocumentView {
  needsUpdate = true;
  isFoldable = true;
  args: string[];
  revs: string[];
  paths: string[];
  public headerText: string = '';

  constructor(uri: MagitUri) {
    super(uri);
    const q = uri.query ? JSON.parse(uri.query) as { revs?: string; args?: string; paths?: string } : {};
    this.revs = (q.revs ?? '').replace(/∕/g, '/').split(' ').filter(r => r.length > 0);
    this.args = (q.args ?? '').split(' ').filter(a => a.length > 0);
    this.paths = (q.paths ?? '').split(' ').filter(p => p.length > 0);
  }

  public async update(state: MagitRepository) {
    const output = await gitRunInUri(state.uri, this.args.concat(this.revs, ['--'], this.paths), {}, LogLevel.Error);

    const refs = state.remotes.reduce((prev, remote) => remote.branches.concat(prev), state.branches.concat(state.tags));

    const defaultBranches: { [remoteName: string]: string } = {};
    for (const remote of state.remotes) {
      if (remote.defaultBranch) defaultBranches[remote.name] = remote.defaultBranch;
    }

    const entries = parseLogP(output.stdout, state.uri);
    const revName = this.revs.join(' ');
    this.headerText = `Commits in ${revName}`;

    const refMap: { [commit: string]: Ref[] } = {};
    for (const ref of refs) {
      if (!ref.commit) continue;
      if (!refMap[ref.commit]) refMap[ref.commit] = [];
      refMap[ref.commit].push(ref);
    }

    this.subViews = [
      new SemanticTextView(new Token(this.headerText, SemanticTokenTypes.SectionHeader)),
      ...entries.map(e => new CommitPItemView(e, refMap[e.commit.hash], state.HEAD?.name, defaultBranches)),
    ];

    this.triggerUpdate();
  }
}

export const LogP: RebuildableViewKind<[string[], string[], string[]]> = {
  authority: 'logp',
  // Mirror `Log`'s U+2215 substitution so VS Code's `getUriBasenameLabel`
  // doesn't slice the tab label apart on rev specs containing `/`.
  buildUri: (repo, revs, args, paths) => {
    const revsLabel = revs.join(' ').replace(/\//g, '∕');
    return buildMagitUri(repo, 'logp', {
      authority: LogP.authority,
      title: revsLabel,
      query: {
        revs: revsLabel,
        args: args.join(' '),
        paths: paths.join(' '),
      },
    });
  },
  build: async (uri) => {
    const repo = await MagitUtils.ensureRepoForMagitUri(uri);
    if (!repo) return undefined;
    const view = new LogPView(uri);
    await view.update(repo);
    return view;
  },
};

// Wraps a single commit: line 1 is the summary (so folding this view shows
// just that), then the optional message body, then a `ChangeView` per file.
// Each `ChangeView` is itself foldable, so a folded commit can be opened to
// "headers only" before drilling into specific hunks.
export class CommitPItemView extends View {
  isFoldable = true;

  get id() { return this.entry.commit.hash; }

  constructor(
    public entry: MagitLogPEntry,
    refs?: Ref[],
    headName?: string,
    defaultBranches?: { [remoteName: string]: string },
  ) {
    super();
    this.addSubview(new CommitLongFormItemView(entry, refs, headName, defaultBranches));
    if (entry.body) {
      this.addSubview(new TextView(entry.body));
    }
    for (const change of entry.changes) {
      this.addSubview(new ChangeView(Section.Changes, change, entry.commit.hash));
    }
    this.addSubview(new LineBreakView());
  }
}

// Format: `%x00<fields>%x00` brackets the per-commit fields. Splitting on
// the NUL byte gives an alternating sequence of [pre, fields1, diff1,
// fields2, diff2, …]: odd indices are field blocks, even (>0) are diffs.
// Using `%x00` (git's escape) keeps the actual command-line arg free of NUL
// — only git's *output* contains them. `loggingCommands.createLogArgs`
// produces the matching `--format=…` string.
export function parseLogP(stdout: string, repoUri: Uri): MagitLogPEntry[] {
  if (!stdout) return [];
  const parts = stdout.split('\x00');
  const entries: MagitLogPEntry[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const fieldsStr = parts[i];
    if (!fieldsStr) continue;

    let diffStr = (parts[i + 1] ?? '').replace(/^\n+/, '');
    if (diffStr && !diffStr.endsWith('\n')) diffStr += '\n';

    const tokens = fieldsStr.split('\x1f');
    if (tokens.length < 4) continue;
    const hash = tokens[0];
    const author = tokens[1];
    const time = tokens[2];
    // Subject can't contain `\x1f` (we control the format), but `\x1f` may
    // appear later in the body — rejoin defensively just in case.
    const subjectAndBody = tokens.slice(3).join('\x1f');
    const nl = subjectAndBody.indexOf('\n');
    const subject = nl === -1 ? subjectAndBody : subjectAndBody.slice(0, nl);
    const body = (nl === -1 ? '' : subjectAndBody.slice(nl + 1)).replace(/\n+$/, '');

    const message = body ? `${subject}\n\n${body}` : subject;
    const ref: Ref = { commit: hash, type: RefType.Head };
    const changes = diffStr ? diffToMagitChanges(diffStr, repoUri, ref) : [];

    entries.push({
      commit: { hash, message, parents: [] },
      graph: undefined,
      refs: [],
      author,
      time: new Date(Number(time) * 1000),
      body,
      changes,
    });
  }
  return entries;
}
