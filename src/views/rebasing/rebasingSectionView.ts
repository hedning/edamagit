import { View } from '../general/view';
import { UnclickableSemanticTextView, Token } from '../general/semanticTextView';
import { SemanticTokenTypes } from '../../common/constants';
import { LineBreakView } from '../general/lineBreakView';
import { CommitItemView } from '../commits/commitSectionView';
import { MagitRebasingState } from '../../models/magitRebasingState';

export class RebasingSectionView extends View {
  isFoldable = true;
  readonly headerText: string;

  get id() { return 'Rebasing'; }

  constructor(rebasingState: MagitRebasingState) {
    super();
    this.headerText = `Rebasing ${rebasingState.origBranchName} onto ${rebasingState.onto.name}`;
    this.subViews = [
      new UnclickableSemanticTextView(new Token(this.headerText, SemanticTokenTypes.SectionHeader)),
      ...rebasingState.upcomingCommits.map(c => new CommitItemView(c, 'pick')),
      new CommitItemView(rebasingState.currentCommit, 'join'),
      ...rebasingState.doneCommits.map(c => new CommitItemView(c, 'done')),
      new CommitItemView(rebasingState.onto.commitDetails, 'onto'),
      new LineBreakView()
    ];
  }
}