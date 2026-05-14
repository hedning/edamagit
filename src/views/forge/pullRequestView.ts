import { DocumentView, ViewKind } from '../general/documentView';
import { buildMagitUri, MagitUri } from '../../common/magitUri';
import { TextView, UnclickableTextView } from '../general/textView';
import { PullRequest as PullRequestModel } from '../../forge/model/pullRequest';
import { MagitRepository } from '../../models/magitRepository';
import { View } from '../general/view';
import { LineBreakView } from '../general/lineBreakView';
import { IssueCommentSection, IssueCommentView } from './issueView';

export class PullRequestView extends DocumentView {

  constructor(uri: MagitUri, public pullRequest: PullRequestModel) {
    super(uri);
    this.provideContent(pullRequest);
  }

  provideContent(pullRequest: PullRequestModel) {
    this.subViews = [
      new PullRequestHeader(pullRequest),
      new LineBreakView(),
      new IssueCommentView({ author: pullRequest.author, bodyText: pullRequest.bodyText, createdAt: pullRequest.createdAt }),
      new IssueCommentSection(pullRequest.comments)
    ];
  }

  public update(state: MagitRepository): void {
    let updatedPullRequest = state.forgeState?.pullRequests.find(i => i.number === this.pullRequest.number);

    if (updatedPullRequest) {
      this.pullRequest = updatedPullRequest;
      this.provideContent(this.pullRequest);
      this.triggerUpdate();
    }
  }

}

// Not rebuildable: requires forge state which isn't fetched on demand.
// Tab drops on reload; reopen via the status view to refetch.
export const PullRequest: ViewKind<[PullRequestModel]> = {
  authority: 'pr',
  buildUri: (repo, pr) => buildMagitUri(repo, 'pr', {
    authority: PullRequest.authority,
    title: `#${pr.number} ${pr.title}`,
    fragment: `${pr.number}`,
  }),
};

class PullRequestHeader extends View {
  isFoldable = true;

  get id() { return `pullRequestHeader#${this.pullRequest.number}`; }

  constructor(private pullRequest: PullRequestModel) {
    super();
    this.addSubview(new UnclickableTextView(`#${pullRequest.number}: ${pullRequest.title}`));
    this.addSubview(new TextView(`Title: ${pullRequest.title}`));
    this.addSubview(new TextView(`State: open`));
    this.addSubview(new TextView(`Labels: ${pullRequest.labels.map(l => `[${l.name}]`).join(' ')}`));
  }
}
