import { MenuState, MenuUtil, Switch } from '../menu/menu';
import { MagitRepository } from '../models/magitRepository';
import { gitRun } from '../utils/gitRawRunner';
import MagitUtils from '../utils/magitUtils';
import { MagitError } from '../models/magitError';
import * as Commit from '../commands/commitCommands';

const whileRebasingMenu = {
  title: 'Rebasing',
  commands: [
    { label: 'r', description: 'Continue', action: (state: MenuState) => rebaseContinue(state) },
    { label: 's', description: 'Skip', action: (state: MenuState) => rebaseControlCommand(state, '--skip') },
    { label: 'e', description: 'Edit', action: editTodo },
    { label: 'a', description: 'Abort', action: (state: MenuState) => rebaseControlCommand(state, '--abort') }
  ]
};

export async function rebasing(repository: Thenable<MagitRepository | undefined>) {
  const repo = await repository;
  if (!repo) return;


  if (repo.rebasingState) return MenuUtil.showMenu(whileRebasingMenu, { repository });

  const switches = [
    { key: '-k', name: '--keep-empty', description: 'Keep empty commits' },
    { key: '-p', name: '--rebase-merges', description: 'Rebase merges' },
    { key: '-c', name: '--committer-date-is-author-date', description: 'Lie about committer date' },
    { key: '-a', name: '--autosquash', description: 'Autosquash' },
    { key: '-A', name: '--autostash', description: 'Autostash' },
    { key: '-i', name: '--interactive', description: 'Interactive' },
    { key: '-h', name: '--no-verify', description: 'Disable hooks' },
  ];

  const HEAD = repo.HEAD;

  const commands = [];

  if (HEAD?.pushRemote) {
    commands.push({
      label: 'p', description: `onto ${HEAD.pushRemote.remote}/${HEAD.pushRemote.name}`,
      action: ({ switches }: MenuState) => _rebase(repo, `${HEAD.pushRemote!.remote}/${HEAD.pushRemote!.name}`, switches)
    });
  }

  if (HEAD?.upstreamRemote) {
    commands.push({
      label: 'u', description: `onto ${HEAD.upstreamRemote.remote}/${HEAD.upstreamRemote.name}`,
      action: ({ switches }: MenuState) => _rebase(repo, `${HEAD.upstreamRemote!.remote}/${HEAD.upstreamRemote!.name}`, switches)
    });
  }

  commands.push(...[
    { label: 'e', description: `onto elsewhere`, action: rebase },
    { label: 'i', description: `interactively`, action: rebaseInteractively }
  ]);

  const rebasingMenu = {
    title: `Rebasing ${HEAD?.name}`,
    commands
  };

  return MenuUtil.showMenu(rebasingMenu, { repository, switches });
}

async function rebase({ repository, switches }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const ref = await MagitUtils.chooseRef(repo, 'Rebase');

  if (ref) {
    return _rebase(repo, ref, switches);
  }
}

async function _rebase(repository: MagitRepository, ref: string, switches: Switch[] = []) {

  const args = ['rebase', ...MenuUtil.switchesToArgs(switches), ref];

  try {

    if (switches.find(s => s.activated && s.name === '--interactive')) {
      return Commit.runCommitLikeCommand(repository, args, { editor: 'GIT_SEQUENCE_EDITOR' });
    }

    return await gitRun(repository.gitRepository, args);
  }
  catch (e) {
    throw new MagitError('Failed to merge in the changes.', e);
  }
}

async function rebaseControlCommand({ repository }: MenuState, command: string) {
  const repo = await repository;
  if (!repo) return;

  const args = ['rebase', command];
  return gitRun(repo.gitRepository, args);
}

async function rebaseContinue({ repository }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const args = ['rebase', '--continue'];
  return Commit.runCommitLikeCommand(repo, args, { editor: 'GIT_SEQUENCE_EDITOR' });
}

async function editTodo({ repository }: MenuState) {
  const repo = await repository;
  if (!repo) return;


  const args = ['rebase', '--edit-todo'];

  return Commit.runCommitLikeCommand(repo, args, { editor: 'GIT_SEQUENCE_EDITOR', propagateErrors: true });
}

async function rebaseInteractively({ repository, switches }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const commit = await MagitUtils.chooseCommit(repo, 'Rebase commit and all above it');

  if (commit) {
    const interactiveSwitches = (switches ?? []).map(s => ({ ...s, activated: s.activated || s.name === '--interactive' }));

    const args = ['rebase', ...MenuUtil.switchesToArgs(interactiveSwitches), `${commit}^`];

    return Commit.runCommitLikeCommand(repo, args, { editor: 'GIT_SEQUENCE_EDITOR' });
  }
}
