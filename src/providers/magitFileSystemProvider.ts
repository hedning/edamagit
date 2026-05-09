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

type ViewRebuilder = (uri: Uri) => Promise<DocumentView | undefined>;
type Rebuilder = { test: (uri: Uri) => boolean; build: ViewRebuilder };

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

  registerRebuilder(test: (uri: Uri) => boolean, build: ViewRebuilder): void {
    this.rebuilders.push({ test, build });
  }

  fireChanged(uri: Uri): void {
    this.mtimes.set(uri.toString(), Date.now());
    this._emitter.fire([{ type: FileChangeType.Changed, uri }]);
  }

  watch(): Disposable {
    return new Disposable(() => { });
  }

  async stat(uri: Uri): Promise<FileStat> {
    if (views.has(uri.toString()) || this.canRebuild(uri)) {
      return {
        type: FileType.File,
        ctime: 0,
        mtime: this.mtimes.get(uri.toString()) ?? 0,
        size: this.sizes.get(uri.toString()) ?? 0,
      };
    }
    throw FileSystemError.FileNotFound(uri);
  }

  async readFile(uri: Uri): Promise<Uint8Array> {
    let view = views.get(uri.toString());
    if (!view) {
      view = await this.rebuild(uri);
      if (!view) throw FileSystemError.FileNotFound(uri);
      views.set(uri.toString(), view);
    }
    const bytes = Buffer.from(view.render(0).join('\n'), 'utf8');
    this.sizes.set(uri.toString(), bytes.length);
    return bytes;
  }

  private canRebuild(uri: Uri): boolean {
    return this.rebuilders.some(r => r.test(uri));
  }

  private async rebuild(uri: Uri): Promise<DocumentView | undefined> {
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
