import { window, workspace, TextEditorRevealType, Range, Position, Selection, commands, Uri } from 'vscode';
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
import { Change, Repository, Status } from '../typings/git';
import path = require('path');
import { ca } from 'date-fns/locale';

export async function magitVisitAtPoint(repository: MagitRepository, currentView: DocumentView) {

  const activePosition = window.activeTextEditor?.selection.active;

  if (!activePosition) {
    return;
  }

  const selectedView = currentView.click(activePosition);

  if (selectedView instanceof ChangeView) {

    const change = (selectedView as ChangeView).change;

    if (change.hunks?.length) {
      return visitHunk(selectedView.subViews.find(v => v instanceof HunkView) as HunkView);
    } else {

      // Check if change path is a directory. Reveal directories in file explorer
      if (change.relativePath?.endsWith(sep)) {
        return commands.executeCommand('revealInExplorer', change.uri);
      } else {
        return workspace.openTextDocument(change.uri).then(doc => window.showTextDocument(doc, { viewColumn: ViewUtils.showDocumentColumn(), preview: false }));
      }
    }
  }
  else if (selectedView instanceof HunkView) {

    return visitHunk(selectedView, activePosition);

  } else if (selectedView instanceof CommitItemView) {

    const commit: MagitCommit = (selectedView as CommitItemView).commit;
    return visitCommit(repository, commit.hash);

  } else if (selectedView instanceof BranchListingView ||
    selectedView instanceof RemoteBranchListingView ||
    selectedView instanceof TagListingView) {

    const commit = (selectedView as BranchListingView).ref.commit;
    return visitCommit(repository, commit!);

  } else if (selectedView instanceof StashItemView) {

    const stash = (selectedView as StashItemView).stash;
    return Diffing.showStashDetail(repository, stash);


  } else if (selectedView instanceof IssueItemView) {

    const issue = (selectedView as IssueItemView).issue;
    const uri = IssueView.encodeLocation(repository, issue);
    let issueView = ViewUtils.createOrUpdateView(repository, uri, () => new IssueView(uri, issue));

    return ViewUtils.showView(uri, issueView);

  } else if (selectedView instanceof PullRequestItemView) {

    const pullRequest = (selectedView as PullRequestItemView).pullRequest;
    const uri = PullRequestView.encodeLocation(repository, pullRequest);
    let pullRequestView = ViewUtils.createOrUpdateView(repository, uri, () => new PullRequestView(uri, pullRequest));

    return ViewUtils.showView(uri, pullRequestView);

  } else if (selectedView instanceof ErrorMessageView) {
    return processView(repository);
  } else {
    window.setStatusBarMessage('There is no thing at point that could be visited', Constants.StatusMessageDisplayTimeout);
  }
}

async function visitHunk(selectedView: HunkView, activePosition?: Position) {

  const changeHunk = selectedView.changeHunk;

  const doc = await workspace.openTextDocument(changeHunk.uri);
  const editor = await window.showTextDocument(doc, { viewColumn: ViewUtils.showDocumentColumn(), preview: false });

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

      let relevantSelection = new Selection(relevantPositionInFile, relevantPositionInFile);

      editor.revealRange(new Range(relevantPositionInFile, relevantPositionInFile), TextEditorRevealType.InCenterIfOutsideViewport);
      editor.selection = relevantSelection;
    }
  } catch { }
}

function getRepoUri(repo: Repository, file: string) {
  const absolutePath = path.isAbsolute(file) ? file : path.join(repo.rootUri.fsPath, file);
  return Uri.file(absolutePath);
}

function parseNameStatus(repo: Repository, entries: string[]): Change[] {
  let index = 0;
  const result: Change[] = [];
  while (index < entries.length - 1) {
    entriesLoop:
    while (index < entries.length - 1) {
      const change = entries[index++];
      const resourcePath = entries[index++];
      if (!change || !resourcePath) {
        break;
      }

      const originalUri = getRepoUri(repo, resourcePath);
      let status: Status = Status.UNTRACKED;

      // Copy or Rename status comes with a number, e.g. 'R100'. We don't need the number, so we use only first character of the status.
      switch (change[0]) {
        case 'M':
          status = Status.MODIFIED;
          break;

        case 'A':
          status = Status.INDEX_ADDED;
          break;

        case 'D':
          status = Status.DELETED;
          break;

        // Rename contains two paths, the second one is what the file is renamed/copied to.
        case 'R': {
          if (index >= entries.length) {
            break;
          }

          const newPath = entries[index++];
          if (!newPath) {
            break;
          }

          const uri = getRepoUri(repo, newPath);
          result.push({
            uri,
            renameUri: uri,
            originalUri,
            status: Status.INDEX_RENAMED
          });

          continue;
        }
        default:
          // Unknown status
          break entriesLoop;
      }

      result.push({
        status,
        originalUri,
        uri: originalUri,
        renameUri: originalUri,
      });
    }
  }
  return result;
}

export async function getRef(magitState: MagitRepository, ref?: string) {
  const repo = magitState.gitRepository;
  ref = ref ?? magitState.HEAD?.name;
  if (!ref) {
    throw new Error('No ref to get');
  }
  const commit = await getCommit(repo, ref);
  // We're only interested in the file status, not the sha/message
  const res = await gitRun(repo, ['show', '-z', '--name-status', '--format=', commit.hash]);

  const changes = parseNameStatus(repo, res.stdout.split('\x00'));
  const magitChanges = await Promise.all(changes
    .map(async change => {
      const ret = await gitRun(repo, ['show', '--format=', commit.hash, '--', change.uri.fsPath]);
      return toMagitChange(repo, change, ret.stdout);
    }));

    return {commit, changes: magitChanges};
}

export async function visitCommit(magitState: MagitRepository, commitHash: string) {

  // fixme: abstract
  const refs = magitState.remotes.reduce(
    (prev, remote) => remote.branches.concat(prev),
    magitState.branches.concat(magitState.tags)
  );

  const {commit, changes} = await getRef(magitState, commitHash);
  const parents = await Promise.all(commit.parents.map(p => getCommit(magitState.gitRepository, p)));

  const uri = CommitDetailView.encodeLocation(magitState, commit.hash);
  return ViewUtils.showView(uri, new CommitDetailView(uri, commit, changes, parents));
}