import { DocumentView } from './general/documentView';
import { Uri } from 'vscode';
import { buildMagitUri } from '../common/magitUri';
import { TextView } from './general/textView';
import { MagitRepository } from '../models/magitRepository';

export class BlameView extends DocumentView {

  isHighlightable = false;
  needsUpdate = false;

  constructor(uri: Uri, private blame: string) {
    super(uri);

    const blameTextView = new TextView(blame);
    blameTextView.isHighlightable = false;
    this.addSubview(blameTextView);
  }

  public update(state: MagitRepository): void { }

  static index = 0;
  static encodeLocation(repository: MagitRepository, fileUri: Uri): Uri {
    const basename = fileUri.path.slice(fileUri.path.lastIndexOf('/') + 1);
    const leaf = `Blame: ${basename}`;
    return buildMagitUri(repository.uri, leaf, { fragment: `${fileUri.path}#${BlameView.index++}` });
  }
}