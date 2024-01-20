import { MagitRepository } from '../models/magitRepository';
import { MenuUtil, MenuState } from '../menu/menu';
import { commands, window } from 'vscode';
import { gitRun } from '../utils/gitRawRunner';

const remotingMenu = {
  title: 'Remoting',
  commands: [
    { label: 'a', description: 'Add', action: addRemote },
    { label: 'r', description: 'Rename', action: renameRemote },
    { label: 'k', description: 'Remove', action: removeRemote }
  ]
};

export async function remoting(repository: Thenable<MagitRepository | undefined>) {
  return MenuUtil.showMenu(remotingMenu, { repository });
}

async function addRemote() {
  return commands.executeCommand('git.addRemote');
}

async function renameRemote({ repository }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const remote = await window.showQuickPick(repo.remotes.map(r => r.name), { placeHolder: 'Rename remote' });

  if (remote) {

    const newName = await window.showInputBox({ prompt: `Rename ${remote} to` });

    if (newName) {
      const args = ['remote', 'rename', remote, newName];
      gitRun(repo.gitRepository, args);
    }
  }
}

async function removeRemote() {
  return commands.executeCommand('git.removeRemote');
}