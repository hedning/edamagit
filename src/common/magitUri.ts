import { Uri } from 'vscode';
import { MagitUriScheme } from './constants';

// Magit views are addressed by a URI of the shape
// `magit:<repoUri.path>/<leaf>[#<fragment>]`. The repository the view belongs
// to is recovered from the path's parent so editors persisted by VS Code (eg.
// across a window reload) remain self-describing.

export function buildMagitUri(repoUri: Uri, leaf: string, fragment?: string): Uri {
  return Uri.from({
    scheme: MagitUriScheme,
    path: `${repoUri.path}/${leaf}`,
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
  return magitUri.path.slice(i + 1);
}
