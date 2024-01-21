import { gitRun } from '../utils/gitRawRunner';
import { MagitRepository } from '../models/magitRepository';
import { Menu, MenuState, MenuUtil } from '../menu/menu';
import MagitUtils from '../utils/magitUtils';
import * as CommitCommands from '../commands/commitCommands';

const whileCherryPickingMenu: Menu = {
  title: 'Cherry-picking',
  commands: [
    { label: 'A', description: 'Continue', action: continueCherryPick },
    { label: 's', description: 'Skip', action: (state: MenuState) => cherryPickControlCommand(state, '--skip') },
    { label: 'a', description: 'Abort', action: (state: MenuState) => cherryPickControlCommand(state, '--abort') }
  ]
};

const cherryPickingMenu: Menu = {
  title: 'Cherry-picking',
  commands: [
    { label: 'A', description: 'Pick', action: pick },
    { label: 'a', description: 'Apply', action: applySomeCommit },
    // { label: 'h', description: 'Harvest', action: checkout },
    // { label: 'd', description: 'Donate', action: checkout },
    // { label: 'n', description: 'Spinout', action: checkout },
    // { label: 's', description: 'Spinoff', action: checkout },
  ]
};

export async function cherryPicking(repository: Thenable<MagitRepository | undefined>) {
  const repo = await repository;
  if (!repo) return;

  if (repo.cherryPickingState) {
    return MenuUtil.showMenu(whileCherryPickingMenu, { repository });
  } else {
    const switches = [
      { key: '-e', name: '--edit', description: 'Edit commit messages' },
      { key: '-x', name: '-x', description: 'Reference cherry in commit message' },
    ];

    return MenuUtil.showMenu(cherryPickingMenu, { repository, switches });
  }
}

async function pick({ repository, switches }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const target = await MagitUtils.chooseRef(repo, 'Cherry-pick');

  if (target) {
    return cherryPick(repo, target, { edit: switches?.find(s => s.key === '-e' && s.activated) ? true : false });
  }
}

async function applySomeCommit({ repository }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const commit = await MagitUtils.chooseRef(repo, 'Apply changes from commit');

  if (commit) {
    return cherryPick(repo, commit, { noCommit: true });
  }
}

interface CherryPickOptions {
  noCommit?: boolean;
  edit?: boolean;
}

export async function cherryPick(repository: MagitRepository, target: string, { noCommit, edit }: CherryPickOptions = {}) {

  const args = ['cherry-pick'];

  if (noCommit) {
    args.push('--no-commit');
  } else if (edit) {
    args.push('--edit');
    args.push(target);
    return CommitCommands.runCommitLikeCommand(repository, args, { updatePostCommitTask: true });
  } else {
    args.push('--ff');
  }

  args.push(target);
  return gitRun(repository.gitRepository, args);
}

async function continueCherryPick({ repository }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const args = ['cherry-pick', '--continue'];
  return CommitCommands.runCommitLikeCommand(repo, args);
}

async function cherryPickControlCommand({ repository }: MenuState, command: string) {
  const repo = await repository;
  if (!repo) return;

  const args = ['cherry-pick', command];
  return gitRun(repo.gitRepository, args);
}
