import { DocumentView } from './general/documentView';
import { Uri } from 'vscode';
import { buildMagitUri, MagitUri } from '../common/magitUri';
import { TextView } from './general/textView';
import { MagitRepository } from '../models/magitRepository';

export class BlameView extends DocumentView {

  static UriAuthority: string = 'blame';
  isHighlightable = false;
  needsUpdate = false;

  constructor(uri: MagitUri, private blame: string) {
    super(uri);

    const blameTextView = new TextView(blame);
    blameTextView.isHighlightable = false;
    this.addSubview(blameTextView);
  }

  public update(state: MagitRepository): void { }

  static buildUri(repository: MagitRepository, fileUri: Uri): MagitUri {
    const basename = fileUri.path.slice(fileUri.path.lastIndexOf('/') + 1);
    const leaf = `Blame: ${basename}`;
    return buildMagitUri(repository.uri, leaf, {
      authority: BlameView.UriAuthority,
      fragment: fileUri.path,
    });
  }
  // No `static rebuild`: would require re-running `git blame` against the
  // file in the fragment. Skipped for now; tab drops on reload.
}