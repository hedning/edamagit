import { Uri } from 'vscode';
import { MagitUriScheme } from './constants';

// Magit views are addressed by a URI of the shape
// `magit://<hex(repoFsPath)>/<leaf>.magit[#<fragment>]`. The repository is
// hex-encoded into the authority so the path stays a single segment —
// breadcrumbs, tab tooltips and quick-pick labels render as just `<leaf>`
// instead of leaking the full repo path. The `.magit` suffix is what wires
// VS Code's filename-based language detection to the magit language; it's
// added here so view code can keep its UriPath constants clean.

const LeafSuffix = '.magit';

function encodeRepoAuthority(fsPath: string): string {
  return Buffer.from(fsPath, 'utf8').toString('hex');
}

function decodeRepoAuthority(authority: string): string {
  return Buffer.from(authority, 'hex').toString('utf8');
}

export function buildMagitUri(repoUri: Uri, leaf: string, fragment?: string): Uri {
  return Uri.from({
    scheme: MagitUriScheme,
    authority: encodeRepoAuthority(repoUri.fsPath),
    path: `/${leaf}${LeafSuffix}`,
    ...(fragment !== undefined ? { fragment } : {}),
  });
}

export function repoUriFromMagitUri(magitUri: Uri): Uri {
  return Uri.file(decodeRepoAuthority(magitUri.authority));
}

export function repoFsPathFromMagitUri(magitUri: Uri): string {
  return repoUriFromMagitUri(magitUri).fsPath;
}

export function leafFromMagitUri(magitUri: Uri): string {
  const path = magitUri.path.slice(1);
  return path.endsWith(LeafSuffix) ? path.slice(0, -LeafSuffix.length) : path;
}
