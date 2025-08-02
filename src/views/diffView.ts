import { DocumentView } from './general/documentView';
import { Uri } from 'vscode';
import * as Constants from '../common/constants';
import { TextView } from './general/textView';
import { MagitRepository } from '../models/magitRepository';
import { gitRun } from '../utils/gitRawRunner';
import { MagitChange } from '../models/magitChange';
import { ChangeSectionView } from './changes/changesSectionView';
import { Section } from './general/sectionHeader';

export class DiffView extends DocumentView {

  static UriPath: string = 'diff.magit';
  isHighlightable = false;
  needsUpdate = false;

  constructor(uri: Uri, private changes: MagitChange[]) {
    super(uri);

    this.addSubview(new ChangeSectionView(Section.Changes, changes));
  }

  public update(state: MagitRepository): void { }

  static index = 0;
  static encodeLocation(repository: MagitRepository, diffId: string): Uri {
    return Uri.parse(`${Constants.MagitUriScheme}:${DiffView.UriPath}?${repository.uri.fsPath}#${diffId}${DiffView.index++}`);
  }
}