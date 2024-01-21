import { MagitRepository } from '../models/magitRepository';
import { MenuUtil, MenuState, Menu } from '../menu/menu';
import { gitRun } from '../utils/gitRawRunner';
import { window } from 'vscode';
import * as Fetching from './fetchingCommands';
import SubmoduleListView from '../views/submoduleListView';
import ViewUtils from '../utils/viewUtils';

const submodulesMenu: Menu = {
  title: 'Submodules',
  commands: [
    { label: 'a', description: 'Add', action: add },
    { label: 'r', description: 'Register', action: init },
    { label: 'p', description: 'Populate', action: populate },
    { label: 'u', description: 'Update', action: update },
    { label: 's', description: 'Synchronize', action: sync },
    { label: 'd', description: 'Unpopulate', action: unpopulate },
    { label: 'k', description: 'Remove', action: remove },
    { label: 'l', description: 'List all modules', action: listAll },
    { label: 'f', description: 'Fetch all modules', action: fetchAll },
  ]
};

export async function submodules(repository: Thenable<MagitRepository | undefined>) {

  const switches = [
    { key: '-f', name: '--force', description: 'Force' },
    { key: '-r', name: '--recursive', description: 'Recursive' },
    { key: '-N', name: '--no-fetch', description: 'Do not fetch' },
    { key: '-C', name: '--checkout', description: 'Checkout tip' },
    { key: '-R', name: '--rebase', description: 'Rebase onto tip' },
    { key: '-M', name: '--merge', description: 'Merge tip' },
    { key: '-U', name: '--remote', description: 'Use upstream tip' }
  ];

  return MenuUtil.showMenu(submodulesMenu, { repository, switches });
}

async function add({ repository, switches }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const submoduleRemote = await window.showInputBox({ prompt: `Add submodule (remote url)` });

  if (submoduleRemote) {

    const args = ['submodule', 'add', ...MenuUtil.switchesToArgs(switches), submoduleRemote];
    return await gitRun(repo.gitRepository, args);
  }
}

async function init({ repository, switches }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const submodule = await pickSubmodule(repo, 'Populate module');

  if (submodule) {
    const args = ['submodule', 'init', ...MenuUtil.switchesToArgs(switches), '--', submodule];
    return await gitRun(repo.gitRepository, args);
  }
}

async function populate({ repository, switches }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const submodule = await pickSubmodule(repo, 'Populate module');

  if (submodule) {
    const args = ['submodule', 'update', '--init', ...MenuUtil.switchesToArgs(switches), '--', submodule];
    return await gitRun(repo.gitRepository, args);
  }
}

async function update({ repository, switches }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const submodule = await pickSubmodule(repo, 'Update module');

  if (submodule) {
    const args = ['submodule', 'update', ...MenuUtil.switchesToArgs(switches), '--', submodule];
    return await gitRun(repo.gitRepository, args);
  }
}

async function sync({ repository, switches }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const submodule = await pickSubmodule(repo, 'Synchronize module');

  if (submodule) {
    const args = ['submodule', 'sync', ...MenuUtil.switchesToArgs(switches), '--', submodule];
    return await gitRun(repo.gitRepository, args);
  }
}

async function unpopulate({ repository, switches }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const submodule = await pickSubmodule(repo, 'Unpopulate module');

  if (submodule) {
    const args = ['submodule', 'deinit', ...MenuUtil.switchesToArgs(switches), '--', submodule];
    return await gitRun(repo.gitRepository, args);
  }
}

async function remove({ repository, switches }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const submodule = await pickSubmodule(repo, 'Remove module');

  if (submodule) {

    const absorbArgs = ['submodule', 'absorbgitdirs', '--', submodule];
    const deinitArgs = ['submodule', 'deinit', '--', submodule];
    const removeArgs = ['rm', '--', submodule];

    await gitRun(repo.gitRepository, absorbArgs);
    await gitRun(repo.gitRepository, deinitArgs);
    return await gitRun(repo.gitRepository, removeArgs);
  }
}

async function listAll({ repository, switches }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const uri = SubmoduleListView.encodeLocation(repo);

  let submoduleListView = ViewUtils.createOrUpdateView(repo, uri, () => new SubmoduleListView(uri, repo));

  return ViewUtils.showView(uri, submoduleListView);
}

function fetchAll({ repository, switches }: MenuState) {
  return Fetching.fetchSubmodules({ repository, switches });
}

async function pickSubmodule(repository: MagitRepository, prompt: string): Promise<string | undefined> {
  return await window.showQuickPick(repository.submodules.map(r => r.name), { placeHolder: prompt });
}