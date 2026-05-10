import { Uri, window } from 'vscode';
import { MagitRepository } from '../models/magitRepository';
import { gitRun, gitRunInUri } from '../utils/gitRawRunner';
import { Diff, DiffView } from '../views/diffView';
import { MenuUtil, MenuState } from '../menu/menu';
import { PickMenuUtil, PickMenuItem } from '../menu/pickMenu';
import { StashDetail, StashDetailView } from '../views/stashDetailView';
import MagitUtils from '../utils/magitUtils';
import { SectionDiff } from '../views/sectionDiffView';
import * as VisitAtPoint from './visitAtPointCommands';
import * as Constants from '../common/constants';
import { Section } from '../views/general/sectionHeader';
import { Status } from '../typings/git';
import { MagitChange } from '../models/magitChange';
import { Stash } from '../models/stash';
import ViewUtils from '../utils/viewUtils';
import { diffToMagitChanges } from '../utils/diffParser';

const diffingMenu = {
  title: 'Diffing',
  commands: [
    { label: 'r', description: 'Diff range', action: diffRange },
    { label: 'p', description: 'Diff paths', action: diffPaths },
    { label: 'u', description: 'Diff unstaged', action: diffUnstaged },
    { label: 's', description: 'Diff staged', action: diffStaged },
    { label: 'w', description: 'Diff worktree', action: diffWorktree },
    { label: 'c', description: 'Show commit', action: showCommit },
    { label: 't', description: 'Show stash', action: showStash },
  ]
};

export async function diffing(repository: MagitRepository) {

  // const switches = [
  // { key: '-f', name: '--function-context', description: 'Show surrounding functions' },
  // { key: '-b', name: '--ignore-space-change', description: 'Ignore whitespace changes' },
  // { key: '-w', name: '--ignore-all-space', description: 'Ignore all whitespace' },
  // { key: '-x', name: '--no-ext-diff', description: 'Disallow external diff drivers', activated: true },
  // { key: '-s', name: '--stat', description: 'Show stats', activated: true },
  // ];

  return MenuUtil.showMenu(diffingMenu, { repository });
}

async function diffRange({ repository }: MenuState) {

  let range = await window.showInputBox({
    prompt: `Diff for range (${repository.HEAD?.name})`,
    value: MagitUtils.getCursorCommitHash()?.meta,
  });

  if (!range) {
    range = repository.HEAD?.name;
  }

  if (range) {
    const args = [range];
    return diff(repository, range, args);
  }
}

async function diffPaths({ repository }: MenuState) {
  const fileA = await window.showInputBox({ prompt: 'First file', value: repository.uri.fsPath });

  if (fileA) {

    const fileB = await window.showInputBox({ prompt: 'Second file', value: repository.uri.fsPath });

    if (fileB) {
      return diff(repository, 'files', ['--no-index', fileA, fileB]);
    }
  }
}

async function diffStaged({ repository }: MenuState) {
  return showDiffSection(repository, Section.Staged);
}

async function diffUnstaged({ repository }: MenuState) {
  return showDiffSection(repository, Section.Unstaged);
}
async function diffWorktree({ repository }: MenuState) {
  return diff(repository, 'worktree', ['HEAD']);
}

async function diff(repository: MagitRepository, id: string, args: string[] = []) {
  const diffResult = await gitRunInUri(repository.uri, ['diff', ...args]);
  const magitChanges = diffToMagitChanges(diffResult.stdout, repository.uri);

  const uri = Diff.buildUri(repository, id);

  return ViewUtils.showView(uri, new DiffView(uri, magitChanges));
}

export async function showDiffSection(repository: MagitRepository, section: Section, preserveFocus = false) {
  if (section !== Section.Staged && section !== Section.Unstaged) return;
  const view = await ViewUtils.buildOrUpdate(repository, SectionDiff, section);
  if (view) return ViewUtils.showView(view.uri, view, { preserveFocus });
}

async function showStash({ repository }: MenuState) {

  const stashesPicker: PickMenuItem<Stash>[] = repository.stashes.map(stash => ({ label: `stash@{${stash.index}}`, meta: stash })) ?? [];
  const chosenStash = await PickMenuUtil.showMenu(stashesPicker);

  if (chosenStash) {
    return showStashDetail(repository, chosenStash);
  }
}

export async function showStashDetail(repository: MagitRepository, stash: Stash) {
  const uri = StashDetail.buildUri(repository, stash);

  const ref = `refs/stash@{${stash.index}}`;
  const { commit, changes: unstaged } = await VisitAtPoint.getRef(repository, ref);
  const { changes: staged } = await VisitAtPoint.getRef(repository, commit.parents[1]);

  let stashUntrackedFiles: MagitChange[] = [];
  if (commit.parents.length === 3) {
    let { changes: untracked } = await VisitAtPoint.getRef(repository, commit.parents[2]);

    stashUntrackedFiles = untracked.map(c => ({
      ...c,
      status: Status.UNTRACKED,
      section: Section.Untracked
    }));
  }

  return ViewUtils.showView(uri, new StashDetailView(uri, stash, unstaged, staged, stashUntrackedFiles));
}

async function showCommit({ repository }: MenuState) {

  const ref = await MagitUtils.chooseRef(repository, 'Show commit', true, true);

  if (ref) {
    return VisitAtPoint.visitCommit(repository, ref);
  }
}

export async function diffFile(repository: MagitRepository, fileUri: Uri, index = false) {

  const args = ['diff'];
  if (index) {
    args.push('--cached');
  }

  args.push(fileUri.fsPath);

  const diffResult = await gitRunInUri(repository.uri, args);
  const magitChanges = diffToMagitChanges(diffResult.stdout, repository.uri);

  const uri = Diff.buildUri(repository, fileUri.path);
  return ViewUtils.showView(uri, new DiffView(uri, magitChanges));
}
