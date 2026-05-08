import { MagitRepository } from '../models/magitRepository';
import { MenuUtil, MenuState } from '../menu/menu';
import { gitRunInUri } from '../utils/gitRawRunner';
import MagitUtils from '../utils/magitUtils';
import { window } from 'vscode';
import { listWorktrees, Worktree } from '../utils/worktreeUtils';
import { PickMenuItem, PickMenuUtil } from '../menu/pickMenu';
import { magitStatusForPath } from './statusCommands';
import GitTextUtils from '../utils/gitTextUtils';

const worktreeMenu = {
  title: 'Worktree',
  commands: [
    { label: 'b', description: 'Create new worktree', action: createWorktree },
    { label: 'c', description: 'Create new branch and worktree', action: createWorktreeAndBranch },
    { label: 'l', description: 'List worktrees', action: listAndOpenWorktree },
    // { label: 'k', description: 'Delete worktree', action: deleteWorktree }
  ]
};

export async function worktree(repository: MagitRepository) {

  return MenuUtil.showMenu(worktreeMenu, { repository });
}

async function createWorktree({ repository }: MenuState) {

  const ref = await MagitUtils.chooseRef(repository, 'Checkout ');

  if (ref) {
    const worktreePath = await window.showInputBox({ value: repository.uri.fsPath, prompt: 'Create worktree' });

    if (worktreePath) {
      const args = ['worktree', 'add', worktreePath, ref];
      return await gitRunInUri(repository.uri, args);
    }
  }
}

async function createWorktreeAndBranch({ repository }: MenuState) {

  const worktreePath = await window.showInputBox({ value: repository.uri.fsPath, prompt: 'Create worktree' });

  if (worktreePath) {

    const ref = await MagitUtils.chooseRef(repository, 'Create and checkout branch starting at');

    if (ref) {

      const branchName = await window.showInputBox({ prompt: 'Name for new branch' });

      if (branchName) {
        const args = ['worktree', 'add', '-b', branchName, worktreePath, ref];
        return await gitRunInUri(repository.uri, args);
      }
    }
  }
}

async function listAndOpenWorktree({ repository }: MenuState) {

  const worktrees = await listWorktrees(repository.uri);
  if (worktrees.length === 0) return;

  const items: PickMenuItem<Worktree>[] = worktrees.map(wt => ({
    label: wt.path.fsPath,
    description: worktreeDescription(wt),
    meta: wt,
  }));

  const chosen = await PickMenuUtil.showMenu(items, 'Open worktree status');
  if (!chosen || chosen.bare) return;

  return magitStatusForPath(chosen.path);
}

function worktreeDescription(wt: Worktree): string {
  if (wt.bare) return 'bare';
  const parts: string[] = [];
  if (wt.branch) parts.push(wt.branch);
  else if (wt.detached) parts.push('(detached)');
  if (wt.head) parts.push(GitTextUtils.shortHash(wt.head));
  if (wt.locked !== undefined) parts.push(wt.locked ? `locked: ${wt.locked}` : 'locked');
  if (wt.prunable !== undefined) parts.push('prunable');
  return parts.join(' · ');
}
