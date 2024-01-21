import { Uri, window } from 'vscode';
import { MagitRepository } from '../models/magitRepository';
import { gitRun } from '../utils/gitRawRunner';
import { DiffView } from '../views/diffView';
import { MenuUtil, MenuState, Menu } from '../menu/menu';
import { PickMenuUtil, PickMenuItem } from '../menu/pickMenu';
import { StashDetailView } from '../views/stashDetailView';
import MagitUtils from '../utils/magitUtils';
import SectionDiffView from '../views/sectionDiffView';
import * as VisitAtPoint from './visitAtPointCommands';
import * as Constants from '../common/constants';
import { Section } from '../views/general/sectionHeader';
import { Status } from '../typings/git';
import { MagitChange } from '../models/magitChange';
import { Stash } from '../models/stash';
import ViewUtils from '../utils/viewUtils';
import { toMagitChange } from './statusCommands';

const diffingMenu: Menu = {
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

export async function diffing(repository: Thenable<MagitRepository | undefined>) {

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
  const repo = await repository;
  if (!repo) return;

  let range = await window.showInputBox({ prompt: `Diff for range (${repo.HEAD?.name})` });

  if (!range) {
    range = repo.HEAD?.name;
  }

  if (range) {
    const args = [range];
    return diff(repo, range, args);
  }
}

async function diffPaths({ repository }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const fileA = await window.showInputBox({ prompt: 'First file', value: repo.uri.fsPath });

  if (fileA) {

    const fileB = await window.showInputBox({ prompt: 'Second file', value: repo.uri.fsPath });

    if (fileB) {
      return diff(repo, 'files', ['--no-index', fileA, fileB]);
    }
  }
}

async function diffStaged({ repository }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  return showDiffSection(repo, Section.Staged);
}

async function diffUnstaged({ repository }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  return showDiffSection(repo, Section.Unstaged);
}
async function diffWorktree({ repository }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  return diff(repo, 'worktree', ['HEAD']);
}

async function diff(repository: MagitRepository, id: string, args: string[] = []) {
  const diffResult = await gitRun(repository.gitRepository, ['diff', ...args]);

  const uri = DiffView.encodeLocation(repository, id);
  return ViewUtils.showView(uri, new DiffView(uri, diffResult.stdout));
}

export async function showDiffSection(repository: MagitRepository, section: Section, preserveFocus = false) {
  const uri = SectionDiffView.encodeLocation(repository);
  return ViewUtils.showView(uri, new SectionDiffView(uri, repository, section), { preserveFocus });
}

async function showStash({ repository }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const stashesPicker: PickMenuItem<Stash>[] = repo.stashes.map(stash => ({ label: `stash@{${stash.index}}`, meta: stash })) ?? [];
  const chosenStash = await PickMenuUtil.showMenu(stashesPicker);

  if (chosenStash) {
    return showStashDetail(repo, chosenStash);
  }
}

export async function showStashDetail(repository: MagitRepository, stash: Stash) {
  const uri = StashDetailView.encodeLocation(repository, stash);

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
  const repo = await repository;
  if (!repo) return;

  const ref = await MagitUtils.chooseRef(repo, 'Show commit', true, true);

  if (ref) {
    return VisitAtPoint.visitCommit(repo, ref);
  }
}

export async function diffFile(repository: MagitRepository, fileUri: Uri, index = false) {

  const args = ['diff'];

  if (index) {
    args.push('--cached');
  }

  args.push(fileUri.fsPath);

  const diffResult = await gitRun(repository.gitRepository, args);

  const uri = DiffView.encodeLocation(repository, fileUri.path);
  return ViewUtils.showView(uri, new DiffView(uri, diffResult.stdout));
}
