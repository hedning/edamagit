import { buildMagitUri, MagitUri } from '../common/magitUri';
import MagitUtils from '../utils/magitUtils';
import { magitConfig } from '../extension';
import { RebuildableViewKind } from './general/documentView';
import { ChangeSectionView } from './changes/changesSectionView';
import { Section } from './general/sectionHeader';
import { DocumentView } from './general/documentView';
import { StashSectionView } from './stashes/stashSectionView';
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
import { SessionFilesSectionView, sessionFilesForWorktree } from './sessionFiles/sessionFilesSectionView';

export default class MagitStatusView extends DocumentView {

  public HEAD?: MagitBranch;

  provideContent(magitState: MagitRepository) {
    this.HEAD = magitState.HEAD;
    this.subViews = [];

    let latestGitError = getLatestGitError(magitState);
    if (latestGitError) {
      this.addSubview(new ErrorMessageView(latestGitError));
    }

    const refs = magitState.remotes.reduce((prev, remote) => remote.branches.concat(prev), magitState.branches.concat(magitState.tags));
    const showLog = !magitConfig.hiddenStatusSections.has('recent commits');
    const behind = magitState.HEAD?.upstreamRemote?.commitsBehind ?? magitState.HEAD?.pushRemote?.commitsBehind ?? [];

    const header = new BranchHeaderSectionView(
      magitState.uri,
      magitState.worktrees,
      magitState.HEAD,
      showLog ? magitState.log : [],
      refs,
      showLog ? behind : [],
    );
    this.addSubview(header);

    this.addSubview(new LineBreakView());

    if (magitState.worktrees.length > 1 && !magitConfig.hiddenStatusSections.has('worktrees')) {
      this.addSubview(new WorktreeSectionView(magitState.worktrees, magitState.uri));
      this.addSubview(new LineBreakView());
    }

    if (!magitConfig.hiddenStatusSections.has('terminals')) {
      const terminals = terminalsForWorktree(magitState.uri, magitState.worktrees);
      if (terminals.length > 0) {
        this.addSubview(new TerminalsSectionView(terminals, magitState.uri));
        this.addSubview(new LineBreakView());
      }
    }

    if (magitState.gitDir && !magitConfig.hiddenStatusSections.has('editing')) {
      const sessionFiles = sessionFilesForWorktree(magitState.gitDir);
      if (sessionFiles.length > 0) {
        this.addSubview(new SessionFilesSectionView(sessionFiles));
        this.addSubview(new LineBreakView());
      }
    }

    if (magitState.mergingState) {
      this.addSubview(new MergingSectionView(magitState.mergingState));
    }

    if (magitState.rebasingState) {
      this.addSubview(new RebasingSectionView(magitState.rebasingState));
    }

    if (magitState.cherryPickingState) {
      this.addSubview(new CherryPickingSectionView(magitState.cherryPickingState, magitState.log));
    }

    if (magitState.revertingState) {
      this.addSubview(new RevertingSectionView(magitState.revertingState, magitState.log));
    }

    if ((magitState.workingTreeChanges.length) && !magitConfig.hiddenStatusSections.has('unstaged')) {
      this.addSubview(new ChangeSectionView(Section.Unstaged, magitState.workingTreeChanges));
      this.addSubview(new LineBreakView());
    }

    if (magitState.indexChanges.length && !magitConfig.hiddenStatusSections.has('staged')) {
      this.addSubview(new ChangeSectionView(Section.Staged, magitState.indexChanges));
      this.addSubview(new LineBreakView());
    }

    if (magitState.stashes?.length && !magitConfig.hiddenStatusSections.has('stashes')) {
      this.addSubview(new StashSectionView(magitState.stashes));
      this.addSubview(new LineBreakView());
    }

    if (magitState.untrackedFiles.length && !magitConfig.hiddenStatusSections.has('untracked')) {
      this.addSubview(new ChangeSectionView(Section.Untracked, magitState.untrackedFiles));
      this.addSubview(new LineBreakView());
    }

    if (magitState.forgeState?.pullRequests?.length && !magitConfig.hiddenStatusSections.has('pull requests')) {
      this.addSubview(new PullRequestSectionView(magitState.forgeState?.pullRequests));
    }

    if (magitState.forgeState?.issues?.length && !magitConfig.hiddenStatusSections.has('issues')) {
      this.addSubview(new IssueSectionView(magitState.forgeState?.issues));
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