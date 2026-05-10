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

  public abstract update(state: MagitRepository): void;

  public triggerUpdate() {
    magitFileSystemProvider.fireChanged(this.uri);
  }
}

// Contract for a `DocumentView` subclass that participates in URI-based
// rebuild dispatch. The FS provider keys off `UriAuthority`; `rebuild` is the
// inverse of the subclass's `encodeLocation` and is called when an editor is
// restored across a window reload (so `views` is empty). Returning
// `undefined` is honest: it tells the FS provider this URI's tab can't be
// brought back, and VS Code drops it.
export interface DocumentViewClass {
  UriAuthority: string;
  rebuild(uri: MagitUri): Promise<DocumentView | undefined>;
}