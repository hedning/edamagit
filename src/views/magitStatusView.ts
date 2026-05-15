import { buildMagitUri, MagitUri } from '../common/magitUri';
import MagitUtils from '../utils/magitUtils';
import { magitConfig } from '../extension';
import { RebuildableViewKind } from './general/documentView';
import { ChangeSectionView } from './changes/changesSectionView';
import { Section } from './general/sectionHeader';
import { DocumentView } from './general/documentView';
import { StashSectionView } from './stashes/stashSectionView';
import { CommitItemView } from './commits/commitSectionView';
import { LineBreakView } from './general/lineBreakView';
import { BranchHeaderSectionView } from './branches/branchHeaderSectionView';
import { MergingSectionView } from './merging/mergingSectionView';
import { MagitRepository } from '../models/magitRepository';
import { RebasingSectionView } from './rebasing/rebasingSectionView';
import { CherryPickingSectionView } from './cherryPicking/cherryPickingSectionView';
import { RevertingSectionView } from './reverting/revertingSectionView';
import { MagitBranch } from '../models/magitBranch';
import { getLatestGitError } from '../commands/commandPrimer';
import { PullRequestSectionView } from './forge/pullRequestSectionView';
import { IssueSectionView } from './forge/issueSectionView';
import { ErrorMessageView } from './errorMessageView';
import { WorktreeSectionView } from './worktrees/worktreeSectionView';
import { TerminalsSectionView, terminalsForWorktree } from './terminals/terminalsSectionView';

export default class MagitStatusView extends DocumentView {

  public HEAD?: MagitBranch;

  provideContent(magitState: MagitRepository) {
    this.HEAD = magitState.HEAD;
    this.subViews = [];

    let latestGitError = getLatestGitError(magitState);
    if (latestGitError) {
      this.addSubview(new ErrorMessageView(latestGitError));
    }

    const header = new BranchHeaderSectionView(magitState.HEAD);
    this.addSubview(header);

    const refs = magitState.remotes.reduce((prev, remote) => remote.branches.concat(prev), magitState.branches.concat(magitState.tags));

    if (magitState.HEAD?.commitDetails && !magitConfig.hiddenStatusSections.has('recent commits')) {
      const behind = magitState.HEAD.upstreamRemote?.commitsBehind ?? magitState.HEAD.pushRemote?.commitsBehind ?? [];
      for (const commit of behind.slice(0, 10)) {
        header.addSubview(new CommitItemView(commit, undefined, refs));
      }
      for (const commit of magitState.log.slice(0, 10)) {
        header.addSubview(new CommitItemView(commit, undefined, refs));
      }
    }

    header.addSubview(new LineBreakView());

    if (magitState.worktrees.length > 1 && !magitConfig.hiddenStatusSections.has('worktrees')) {
      header.addSubview(new WorktreeSectionView(magitState.worktrees, magitState.uri));
      header.addSubview(new LineBreakView());
    }

    if (!magitConfig.hiddenStatusSections.has('terminals')) {
      const terminals = terminalsForWorktree(magitState.uri, magitState.worktrees);
      if (terminals.length > 0) {
        header.addSubview(new TerminalsSectionView(terminals, magitState.uri));
        header.addSubview(new LineBreakView());
      }
    }

    if (magitState.mergingState) {
      header.addSubview(new MergingSectionView(magitState.mergingState));
    }

    if (magitState.rebasingState) {
      header.addSubview(new RebasingSectionView(magitState.rebasingState));
    }

    if (magitState.cherryPickingState) {
      header.addSubview(new CherryPickingSectionView(magitState.cherryPickingState, magitState.log));
    }

    if (magitState.revertingState) {
      header.addSubview(new RevertingSectionView(magitState.revertingState, magitState.log));
    }

    if ((magitState.workingTreeChanges.length) && !magitConfig.hiddenStatusSections.has('unstaged')) {
      header.addSubview(new ChangeSectionView(Section.Unstaged, magitState.workingTreeChanges));
      header.addSubview(new LineBreakView());
    }

    if (magitState.indexChanges.length && !magitConfig.hiddenStatusSections.has('staged')) {
      header.addSubview(new ChangeSectionView(Section.Staged, magitState.indexChanges));
      header.addSubview(new LineBreakView());
    }

    if (magitState.stashes?.length && !magitConfig.hiddenStatusSections.has('stashes')) {
      header.addSubview(new StashSectionView(magitState.stashes));
      header.addSubview(new LineBreakView());
    }

    if (magitState.untrackedFiles.length && !magitConfig.hiddenStatusSections.has('untracked')) {
      header.addSubview(new ChangeSectionView(Section.Untracked, magitState.untrackedFiles));
      header.addSubview(new LineBreakView());
    }

    if (magitState.forgeState?.pullRequests?.length && !magitConfig.hiddenStatusSections.has('pull requests')) {
      header.addSubview(new PullRequestSectionView(magitState.forgeState?.pullRequests));
    }

    if (magitState.forgeState?.issues?.length && !magitConfig.hiddenStatusSections.has('issues')) {
      header.addSubview(new IssueSectionView(magitState.forgeState?.issues));
    }
  }

  public update(state: MagitRepository): void {
    this.provideContent(state);
    this.triggerUpdate();
  }

}

export const MagitStatus: RebuildableViewKind<[]> = {
  authority: 'status',
  buildUri: (repo) => buildMagitUri(repo, 'status', { authority: MagitStatus.authority }),
  build: async (uri) => {
    const repo = await MagitUtils.ensureRepoForMagitUri(uri);
    if (!repo) return undefined;
    const view = new MagitStatusView(uri);
    await view.update(repo);
    return view;
  },
};