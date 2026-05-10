import { DocumentView, RebuildableViewKind } from './general/documentView';
import { buildMagitUri, MagitUri } from '../common/magitUri';
import MagitUtils from '../utils/magitUtils';
import { MagitRepository } from '../models/magitRepository';
import { ChangeSectionView } from './changes/changesSectionView';
import { Section } from './general/sectionHeader';
import { gitRunInUri } from '../utils/gitRawRunner';
import { diffToMagitChanges } from '../utils/diffParser';

// `range`  → `git diff <rev>` (worktree collapses to rev: 'HEAD')
// `paths`  → `git diff --no-index <a> <b>`
// `file`   → `git diff [--cached] <path>`
export type DiffSpec =
  | { kind: 'range'; rev: string }
  | { kind: 'paths'; a: string; b: string }
  | { kind: 'file'; path: string; cached: boolean };

export class DiffView extends DocumentView {

  isHighlightable = false;
  needsUpdate = false;

  public async update(state: MagitRepository): Promise<void> {
    const spec = parseSpec(this.uri);
    if (!spec) return;
    const result = await gitRunInUri(state.uri, ['diff', ...gitArgsFor(spec)]);
    const changes = diffToMagitChanges(result.stdout, state.uri);
    this.subViews = [new ChangeSectionView(Section.Changes, changes)];
    this.triggerUpdate();
  }
}

export const Diff: RebuildableViewKind<[DiffSpec]> = {
  authority: 'diff',
  buildUri: (repo, spec) => buildMagitUri(repo.uri, 'diff', {
    authority: Diff.authority,
    query: { ...specToQuery(spec), label: labelFor(spec) },
  }),
  build: async (uri) => {
    const repo = await MagitUtils.ensureRepoForMagitUri(uri);
    if (!repo) return undefined;
    const view = new DiffView(uri);
    await view.update(repo);
    return view;
  },
};

function gitArgsFor(spec: DiffSpec): string[] {
  switch (spec.kind) {
    case 'range': return [spec.rev];
    case 'paths': return ['--no-index', spec.a, spec.b];
    case 'file': return spec.cached ? ['--cached', spec.path] : [spec.path];
  }
}

function specToQuery(spec: DiffSpec): Record<string, string> {
  switch (spec.kind) {
    case 'range': return { kind: spec.kind, rev: spec.rev };
    case 'paths': return { kind: spec.kind, a: spec.a, b: spec.b };
    case 'file': return { kind: spec.kind, path: spec.path, cached: spec.cached ? '1' : '0' };
  }
}

function parseSpec(uri: MagitUri): DiffSpec | undefined {
  if (!uri.query) return undefined;
  const q = JSON.parse(uri.query) as Record<string, string | undefined>;
  switch (q.kind) {
    case 'range':
      return q.rev !== undefined ? { kind: 'range', rev: q.rev } : undefined;
    case 'paths':
      return q.a !== undefined && q.b !== undefined ? { kind: 'paths', a: q.a, b: q.b } : undefined;
    case 'file':
      return q.path !== undefined ? { kind: 'file', path: q.path, cached: q.cached === '1' } : undefined;
    default:
      return undefined;
  }
}

function basename(p: string): string {
  return p.slice(p.lastIndexOf('/') + 1);
}

// U+2215 division slash so VS Code's `getUriBasenameLabel` doesn't chop the
// `Diff: ` prefix off rev specs like `origin/main..HEAD`. Mirrors the
// log/commit-detail trick.
function labelFor(spec: DiffSpec): string {
  switch (spec.kind) {
    case 'range': return spec.rev.replace(/\//g, '∕');
    case 'paths': return `${basename(spec.a)} ↔ ${basename(spec.b)}`;
    case 'file': {
      const name = basename(spec.path);
      return spec.cached ? `${name} (staged)` : name;
    }
  }
}
