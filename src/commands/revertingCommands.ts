import { gitRun } from '../utils/gitRawRunner';
import { MagitRepository } from '../models/magitRepository';
import { MenuState, MenuUtil } from '../menu/menu';
import MagitUtils from '../utils/magitUtils';
import * as Commit from '../commands/commitCommands';

const whileRevertingMenu = {
  title: 'Reverting',
  commands: [
    { label: 'V', description: 'Continue', action: continueRevert },
    { label: 's', description: 'Skip', action: (state: MenuState) => revertControlCommand(state, '--skip') },
    { label: 'a', description: 'Abort', action: (state: MenuState) => revertControlCommand(state, '--abort') }
  ]
};

const revertingMenu = {
  title: 'Reverting',
  commands: [
    { label: 'V', description: 'Revert commit(s)', action: revertCommit },
    { label: 'v', description: 'Revert changes', action: reverseSomeCommit },
  ]
};

export async function reverting(repository: Thenable<MagitRepository | undefined>) {
  const repo = await repository;
  if (!repo) return;


  if (repo.revertingState) {
    return MenuUtil.showMenu(whileRevertingMenu, { repository });
  } else {

    const switches = [
      { key: '-e', name: '--edit', description: 'Edit commit message', activated: true },
      { key: '-E', name: '--no-edit', description: 'Don\'t edit commit message' },
    ];

    return MenuUtil.showMenu(revertingMenu, { repository, switches });
  }
}

async function revertCommit({ repository, switches }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const target = await MagitUtils.chooseRef(repo, 'Revert commit(s)', true, true);

  if (target) {
    return revert(repo, target, { edit: switches?.find(s => s.key === '-e' && s.activated) ? true : false });
  }
}

async function reverseSomeCommit({ repository }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const commit = await MagitUtils.chooseRef(repo, 'Revert changes', true, true);

  if (commit) {
    return revert(repo, commit, { noCommit: true });
  }
}

interface RevertOptions {
  noCommit?: boolean;
  edit?: boolean;
}

export async function revert(repository: MagitRepository, target: string, { noCommit, edit }: RevertOptions = {}) {

  const args = ['revert'];

  if (noCommit) {
    args.push('--no-commit');
  }

  if (edit) {
    args.push('--edit');
    args.push(target);
    return Commit.runCommitLikeCommand(repository, args, { updatePostCommitTask: true });
  }

  args.push('--no-edit');
  args.push(target);
  return gitRun(repository.gitRepository, args);
}

async function continueRevert({ repository }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const args = ['revert', '--continue'];
  return Commit.runCommitLikeCommand(repo, args);
}

async function revertControlCommand({ repository }: MenuState, command: string) {
  const repo = await repository;
  if (!repo) return;

  const args = ['revert', command];
  return gitRun(repo.gitRepository, args);
}