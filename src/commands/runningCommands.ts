import { MagitRepository } from '../models/magitRepository';
import { MenuUtil, MenuState } from '../menu/menu';
import { window, workspace, Uri } from 'vscode';
import { gitRun, LogLevel } from '../utils/gitRawRunner';
import * as ProcessCommands from './processCommands';
import { SpawnOptions } from '../utils/commandRunner/command';

const runningMenu = {
  title: 'Running',
  commands: [
    {
      label: '!', description: 'Git subcommand (in topdir)', action: async ({ repository }: MenuState) => {
        const repo = await repository;
        if (repo) run(repo);
      }
    },
    {
      label: 'p', description: 'Git subcommand (in pwd)', action: async ({ repository }: MenuState) => {
        const repo = await repository;
        if (repo) run(repo, workspace.getWorkspaceFolder(repo.uri)?.uri);
      }
    }
  ]
};

export async function running(repository: Thenable<MagitRepository | undefined>) {
  return MenuUtil.showMenu(runningMenu, { repository });
}

async function run(repository: MagitRepository, directory?: Uri) {

  const userCommand = await window.showInputBox({ value: 'git ' });

  let spawnOptions: SpawnOptions = {};

  if (directory) {
    spawnOptions.cwd = directory.fsPath;
  }

  if (userCommand) {
    const args = userCommand.replace('git ', '').split(' ');
    await gitRun(repository.gitRepository, args, spawnOptions, LogLevel.Detailed);

    await ProcessCommands.processView(repository);

    return;
  }
}