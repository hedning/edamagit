import { env, window } from 'vscode';
import * as Constants from '../common/constants';
import { MagitRepository } from '../models/magitRepository';
import { BranchListingView } from '../views/branches/branchListingView';
import { ChangeHeaderView } from '../views/changes/changeHeaderView';
import { CommitItemView } from '../views/commits/commitSectionView';
import { DocumentView } from '../views/general/documentView';
import { RemoteBranchListingView } from '../views/remotes/remoteBranchListingView';
import { StashItemView } from '../views/stashes/stashSectionView';
import { TagListingView } from '../views/tags/tagListingView';
import { ChangeView } from '../views/changes/changeView';
import { HunkView } from '../views/changes/hunkView';

export async function copySectionValueCommand(repository: MagitRepository, currentView: DocumentView) {

  const activePosition = window.activeTextEditor?.selection.active;

  if (!activePosition) {
    return;
  }

  let sectionValue: string | undefined;
  let statusMessage: string | undefined;
  const selectedView = currentView.click(activePosition);
  if (selectedView instanceof CommitItemView) {
    sectionValue = selectedView.commit.hash;
  } else if (
    selectedView instanceof BranchListingView ||
    selectedView instanceof RemoteBranchListingView ||
    selectedView instanceof TagListingView
  ) {
    sectionValue = selectedView.ref.commit;
  } else if (selectedView instanceof StashItemView) {
    sectionValue = selectedView.section;
  } else if (
    selectedView instanceof ChangeView ||
    selectedView instanceof ChangeHeaderView
  ) {
    sectionValue = selectedView.change.relativePath;
  } else if (selectedView instanceof HunkView) {
    // Hunks render with the +/-/space prefix stripped, so the visible buffer
    // isn't a valid patch. Reassemble the on-disk patch (file header + hunk)
    // so the clipboard payload is `git apply`-ready.
    const hunk = selectedView.changeHunk;
    sectionValue = `${hunk.diffHeader}${hunk.diff}\n`;
    statusMessage = `Copied patch for hunk in ${hunk.relativePath}`;
  }

  if (sectionValue) {
    await env.clipboard.writeText(sectionValue);
    window.setStatusBarMessage(statusMessage ?? sectionValue, Constants.StatusMessageDisplayTimeout);
  }
}
