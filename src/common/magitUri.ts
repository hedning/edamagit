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

const LeafSuffix = `.${MagitLanguageId}`;

export function buildMagitUri(repoUri: Uri, leaf: string, fragment?: string): Uri {
  return Uri.from({
    scheme: MagitUriScheme,
    path: `${repoUri.path}/${leaf}${LeafSuffix}`,
    ...(fragment !== undefined ? { fragment } : {}),
  });
}

export function repoUriFromMagitUri(magitUri: Uri): Uri {
  const i = magitUri.path.lastIndexOf('/');
  return magitUri.with({
    scheme: 'file',
    authority: '',
    path: magitUri.path.slice(0, i),
    query: '',
    fragment: '',
  });
}

export function repoFsPathFromMagitUri(magitUri: Uri): string {
  return repoUriFromMagitUri(magitUri).fsPath;
}

export function leafFromMagitUri(magitUri: Uri): string {
  const i = magitUri.path.lastIndexOf('/');
  const leaf = magitUri.path.slice(i + 1);
  return leaf.endsWith(LeafSuffix) ? leaf.slice(0, -LeafSuffix.length) : leaf;
}
