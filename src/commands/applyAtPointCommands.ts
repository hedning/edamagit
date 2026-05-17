import { window } from 'vscode';
import { MagitRepository } from '../models/magitRepository';
import { CommitItemView } from '../views/commits/commitSectionView';
import { DocumentView } from '../views/general/documentView';
import { gitRun, gitRunInUri } from '../utils/gitRawRunner';
import { StashItemView } from '../views/stashes/stashSectionView';
import * as CherryPicking from './cherryPickingCommands';
import { BranchListingView } from '../views/branches/branchListingView';
import { RemoteBranchListingView } from '../views/remotes/remoteBranchListingView';
import { TagListingView } from '../views/tags/tagListingView';
import MagitUtils from '../utils/magitUtils';
import { HunkView } from '../views/changes/hunkView';
import { Section } from '../views/general/sectionHeader';
import GitTextUtils from '../utils/gitTextUtils';
import { ChangeView } from '../views/changes/changeView';

export async function magitApplyEntityAtPoint(repository: MagitRepository, currentView: DocumentView): Promise<any> {

  const selectedView = currentView.click(window.activeTextEditor!.selection.active);

  if (selectedView instanceof HunkView) {
    if (selectedView.section !== Section.Staged) {
      const patch = GitTextUtils.generatePatchFromChangeHunkView(selectedView);
      return apply(repository, patch, { index: false });
    }

  } else if (selectedView instanceof ChangeView) {
    const change = selectedView.change;
    return apply(repository, change.diff!, { index: false });
  } else if (selectedView instanceof CommitItemView) {
    const commit = selectedView.commit;
    return CherryPicking.cherryPick(repository, commit.hash, { noCommit: true });

  } else if (
    selectedView instanceof BranchListingView ||
    selectedView instanceof RemoteBranchListingView ||
    selectedView instanceof TagListingView
  ) {
    const ref = (selectedView as BranchListingView).ref;
    if (ref.commit) return CherryPicking.cherryPick(repository, ref.commit, { noCommit: true });

  } else if (selectedView instanceof StashItemView) {
    const stash = selectedView.stash;
    const args = ['stash', 'apply', '--index', `stash@{${stash.index}}`];
    return gitRunInUri(repository.uri, args);

  } else {
    const ref = await MagitUtils.chooseRef(repository, 'Apply changes from commit');

    if (ref) return CherryPicking.cherryPick(repository, ref, { noCommit: true });
  }
}

interface ApplyOptions {
  index?: boolean;
  reverse?: boolean;
}

export async function apply(repository: MagitRepository, patch: string, { index, reverse }: ApplyOptions) {

  const args = ['apply', '--ignore-space-change'];

  if (index) {
    args.push('--cached');
  }

  if (reverse) {
    args.push('--reverse');
  }

  return gitRunInUri(repository.uri, args, { input: patch });
}