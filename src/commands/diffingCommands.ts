import { Uri, window } from 'vscode';
import { MagitRepository } from '../models/magitRepository';
import { Diff, DiffSpec } from '../views/diffView';
import { MenuUtil, MenuState } from '../menu/menu';
import { PickMenuUtil, PickMenuItem } from '../menu/pickMenu';
import { StashDetail } from '../views/stashDetailView';
import MagitUtils from '../utils/magitUtils';
import { SectionDiff } from '../views/sectionDiffView';
import * as VisitAtPoint from './visitAtPointCommands';
import { Section } from '../views/general/sectionHeader';
import { Stash } from '../models/stash';
import ViewUtils from '../utils/viewUtils';

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
    return openDiff(repository, { kind: 'range', rev: range });
  }
}

async function diffPaths({ repository }: MenuState) {
  const fileA = await window.showInputBox({ prompt: 'First file', value: repository.uri.fsPath });

  if (fileA) {

    const fileB = await window.showInputBox({ prompt: 'Second file', value: repository.uri.fsPath });

    if (fileB) {
      return openDiff(repository, { kind: 'paths', a: fileA, b: fileB });
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
  return openDiff(repository, { kind: 'range', rev: 'HEAD' });
}

async function openDiff(repository: MagitRepository, spec: DiffSpec) {
  const view = await ViewUtils.buildOrUpdate(repository, Diff, spec);
  if (view) return ViewUtils.showView(view.uri, view);
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
  const view = await ViewUtils.buildOrUpdate(repository, StashDetail, stash);
  if (view) return ViewUtils.showView(view.uri, view);
}

async function showCommit({ repository }: MenuState) {

  const ref = await MagitUtils.chooseRef(repository, 'Show commit', true, true);

  if (ref) {
    return VisitAtPoint.visitCommit(repository, ref);
  }
}

export async function diffFile(repository: MagitRepository, fileUri: Uri, index = false) {
  return openDiff(repository, { kind: 'file', path: fileUri.fsPath, cached: index });
}
