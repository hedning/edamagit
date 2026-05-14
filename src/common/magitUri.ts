import * as path from 'path';
import { Uri } from 'vscode';
import { MagitLanguageId, MagitUriScheme } from './constants';
import { MagitRepository } from '../models/magitRepository';

// Magit views are addressed by a URI of the shape
// `magit://<authority>/<repoUri.path>/<leaf>.magit[?<query>][#<fragment>]`.
// The view kind rides in `<authority>` and is what `magitViewBuilders` keys
// off when rebuilding a persisted editor. The repo path is embedded directly
// so `dirname(uri.path)` recovers the repo on first readFile. The leaf is a
// simple identifier (no `/`) that only exists for VS Code's filename-based
// language detection (the `.magit` suffix).
//
// Tab labels come from a single `resourceLabelFormatters` entry registered in
// package.json:
//   ${authority}${query.title}${query.worktree}
// `query.title` and `query.worktree` carry their leading separators (`: ` /
// ` - `) baked in so the formatter can stay static; both may be absent. Views
// pass a clean `title` to `buildMagitUri` and the worktree suffix is derived
// from the `MagitRepository` (only set for secondary worktrees — i.e. when
// `repo.uri` doesn't match `repo.worktrees[0]`).

// Nominal brand: `MagitUri` is a `Uri` produced by `buildMagitUri` (or
// validated by `asMagitUri`). The brand is compile-time only — it doesn't
// affect runtime — and exists so `DocumentView.uri` can't be set from an
// arbitrary `Uri` without going through the canonical builder/validator.
declare const MagitUriBrand: unique symbol;
export type MagitUri = Uri & { readonly [MagitUriBrand]: true };

const LeafSuffix = `.${MagitLanguageId}`;

export interface MagitUriOptions {
  authority?: string;
  // Rendered as `: ${title}` after the authority in the tab label. Slashes
  // should be U+2215 escaped by the caller — VS Code's `getUriBasenameLabel`
  // splits on `/` and would chop off everything before the last segment.
  title?: string;
  // View-specific state for rebuild-from-URI. The reserved keys `title` and
  // `worktree` are managed by the builder; don't set them here.
  query?: Record<string, string>;
  fragment?: string;
}

export function buildMagitUri(repo: MagitRepository, leaf: string, options: MagitUriOptions = {}): MagitUri {
  const query: Record<string, string> = { ...(options.query ?? {}) };
  if (options.title !== undefined) query.title = `: ${options.title}`;
  const wt = worktreeSuffix(repo);
  if (wt) query.worktree = wt;
  const hasQuery = Object.keys(query).length > 0;
  return Uri.from({
    scheme: MagitUriScheme,
    authority: options.authority ?? '',
    path: `${repo.uri.path}/${leaf}${LeafSuffix}`,
    ...(hasQuery ? { query: JSON.stringify(query) } : {}),
    ...(options.fragment !== undefined ? { fragment: options.fragment } : {}),
  }) as MagitUri;
}

// ` - <basename>` for secondary worktrees, '' for the main worktree (or when
// the worktree list is unknown). Compared against `worktrees[0]` since
// `git worktree list` always lists the main worktree first.
function worktreeSuffix(repo: MagitRepository): string {
  const main = repo.worktrees[0];
  if (!main || main.path.fsPath === repo.uri.fsPath) return '';
  return ` - ${path.basename(repo.uri.fsPath)}`;
}

// Validate a `Uri` received from VS Code (e.g. inside the FS provider) is in
// the magit shape, and return it branded. Used at boundaries.
export function asMagitUri(uri: Uri): MagitUri | undefined {
  if (uri.scheme !== MagitUriScheme) return undefined;
  if (uri.path.lastIndexOf('/') <= 0) return undefined;
  return uri as MagitUri;
}

export function repoUriFromMagitUri(magitUri: MagitUri): Uri {
  const i = magitUri.path.lastIndexOf('/');
  return magitUri.with({
    scheme: 'file',
    authority: '',
    path: magitUri.path.slice(0, i),
    query: '',
    fragment: '',
  });
}

export function repoFsPathFromMagitUri(magitUri: MagitUri): string {
  return repoUriFromMagitUri(magitUri).fsPath;
}
