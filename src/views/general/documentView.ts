import { View } from './view';
import { MagitRepository } from '../../models/magitRepository';
import { magitFileSystemProvider } from '../../providers/magitFileSystemProvider';
import { MagitUri } from '../../common/magitUri';

export abstract class DocumentView extends View {

  isHighlightable = false;

  needsUpdate: boolean = true;

  constructor(public uri: MagitUri) {
    super();
  }

  public abstract update(state: MagitRepository): void | Promise<void>;

  public triggerUpdate() {
    magitFileSystemProvider.fireChanged(this.uri);
  }
}

// Per-view factory. Owns the encode side (`buildUri`) and identifies the
// view kind by `authority`. Each view file exports one of these alongside
// its class.
//
// `TArgs` is whatever extra inputs the live "open this view" path needs
// beyond the repo — revs+args for log, a commit for commit-detail, a section
// for section-diff. For rebuild-from-URI to work, all of `TArgs` must be
// recoverable from the URI alone.
export interface ViewKind<TArgs extends any[] = any[]> {
  authority: string;
  buildUri(repo: MagitRepository, ...args: TArgs): MagitUri;
}

// Stronger contract: the view can be rebuilt from URI alone. `build` is the
// single constructor used by both the fresh-open path and the FS provider's
// rebuild path — they're the same operation, and the live caller just
// happens to have constructed the URI a moment earlier.
//
// Returning `undefined` is honest: the URI's repo couldn't be located, etc.
// Only `RebuildableViewKind`s can be passed to `provider.register`.
export interface RebuildableViewKind<TArgs extends any[] = any[]> extends ViewKind<TArgs> {
  build(uri: MagitUri): Promise<DocumentView | undefined>;
}