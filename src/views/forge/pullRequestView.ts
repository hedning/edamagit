import { DocumentView } from '../general/documentView';
import { buildMagitUri, MagitUri } from '../../common/magitUri';
import { TextView, UnclickableTextView } from '../general/textView';
import { PullRequest } from '../../forge/model/pullRequest';
import { MagitRepository } from '../../models/magitRepository';
import { View } from '../general/view';
import { LineBreakView } from '../general/lineBreakView';
import { IssueCommentSection, IssueCommentView } from './issueView';

export class PullRequestView extends DocumentView {

  static UriPath: string = 'pr';
  static UriAuthority: string = 'pr';

  constructor(uri: MagitUri, public pullRequest: PullRequest) {
    super(uri);
    this.provideContent(pullRequest);
  }

  provideContent(pullRequest: PullRequest) {
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

  static buildUri(repository: MagitRepository, pullRequest: PullRequest): MagitUri {
    return buildMagitUri(repository.uri, PullRequestView.UriPath, {
      authority: PullRequestView.UriAuthority,
      fragment: `${pullRequest.number}`,
    });
  }
  // No `static rebuild`: requires forge state which isn't fetched on demand.
  // Tab drops on reload; reopen via the status view to refetch.
}

class PullRequestHeader extends View {
  isFoldable = true;

  get id() { return `pullRequestHeader#${this.pullRequest.number}`; }

  constructor(private pullRequest: PullRequest) {
    super();
    this.addSubview(new UnclickableTextView(`#${pullRequest.number}: ${pullRequest.title}`));
    this.addSubview(new TextView(`Title: ${pullRequest.title}`));
    this.addSubview(new TextView(`State: open`));
    this.addSubview(new TextView(`Labels: ${pullRequest.labels.map(l => `[${l.name}]`).join(' ')}`));
  }
}
