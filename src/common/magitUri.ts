import { Uri } from 'vscode';
import { MagitLanguageId, MagitUriScheme } from './constants';

// Magit views are addressed by a URI of the shape
// `magit://<authority>/<repoUri.path>/<leaf>.magit[?<query>][#<fragment>]`.
// The repo path is embedded directly so the URI is self-describing —
// `dirname(uri.path)` recovers the repo so a persisted editor can be rebuilt
// on first readFile, and tab disambiguation between two repos picks up the
// differing repo segment naturally. The leaf is always a simple identifier
// (no `/`) — view-specific data rides in the query so `lastIndexOf('/')` can
// safely split repo from leaf. The displayed label is composed by the
// `resourceLabelFormatters` contribution: a default that strips to the leaf,
// plus per-authority overrides that pull `${query.<key>}` substitutions out
// of the JSON-encoded query.
//
// The `.magit` suffix wires VS Code's filename-based language detection to
// the magit language; it's added here so view code can keep its UriPath
// constants clean.

const LeafSuffix = `.${MagitLanguageId}`;

export interface MagitUriOptions {
  authority?: string;
  // JSON-stringified so VS Code's `resourceLabelFormatters` can pick out
  // `${query.<key>}` substitutions.
  query?: Record<string, string>;
  fragment?: string;
}

export function buildMagitUri(repoUri: Uri, leaf: string, options: MagitUriOptions = {}): Uri {
  return Uri.from({
    scheme: MagitUriScheme,
    authority: options.authority ?? '',
    path: `${repoUri.path}/${leaf}${LeafSuffix}`,
    ...(options.query !== undefined ? { query: JSON.stringify(options.query) } : {}),
    ...(options.fragment !== undefined ? { fragment: options.fragment } : {}),
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
