import { Uri } from 'vscode';
import { MagitLanguageId, MagitUriScheme } from './constants';

// Magit views are addressed by a URI of the shape
// `magit://<authority>/<repoUri.path>/<leaf>.magit[?<query>][#<fragment>]`.
// The view kind rides in `<authority>` and is what `magitViewBuilders` keys
// off when rebuilding a persisted editor. The repo path is embedded directly
// so `dirname(uri.path)` recovers the repo on first readFile, and tab
// disambiguation between two repos picks up the differing repo segment
// naturally. The leaf is always a simple identifier (no `/`) and exists for
// the default `${path}` `resourceLabelFormatters` fallback and for VS Code's
// filename-based language detection (the `.magit` suffix).
//
// View-specific data rides in the query as JSON, where it's available to
// per-authority `resourceLabelFormatters` entries via `${query.<key>}`.

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
