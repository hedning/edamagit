import { window, workspace, TextEditorRevealType, Range, Position, Selection, commands, Uri, TextEditor } from 'vscode';
import { MagitRepository } from '../models/magitRepository';
import { CommitItemView } from '../views/commits/commitSectionView';
import { DocumentView } from '../views/general/documentView';
import { gitRun, gitRunInUri } from '../utils/gitRawRunner';
import GitTextUtils from '../utils/gitTextUtils';
import { buildHistoryUri } from '../common/historyUri';
import { CommitDetail, CommitDetailView } from '../views/commitDetailView';
import { StashItemView } from '../views/stashes/stashSectionView';
import { WorktreeItemView } from '../views/worktrees/worktreeSectionView';
import { TerminalItemView } from '../views/terminals/terminalsSectionView';
import { ChangeView } from '../views/changes/changeView';
import { MagitCommit } from '../models/magitCommit';
import { HunkView } from '../views/changes/hunkView';
import { BranchListingView } from '../views/branches/branchListingView';
import { RemoteBranchListingView } from '../views/remotes/remoteBranchListingView';
import { TagListingView } from '../views/tags/tagListingView';
import * as Diffing from './diffingCommands';
import * as Constants from '../common/constants';
import ViewUtils from '../utils/viewUtils';
import { IssueItemView } from '../views/forge/issueSectionView';
import { Issue, IssueView } from '../views/forge/issueView';
import { PullRequestItemView } from '../views/forge/pullRequestSectionView';
import { PullRequest, PullRequestView } from '../views/forge/pullRequestView';
import { sep } from 'path';
import { ErrorMessageView } from '../views/errorMessageView';
import { processView } from './processCommands';
import { magitStatusForPath, toMagitChange } from './statusCommands';
import { getCommit } from '../utils/commitCache';
import { Ref, RefType, Repository } from '../typings/git';
import path = require('path');
import { ca } from 'date-fns/locale';
import { BranchHeaderView } from '../views/branches/branchHeaderView';
import { MagitChange } from '../models/magitChange';
import { diffToMagitChanges } from '../utils/diffParser';
import MagitUtils from '../utils/magitUtils';

export async function magitVisitAtPoint(repository: MagitRepository, currentView: DocumentView) {
  return await magitVisitAtPointInternal(repository, currentView, true);
}

export async function magitVisitAtPointInref(repository: MagitRepository, currentView: DocumentView) {
  return await magitVisitAtPointInternal(repository, currentView, false);
}

async function magitVisitAtPointInternal(repository: MagitRepository, currentView: DocumentView, worktree: boolean) {

  const activePosition = window.activeTextEditor?.selection.active;
  if (!activePosition) return;

  const selectedView = currentView.click(activePosition);

  console.log('[magit:visit] currentView=%s selectedView=%s worktree=%s pos=%o',
    currentView?.constructor?.name, selectedView?.constructor?.name, worktree, activePosition);

  if (selectedView instanceof ChangeView) {
    const change = selectedView.change;
    console.log('[magit:visit] ChangeView change=%o ref=%o', change?.relativePath, change?.ref);
    if (change.hunks?.length) return visitHunk(repository, selectedView.subViews.find(v => v instanceof HunkView) as HunkView, undefined, worktree);

    // Resolve the file URI from the live repo so it follows the worktree the
    // status view was opened from, not whichever root the change object was
    // first built against.
    const fileUri = change.relativePath ? Uri.joinPath(repository.uri, change.relativePath) : change.uri;

    // Check if change path is a directory. Reveal directories in file explorer
    if (change.relativePath?.endsWith(sep)) return commands.executeCommand('revealInExplorer', fileUri);

    if (worktree || !change.ref) {
      console.log('[magit:visit] → worktree open (worktree=%s, ref=%o)', worktree, change.ref);
      return window.showTextDocument(fileUri, { viewColumn: ViewUtils.showDocumentColumn(), preview: false });
    } else {
      console.log('[magit:visit] → openUriAtRevision');
      return openUriAtRevision(repository, fileUri, change.ref);
    }

  } else if (selectedView instanceof HunkView) {
    return visitHunk(repository, selectedView, activePosition, worktree);

  } else if (selectedView instanceof CommitItemView) {
    return visitCommit(repository, selectedView.commit.hash);

  } else if (
    selectedView instanceof BranchListingView ||
    selectedView instanceof RemoteBranchListingView ||
    selectedView instanceof TagListingView ||
    selectedView instanceof BranchHeaderView
  ) {
    return visitCommit(repository, selectedView.ref.commit!);

  } else if (selectedView instanceof StashItemView) {
    return Diffing.showStashDetail(repository, selectedView.stash);

  } else if (selectedView instanceof WorktreeItemView) {
    if (selectedView.worktree.bare) return;
    return magitStatusForPath(selectedView.worktree.path);

  } else if (selectedView instanceof TerminalItemView) {
    // Note: if editor group is hidden this doesn't work
    // The alternative is ugly hacks though:/
    return selectedView.terminal.show();

  } else if (selectedView instanceof IssueItemView) {
    const issue = selectedView.issue;
    const uri = Issue.buildUri(repository, issue);
    const issueView = ViewUtils.createOrUpdateView(repository, uri, () => new IssueView(uri, issue));
    return ViewUtils.showView(uri, issueView);

  } else if (selectedView instanceof PullRequestItemView) {
    const pullRequest = selectedView.pullRequest;
    const uri = PullRequest.buildUri(repository, pullRequest);
    let pullRequestView = ViewUtils.createOrUpdateView(repository, uri, () => new PullRequestView(uri, pullRequest));

    return ViewUtils.showView(uri, pullRequestView);

  } else if (selectedView instanceof ErrorMessageView) {
    return processView(repository);

  } else {
    window.setStatusBarMessage('There is no thing at point that could be visited', Constants.StatusMessageDisplayTimeout);

  }
}


export async function magitOpenFileAtRevision(repository: MagitRepository) {
  if (!window.activeTextEditor) return;

  const ref = await MagitUtils.chooseRef(repository, 'Open file at revision');
  const hash = await gitRunInUri(repository.uri, ['rev-parse', ref]);

  return await openUriAtRevision(repository, window.activeTextEditor.document.uri, { type: RefType.Head, name: ref, commit: hash.stdout.trimEnd() });
}

export async function openUriAtRevision(repository: MagitRepository, fileUri: Uri, ref: Ref, selection?: Range) {
  const uri = buildHistoryUri(repository.uri, fileUri, ref);
  console.log('[magit:openUriAtRevision] showing uri=%s', uri.toString());
  return await window.showTextDocument(uri, { viewColumn: ViewUtils.showDocumentColumn(), preview: false, selection });
}


async function visitHunk(repository: MagitRepository, selectedView: HunkView, activePosition?: Position, worktree: boolean = false) {

  const changeHunk = selectedView.changeHunk;
  const ref = selectedView.ref;
  const fileUri = Uri.joinPath(repository.uri, changeHunk.relativePath);
  console.log('[magit:visit] visitHunk uri=%s worktree=%s ref=%o',
    fileUri.toString(), worktree, ref);

  let relevantSelection: Selection | undefined = undefined;
  try {
    const startLineMatches = changeHunk.diff.match(/(?<=\+)\d+(?=,)/g);

    if (startLineMatches?.length) {

      const diffStartLineInFile = Number.parseInt(startLineMatches[0].toString()) - 1; // -1 to translate to zero-based line numbering

      let activeLineRelativeToDiff = 0;
      let relevantCharacterSelection = 0;
      if (activePosition && activePosition.line > selectedView.range.start.line) {

        activeLineRelativeToDiff = activePosition.line - (selectedView.range.start.line + 1); // +1 to get past line denoting start line of diff hunk
        relevantCharacterSelection = activePosition.character;

      } else {

        const splitAtAdditions = changeHunk.diff.split(/^\+/gm);
        if (splitAtAdditions.length > 1) {
          activeLineRelativeToDiff = splitAtAdditions[0].split(Constants.LineSplitterRegex).length - 2;
        } else {
          const splitAtDeletions = changeHunk.diff.split(/^-/gm);
          if (splitAtDeletions.length) {
            activeLineRelativeToDiff = splitAtDeletions[0].split(Constants.LineSplitterRegex).length - 2;
          }
        }

        relevantCharacterSelection = 0;
      }

      const numDeletedLinesAboveActiveLine = changeHunk.diff.split(Constants.LineSplitterRegex).slice(0, activeLineRelativeToDiff + 1).filter(line => line.charAt(0) === '-').length;
      const relevantPositionInFile = new Position(diffStartLineInFile + activeLineRelativeToDiff - numDeletedLinesAboveActiveLine, relevantCharacterSelection);

      relevantSelection = new Selection(relevantPositionInFile, relevantPositionInFile);


    }
  } catch { }

  if (worktree || !ref) {
    console.log('[magit:visit] visitHunk → worktree open (worktree=%s, ref=%o)', worktree, ref);
    await window.showTextDocument(fileUri, { viewColumn: ViewUtils.showDocumentColumn(), preview: false, selection: relevantSelection});
  } else {
    console.log('[magit:visit] visitHunk → openUriAtRevision');
    await openUriAtRevision(repository, fileUri, ref, relevantSelection);
  }

}

export function getRepoUri(repo: Repository, file: string) {
  const absolutePath = path.isAbsolute(file) ? file : path.join(repo.rootUri.fsPath, file);
  return Uri.file(absolutePath);
}

export async function getRef(magitState: MagitRepository, ref?: string) {
  const rootUri = magitState.uri;
  ref = ref ?? magitState.HEAD?.name;
  if (!ref) {
    throw new Error('No ref to get');
  }
  const commit = await getCommit(rootUri, ref); // Todo: parse this too
  let diff = (await gitRunInUri(rootUri, ['show', '--format=', commit.hash])).stdout;
  let magitChanges: MagitChange[] = diffToMagitChanges(diff, rootUri, { commit: ref, type: RefType.Head });
  let shortstat = (await gitRunInUri(rootUri, ['show', '--format=', '--shortstat', commit.hash])).stdout.trim();
  return { commit, changes: magitChanges, shortstat };
}

export async function visitCommit(magitState: MagitRepository, commitHash: string) {
  const { commit } = await getRef(magitState, commitHash);
  const view = await ViewUtils.buildOrUpdate(magitState, CommitDetail, commit);
  if (view) return ViewUtils.showView(view.uri, view);
}