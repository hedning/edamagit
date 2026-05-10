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

// Nominal brand: `MagitUri` is a `Uri` produced by `buildMagitUri` (or
// validated by `asMagitUri`). The brand is compile-time only — it doesn't
// affect runtime — and exists so `DocumentView.uri` can't be set from an
// arbitrary `Uri` without going through the canonical builder/validator.
declare const MagitUriBrand: unique symbol;
export type MagitUri = Uri & { readonly [MagitUriBrand]: true };

const LeafSuffix = `.${MagitLanguageId}`;

export interface MagitUriOptions {
  authority?: string;
  // JSON-stringified so VS Code's `resourceLabelFormatters` can pick out
  // `${query.<key>}` substitutions.
  query?: Record<string, string>;
  fragment?: string;
}

export function buildMagitUri(repoUri: Uri, leaf: string, options: MagitUriOptions = {}): MagitUri {
  return Uri.from({
    scheme: MagitUriScheme,
    authority: options.authority ?? '',
    path: `${repoUri.path}/${leaf}${LeafSuffix}`,
    ...(options.query !== undefined ? { query: JSON.stringify(options.query) } : {}),
    ...(options.fragment !== undefined ? { fragment: options.fragment } : {}),
  }) as MagitUri;
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
