import { View } from './view';
import { Uri } from 'vscode';
import { MagitRepository } from '../../models/magitRepository';
import { magitFileSystemProvider } from '../../providers/magitFileSystemProvider';

export abstract class DocumentView extends View {

  isHighlightable = false;

  needsUpdate: boolean = true;

  constructor(public uri: Uri) {
    super();
  }

  public abstract update(state: MagitRepository): void;

  public triggerUpdate() {
    magitFileSystemProvider.fireChanged(this.uri);
  }
}