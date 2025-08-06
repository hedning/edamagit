import { window, workspace, TextEditorRevealType, Range, Position, Selection, commands, Uri, TextEditor } from 'vscode';
import { MagitRepository } from '../models/magitRepository';
import { CommitItemView } from '../views/commits/commitSectionView';
import { DocumentView } from '../views/general/documentView';
import { gitRun } from '../utils/gitRawRunner';
import { CommitDetailView } from '../views/commitDetailView';
import { StashItemView } from '../views/stashes/stashSectionView';
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
import { IssueView } from '../views/forge/issueView';
import { PullRequestItemView } from '../views/forge/pullRequestSectionView';
import { PullRequestView } from '../views/forge/pullRequestView';
import { sep } from 'path';
import { ErrorMessageView } from '../views/errorMessageView';
import { processView } from './processCommands';
import { toMagitChange } from './statusCommands';
import { getCommit } from '../utils/commitCache';
import { Ref, RefType, Repository } from '../typings/git';
import path = require('path');
import { ca } from 'date-fns/locale';
import { BranchHeaderView } from '../views/branches/branchHeaderView';
import { MagitChange } from '../models/magitChange';
import { diffToMagitChanges } from '../utils/gitUtils';
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

  if (selectedView instanceof ChangeView) {
    const change = selectedView.change;
    if (change.hunks?.length) return visitHunk(selectedView.subViews.find(v => v instanceof HunkView) as HunkView, undefined, worktree);

    // Check if change path is a directory. Reveal directories in file explorer
    if (change.relativePath?.endsWith(sep)) return commands.executeCommand('revealInExplorer', change.uri);

    if (worktree || !change.ref) {
      return window.showTextDocument(change.uri, { viewColumn: ViewUtils.showDocumentColumn(), preview: false });
    } else return openUriAtRevision(change.uri, change.ref);

  } else if (selectedView instanceof HunkView) {
    return visitHunk(selectedView, activePosition, worktree);

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

  } else if (selectedView instanceof IssueItemView) {
    const issue = selectedView.issue;
    const uri = IssueView.encodeLocation(repository, issue);
    const issueView = ViewUtils.createOrUpdateView(repository, uri, () => new IssueView(uri, issue));
    return ViewUtils.showView(uri, issueView);

  } else if (selectedView instanceof PullRequestItemView) {
    const pullRequest = selectedView.pullRequest;
    const uri = PullRequestView.encodeLocation(repository, pullRequest);
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
  const hash = await gitRun(repository.gitRepository, ['rev-parse', ref]);

  return await openUriAtRevision(window.activeTextEditor.document.uri, { type: RefType.Head, commit: hash.stdout.trimEnd() });
}

export async function openUriAtRevision(uri: Uri, ref: Ref, selection?: Range) {
  uri = uri.with({
    scheme: Constants.MagitHistoryUriScheme, authority: ref.commit!,
    query: `{"ref": ${ref.commit!}}`
  });
  return await window.showTextDocument(uri, { viewColumn: ViewUtils.showDocumentColumn(), preview: false, selection: selection });
}

async function visitHunk(selectedView: HunkView, activePosition?: Position, worktree: boolean = false) {

  const changeHunk = selectedView.changeHunk;
  const ref = selectedView.ref;

  let relevantSelection: Selection | undefined = undefined;
  try {
    const startLineMatches = changeHunk.diff.match(/(?<=\+)\d+(?=,)/g);

    if (startLineMatches?.length) {

      const diffStartLineInFile = Number.parseInt(startLineMatches[0].toString()) - 1; // -1 to translate to zero-based line numbering

      let activeLineRelativeToDiff = 0;
      let relevantCharacterSelection = 0;
      if (activePosition && activePosition.line > selectedView.range.start.line) {

        activeLineRelativeToDiff = activePosition.line - (selectedView.range.start.line + 1); // +1 to get past line denoting start line of diff hunk
        relevantCharacterSelection = activePosition.character > 0 ? activePosition.character - 1 : activePosition.character;

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
    await window.showTextDocument(changeHunk.uri, { viewColumn: ViewUtils.showDocumentColumn(), preview: false, selection: relevantSelection});
  } else {
    await openUriAtRevision(changeHunk.uri, ref, relevantSelection);
  }

}

export function getRepoUri(repo: Repository, file: string) {
  const absolutePath = path.isAbsolute(file) ? file : path.join(repo.rootUri.fsPath, file);
  return Uri.file(absolutePath);
}

export async function getRef(magitState: MagitRepository, ref?: string) {
  const repo = magitState.gitRepository;
  ref = ref ?? magitState.HEAD?.name;
  if (!ref) {
    throw new Error('No ref to get');
  }
  const commit = await getCommit(repo, ref); // Todo: parse this too
  let diff = (await gitRun(repo, ['show', '--format=', commit.hash])).stdout;
  let magitChanges: MagitChange[] = diffToMagitChanges(diff, repo.rootUri, { commit: ref, type: RefType.Head });
  return { commit, changes: magitChanges };
}

export async function visitCommit(magitState: MagitRepository, commitHash: string) {

  // fixme: abstract
  const refs = magitState.remotes.reduce(
    (prev, remote) => remote.branches.concat(prev),
    magitState.branches.concat(magitState.tags)
  );

  const { commit, changes } = await getRef(magitState, commitHash);
  const parents = await Promise.all(commit.parents.map(p => getCommit(magitState.gitRepository, p)));

  const uri = CommitDetailView.encodeLocation(magitState, commit);
  const view = ViewUtils.createOrUpdateView(magitState, uri, () => new CommitDetailView(uri, commit, changes, parents, refs))
  return ViewUtils.showView(uri, view);
}