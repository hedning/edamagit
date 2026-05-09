import { Uri } from 'vscode';
import { MagitLanguageId, MagitUriScheme } from './constants';

// Magit views are addressed by a URI of the shape
// `magit:<repoUri.path>/<leaf>.magit[#<fragment>]`. The repo path is embedded
// directly so the URI is self-describing — `dirname(uri.path)` recovers the
// repo so a persisted editor can be rebuilt on first readFile, and tab
// disambiguation between two repos picks up the differing repo segment
// naturally. The displayed label is collapsed to just `<leaf>.magit` by the
// `resourceLabelFormatters` contribution (stripPathSegments).
//
// The `.magit` suffix wires VS Code's filename-based language detection to
// the magit language; it's added here so view code can keep its UriPath
// constants clean.
//
// `/` inside a leaf (commit summaries like `feat/foo: …`, log revs like
// `feature/foo..main`) collides with the path separator we use to mark the
// repo/leaf boundary, so we substitute U+2215 DIVISION SLASH on write and
// reverse it on read. Visually identical, doesn't trip lastIndexOf('/').

const LeafSuffix = `.${MagitLanguageId}`;
const LeafSlash = '∕';

export function buildMagitUri(repoUri: Uri, leaf: string, fragment?: string): Uri {
  return Uri.from({
    scheme: MagitUriScheme,
    path: `${repoUri.path}/${leaf.replace(/\//g, LeafSlash)}${LeafSuffix}`,
    ...(fragment !== undefined ? { fragment } : {}),
  });
}

// Walk path components back-to-front, asking the predicate which prefix is a
// real repo. This is the routing primitive — the URI's last `/` is just a
// hint; the registry is the source of truth. Tolerates leaves that contain
// `/` (commit summaries like `feat/foo: …`, log revs like `master..feat/foo`)
// and matches existing persisted URIs that didn't escape such leaves.
export function findRepoFsPath(magitUri: Uri, isRepo: (fsPath: string) => boolean): string | undefined {
  let path = magitUri.path;
  for (let i = path.lastIndexOf('/'); i > 0; i = path.lastIndexOf('/')) {
    path = path.slice(0, i);
    const fsPath = Uri.file(path).fsPath;
    if (isRepo(fsPath)) return fsPath;
  }
  return undefined;
}

export function leafFromMagitUri(magitUri: Uri): string {
  const i = magitUri.path.lastIndexOf('/');
  const leaf = magitUri.path.slice(i + 1);
  const stripped = leaf.endsWith(LeafSuffix) ? leaf.slice(0, -LeafSuffix.length) : leaf;
  return stripped.replace(new RegExp(LeafSlash, 'g'), '/');
}
