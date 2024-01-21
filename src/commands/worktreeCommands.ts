import { MagitRepository } from '../models/magitRepository';
import { MenuUtil, MenuState, Menu } from '../menu/menu';
import { gitRun } from '../utils/gitRawRunner';
import MagitUtils from '../utils/magitUtils';
import { window } from 'vscode';

const worktreeMenu: Menu = {
  title: 'Worktree',
  commands: [
    { label: 'b', description: 'Create new worktree', action: createWorktree },
    { label: 'c', description: 'Create new branch and worktree', action: createWorktreeAndBranch },
    // { label: 'k', description: 'Delete worktree', action: deleteWorktree }
  ]
};

export async function worktree(repository: Thenable<MagitRepository | undefined>) {
  return MenuUtil.showMenu(worktreeMenu, { repository });
}

async function createWorktree({ repository }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const ref = await MagitUtils.chooseRef(repo, 'Checkout ');

  if (ref) {
    const worktreePath = await window.showInputBox({ value: repo.uri.fsPath, prompt: 'Create worktree' });

    if (worktreePath) {
      const args = ['worktree', 'add', worktreePath, ref];
      return await gitRun(repo.gitRepository, args);
    }
  }
}

async function createWorktreeAndBranch({ repository }: MenuState) {
  const repo = await repository;
  if (!repo) return;


  const worktreePath = await window.showInputBox({ value: repo.uri.fsPath, prompt: 'Create worktree' });

  if (worktreePath) {

    const ref = await MagitUtils.chooseRef(repo, 'Create and checkout branch starting at');

    if (ref) {

      const branchName = await window.showInputBox({ prompt: 'Name for new branch' });

      if (branchName) {
        const args = ['worktree', 'add', '-b', branchName, worktreePath, ref];
        return await gitRun(repo.gitRepository, args);
      }
    }
  }
}
