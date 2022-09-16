import { DocumentView } from './general/documentView';
import { Uri } from 'vscode';
import * as Constants from '../common/constants';
import { TextView } from './general/textView';
import { MagitCommit } from '../models/magitCommit';
import { MagitRepository } from '../models/magitRepository';
import { MagitChange } from '../models/magitChange';
import { ChangeView } from './changes/changeView';
import { Section, SectionHeaderView } from './general/sectionHeader';
import { LineBreakView } from './general/lineBreakView';
import GitTextUtils from '../utils/gitTextUtils';
import { CommitItemView, CommitSectionView } from './commits/commitSectionView';
import { Commit, Ref } from '../typings/git';

export class CommitDetailView extends DocumentView {

  static UriPath: string = 'commit.magit';
  isHighlightable = true;
  needsUpdate = false;

  constructor(uri: Uri, public commit: MagitCommit, changes: MagitChange[], parents: Commit[], refs: Ref[]) {
    super(uri);


    this.addSubview(new CommitItemView(commit, undefined, refs));
    // this.addSubview(shaView);
    const author = `${commit.authorName} <${commit.authorEmail}>`;
    const authorDetails = new TextView(`Author:     ${author}`);
    this.addSubview(authorDetails);

    this.addSubview(new TextView(`AuthorDate: ${commit.authorDate}`));
    this.addSubview(new TextView(`CommitDate: ${commit.commitDate}`));


    this.addSubview(new CommitSectionView(Section.Parents, parents, refs));

    const messageView = new TextView(commit.message);
    this.addSubview(new LineBreakView(), messageView, new LineBreakView());

    this.addSubview(
      ...changes.map(change => {
        const view = new ChangeView(Section.Changes, change, commit.hash);
        view.foldedByDefault = false;
        return view;
      }),
    );

  }

  public update(state: MagitRepository): void { }

  static index = 0;
  static encodeLocation(repository: MagitRepository, commitHash: string): Uri {
    return Uri.parse(`${Constants.MagitUriScheme}:${CommitDetailView.UriPath}?${repository.uri.fsPath}#${commitHash}${CommitDetailView.index++}`);
  }
}