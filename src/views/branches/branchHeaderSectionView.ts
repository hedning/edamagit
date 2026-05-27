import * as path from 'path';
import { Uri } from 'vscode';
import { View } from '../general/view';
import { TextView } from '../general/textView';
import { MagitBranch, MagitUpstreamRef } from '../../models/magitBranch';
import { Commit, Ref } from '../../typings/git';
import { SemanticTextView, UnclickableSemanticTextView, Token } from '../general/semanticTextView';
import { SemanticTokenTypes } from '../../common/constants';
import { CommitItemView } from '../commits/commitSectionView';
import GitTextUtils from '../../utils/gitTextUtils';
import { Worktree } from '../../utils/worktreeParsers';

const LOG_LIMIT = 5;

export class BranchHeaderSectionView extends View {
  isFoldable = true;
  // Plain-text form of the first line; symbol provider surfaces it as the
  // sticky-scroll symbol name so the user sees "HEAD: <repo>/<wt> <branch>"
  // rather than just "HEAD" when scrolled past it.
  public readonly headerText: string;

  get id() { return 'HEAD_section'; }

  constructor(
    currentUri: Uri,
    worktrees: Worktree[],
    HEAD?: MagitBranch,
    log: Commit[] = [],
    refs: Ref[] = [],
    behind: Commit[] = [],
  ) {
    super();

    if (!HEAD?.commitDetails) {
      this.headerText = 'In the beginning there was darkness';
      this.addSubview(new TextView(this.headerText));
      return;
    }

    const repoSegment = describeWorktree(currentUri, worktrees);
    const branchLabel = HEAD.name ?? GitTextUtils.shortHash(HEAD.commit);
    this.headerText = `HEAD: ${repoSegment} ${branchLabel}`;

    this.addSubview(new SemanticTextView(
      new Token('HEAD:', SemanticTokenTypes.SectionHeader),
      ` ${repoSegment} `,
      new Token(branchLabel, SemanticTokenTypes.HeadName),
    ));

    for (const commit of behind.slice(0, LOG_LIMIT)) {
      this.addSubview(new CommitItemView(commit, undefined, []));
    }
    for (const commit of log.slice(0, LOG_LIMIT)) {
      this.addSubview(new CommitItemView(commit, undefined, []));
    }

    if (HEAD.upstreamRemote) {
      this.addSubview(new UnclickableSemanticTextView(
        new Token(HEAD.upstreamRemote.rebase ? 'Rebase:' : 'Merge:', SemanticTokenTypes.SectionHeader)));
      this.addSubview(remoteSummary(HEAD.upstreamRemote));
    }

    if (HEAD.tag?.name) {
      this.addSubview(new UnclickableSemanticTextView(new Token('Tag:', SemanticTokenTypes.SectionHeader)));
      this.addSubview(new SemanticTextView(new Token(HEAD.tag.name, SemanticTokenTypes.TagName)));
    }
  }
}

function describeWorktree(currentUri: Uri, worktrees: Worktree[]): string {
  const currentPath = path.resolve(currentUri.fsPath);
  const mainPath = path.resolve(worktrees[0]?.path.fsPath ?? currentPath);
  const repoBase = path.basename(mainPath);
  if (mainPath === currentPath) {
    return repoBase;
  }
  return `${repoBase}/${path.basename(currentPath)}`;
}

function remoteSummary(upstream: MagitUpstreamRef): SemanticTextView {
  return new SemanticTextView(
    new Token(`${upstream.remote}/${upstream.name}`, SemanticTokenTypes.RemoteRefName),
    ` ${GitTextUtils.shortCommitMessage(upstream.commit?.message)}`,
  );
}
