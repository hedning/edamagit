import { Uri } from 'vscode';
import { MagitUriScheme } from './constants';

// Magit views are addressed by a URI of the shape
// `magit://<hex(repoFsPath)>/<leaf>[#<fragment>]`. The repository is
// hex-encoded into the authority so the path stays a single segment —
// breadcrumbs, tab tooltips and quick-pick labels render as just `<leaf>`
// instead of leaking the full repo path.

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
    path: `/${leaf}`,
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
  return magitUri.path.slice(1);
}
