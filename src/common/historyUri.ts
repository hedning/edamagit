import { Uri } from 'vscode';
import { MagitHistoryUriScheme } from './constants';
import GitTextUtils from '../utils/gitTextUtils';
import { Ref } from '../typings/git';

// `magit-history://<commit>/<file fsPath>?<json>`
//
// All routing data lives in the URI: the commit hash in `authority`, the
// file's absolute path in `path`, and `{ repo, ref }` in `query`. The repo
// path lets the FS provider run `git show` from a directory that's
// guaranteed to exist (the repo root) instead of from the file's own
// directory — which may have been deleted or moved since the commit was
// made. `ref` is a precomputed display label for the tab title formatter.

interface HistoryUriQuery {
  ref: string;
  repo: string;
}

export interface HistoryUriParts {
  commit: string;
  repoFsPath: string;
  fileFsPath: string;
  refLabel: string;
}

// VS Code's `getUriBasenameLabel` formats the resourceLabel template, then
// runs basename on the formatted string with `/` as the separator — so a
// literal `/` inside `${query.ref}` (e.g. `feature/foo@abc1234`) would chop
// the prefix off the tab. Substitute U+2009 + U+2215 + U+2009 (thin space,
// division slash, thin space): visually a slash, opaque to basename.
const VISUAL_SLASH = ' ∕ ';
const escapeSlashesForLabel = (s: string) => s.replace(/\//g, VISUAL_SLASH);

export function buildHistoryUri(repoUri: Uri, fileUri: Uri, ref: Ref): Uri {
  if (!ref.commit) throw new Error('buildHistoryUri: ref.commit is required');
  const shortHash = GitTextUtils.shortHash(ref.commit);
  const refLabel = escapeSlashesForLabel(ref.name ? `${ref.name}@${shortHash}` : shortHash);
  const query: HistoryUriQuery = { ref: refLabel, repo: repoUri.fsPath };
  return fileUri.with({
    scheme: MagitHistoryUriScheme,
    authority: ref.commit,
    query: JSON.stringify(query),
    fragment: '',
  });
}

export function parseHistoryUri(uri: Uri): HistoryUriParts | undefined {
  if (uri.scheme !== MagitHistoryUriScheme) return undefined;
  const commit = uri.authority;
  if (!commit) return undefined;

  let q: Partial<HistoryUriQuery>;
  try {
    q = uri.query ? JSON.parse(uri.query) : {};
  } catch {
    return undefined;
  }
  if (typeof q.repo !== 'string' || typeof q.ref !== 'string') return undefined;

  const fileFsPath = uri.with({ scheme: 'file', authority: '', query: '', fragment: '' }).fsPath;
  return { commit, repoFsPath: q.repo, fileFsPath, refLabel: q.ref };
}
