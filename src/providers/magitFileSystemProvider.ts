import {
  Disposable,
  Event,
  EventEmitter,
  FileChangeEvent,
  FileChangeType,
  FileStat,
  FileSystemError,
  FileSystemProvider,
  FileType,
  Uri,
} from 'vscode';
import { DocumentView } from '../views/general/documentView';
import { views } from '../extension';
import { asMagitUri, MagitUri } from '../common/magitUri';

type ViewRebuilder = (uri: MagitUri) => Promise<DocumentView | undefined>;
type Rebuilder = { test: (uri: MagitUri) => boolean; build: ViewRebuilder };

export class MagitFileSystemProvider implements FileSystemProvider {

  private _emitter = new EventEmitter<FileChangeEvent[]>();
  onDidChangeFile: Event<FileChangeEvent[]> = this._emitter.event;

  // mtime bumps on each refresh so VS Code re-reads; size is the rendered byte
  // length so it knows how much to fetch.
  private mtimes = new Map<string, number>();
  private sizes = new Map<string, number>();

  // Rebuild a view from its URI alone — used when an editor was persisted
  // across a window reload and `views` is empty.
  private rebuilders: Rebuilder[] = [];

  registerRebuilder(test: (uri: MagitUri) => boolean, build: ViewRebuilder): void {
    this.rebuilders.push({ test, build });
  }

  fireChanged(uri: MagitUri): void {
    this.mtimes.set(uri.toString(), Date.now());
    this._emitter.fire([{ type: FileChangeType.Changed, uri }]);
  }

  watch(): Disposable {
    return new Disposable(() => { });
  }

  async stat(uri: Uri): Promise<FileStat> {
    const magitUri = asMagitUri(uri);
    if (magitUri && (views.has(magitUri.toString()) || this.canRebuild(magitUri))) {
      return {
        type: FileType.File,
        ctime: 0,
        mtime: this.mtimes.get(magitUri.toString()) ?? 0,
        size: this.sizes.get(magitUri.toString()) ?? 0,
      };
    }
    throw FileSystemError.FileNotFound(uri);
  }

  async readFile(uri: Uri): Promise<Uint8Array> {
    const magitUri = asMagitUri(uri);
    if (!magitUri) throw FileSystemError.FileNotFound(uri);
    let view = views.get(magitUri.toString());
    if (!view) {
      view = await this.rebuild(magitUri);
      if (!view) throw FileSystemError.FileNotFound(uri);
      views.set(magitUri.toString(), view);
    }
    const bytes = Buffer.from(view.render(0).join('\n'), 'utf8');
    this.sizes.set(magitUri.toString(), bytes.length);
    return bytes;
  }

  private canRebuild(uri: MagitUri): boolean {
    return this.rebuilders.some(r => r.test(uri));
  }

  private async rebuild(uri: MagitUri): Promise<DocumentView | undefined> {
    for (const r of this.rebuilders) {
      if (r.test(uri)) return r.build(uri);
    }
    return undefined;
  }

  readDirectory(uri: Uri): never {
    throw FileSystemError.FileNotADirectory(uri);
  }

  createDirectory(uri: Uri): never {
    throw FileSystemError.NoPermissions(uri);
  }

  writeFile(uri: Uri): never {
    throw FileSystemError.NoPermissions(uri);
  }

  delete(uri: Uri): never {
    throw FileSystemError.NoPermissions(uri);
  }

  rename(uri: Uri): never {
    throw FileSystemError.NoPermissions(uri);
  }
}

export const magitFileSystemProvider = new MagitFileSystemProvider();
