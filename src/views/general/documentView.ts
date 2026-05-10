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