import { DocumentView } from './general/documentView';
import { Uri } from 'vscode';
import * as Constants from '../common/constants';
import { TextView } from './general/textView';
import { MagitCommit } from '../models/magitCommit';
import { MagitRepository } from '../models/magitRepository';
import { MagitChange } from '../models/magitChange';
import { ChangeView } from './changes/changeView';
import { Section, SectionHeaderView } from './general/sectionHeader';
import { ChangeSectionView } from './changes/changesSectionView';
import { LineBreakView } from './general/lineBreakView';

export class CommitDetailView extends DocumentView {

  static UriPath: string = 'commit.magit';
  isHighlightable = false;
  needsUpdate = false;

  constructor(uri: Uri, public commit: MagitCommit, changes: MagitChange[]) {
    super(uri);

    const messageView = new TextView(commit.message);
    messageView.isHighlightable = true;
    this.addSubview(messageView, new LineBreakView());

    this.addSubview(
      ...changes.map(change => {
        const view = new ChangeView(Section.Changes, change, commit.hash);
        view.foldedByDefault = false;
        return view;
      }),
    );

  }

  public update(state: MagitRepository): void { }

  static encodeLocation(repository: MagitRepository, commitHash: string): Uri {
    return Uri.parse(`${Constants.MagitUriScheme}:${CommitDetailView.UriPath}?${repository.uri.fsPath}#${commitHash}`);
  }
}