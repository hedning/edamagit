import { Menu, MenuState, MenuUtil } from '../menu/menu';
import { MagitRepository } from '../models/magitRepository';
import { gitRun } from '../utils/gitRawRunner';
import MagitUtils from '../utils/magitUtils';
import { window } from 'vscode';

const resettingMenu: Menu = {
  title: 'Resetting',
  commands: [
    { label: 'm', description: 'reset mixed (HEAD and index)', action: ({ repository }: MenuState) => resetMixed(repository) },
    {
      label: 's', description: 'reset soft (HEAD only)', action: async ({ repository }: MenuState) => {
        const repo = await repository;
        if (!repo) return;

        _reset(repository, ['--soft'], `Soft reset ${repo.HEAD?.name} to`);
      }
    },
    { label: 'h', description: 'reset hard (HEAD, index and files)', action: ({ repository }: MenuState) => resetHard(repository) },
    { label: 'i', description: 'reset index (only)', action: ({ repository }: MenuState) => _reset(repository, [], `Reset index to`) },
    { label: 'w', description: 'reset worktree (only)', action: resetWorktree }
    // { label: 'f', description: 'reset a file', action: resetFile }
  ]
};

export async function resetting(repository: Thenable<MagitRepository | undefined>) {
  return MenuUtil.showMenu(resettingMenu, { repository });
}

export async function resetMixed(repository: Thenable<MagitRepository | undefined>) {
  const repo = await repository;
  if (!repo) return;

  return _reset(repository, ['--mixed'], `Reset ${repo.HEAD?.name} to`);
}

export async function resetHard(repository: Thenable<MagitRepository | undefined>) {
  const repo = await repository;
  if (!repo) return;

  return _reset(repository, ['--hard'], `Hard reset ${repo.HEAD?.name} to`);
}

async function resetWorktree({ repository }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const ref = await window.showQuickPick([`${repo.HEAD?.name}`, 'HEAD'], { placeHolder: 'Reset worktree to' });

  if (ref) {
    const args = ['checkout-index', '--all', '--force'];
    return await gitRun(repo.gitRepository, args);
  }
}

async function _reset(repository: Thenable<MagitRepository | undefined>, switches: string[], prompt: string) {
  const repo = await repository;
  if (!repo) return;

  const ref = await MagitUtils.chooseRef(repo, prompt, true, true);

  if (ref) {

    const args = ['reset', ...switches, ref];
    return await gitRun(repo.gitRepository, args);
  }
}