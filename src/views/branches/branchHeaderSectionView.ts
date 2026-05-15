import { View } from '../general/view';
import { UnclickableTextView, TextView } from '../general/textView';
import { MagitBranch, MagitUpstreamRef } from '../../models/magitBranch';
import { Commit, Ref } from '../../typings/git';
import { SemanticTextView, Token } from '../general/semanticTextView';
import { SemanticTokenTypes } from '../../common/constants';
import { CommitItemView } from '../commits/commitSectionView';
import GitTextUtils from '../../utils/gitTextUtils';

const LOG_LIMIT = 10;

export class BranchHeaderSectionView extends View {
  isFoldable = true;

  get id() { return 'HEAD_section'; }

  constructor(HEAD?: MagitBranch, log: Commit[] = [], refs: Ref[] = [], behind: Commit[] = []) {
    super();
    if (!HEAD?.commitDetails) {
      this.addSubview(new TextView('In the beginning there was darkness'));
      return;
    }

    this.addSubview(new UnclickableTextView('Head:'));
    for (const commit of behind.slice(0, LOG_LIMIT)) {
      this.addSubview(new CommitItemView(commit, undefined, refs));
    }
    for (const commit of log.slice(0, LOG_LIMIT)) {
      this.addSubview(new CommitItemView(commit, undefined, refs));
    }

    if (HEAD.upstreamRemote) {
      this.addSubview(new UnclickableTextView(HEAD.upstreamRemote.rebase ? 'Rebase:' : 'Merge:'));
      this.addSubview(remoteSummary(HEAD.upstreamRemote));
    }

    if (HEAD.pushRemote) {
      this.addSubview(new UnclickableTextView('Push:'));
      this.addSubview(remoteSummary(HEAD.pushRemote));
    }

    if (HEAD.tag?.name) {
      this.addSubview(new UnclickableTextView('Tag:'));
      this.addSubview(new SemanticTextView(new Token(HEAD.tag.name, SemanticTokenTypes.TagName)));
    }
  }
}

function remoteSummary(upstream: MagitUpstreamRef): SemanticTextView {
  return new SemanticTextView(
    new Token(`${upstream.remote}/${upstream.name}`, SemanticTokenTypes.RemoteRefName),
    ` ${GitTextUtils.shortCommitMessage(upstream.commit?.message)}`
  );
}
