import { DocumentView, ViewKind } from './general/documentView';
import { Uri } from 'vscode';
import { buildMagitUri, MagitUri } from '../common/magitUri';
import { TextView } from './general/textView';
import { MagitRepository } from '../models/magitRepository';

export class BlameView extends DocumentView {

  isHighlightable = false;
  needsUpdate = false;

  constructor(uri: MagitUri, private blame: string) {
    super(uri);

    const blameTextView = new TextView(blame);
    blameTextView.isHighlightable = false;
    this.addSubview(blameTextView);
  }

  public update(state: MagitRepository): void { }
}

// Not rebuildable: would require re-running `git blame` against the file
// in the fragment. Tab drops on reload.
export const Blame: ViewKind<[Uri]> = {
  authority: 'blame',
  buildUri: (repo, fileUri) => {
    const basename = fileUri.path.slice(fileUri.path.lastIndexOf('/') + 1);
    return buildMagitUri(repo.uri, `Blame: ${basename}`, {
      authority: Blame.authority,
      fragment: fileUri.path,
    });
  },
};
