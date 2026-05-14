import { Terminal, window } from 'vscode';
import { MagitRepository } from '../models/magitRepository';
import { MenuUtil, MenuState } from '../menu/menu';
import { PickMenuItem, PickMenuUtil } from '../menu/pickMenu';
import { formatTerminalEntry, terminalsForWorktree } from '../views/terminals/terminalsSectionView';
import { openTerminal } from './statusCommands';

const terminalMenu = {
  title: 'Terminal',
  commands: [
    { label: 'o', description: 'Open existing terminal', action: openExistingTerminal },
    { label: 'n', description: 'New terminal', action: ({ repository }: MenuState) => openTerminal(repository) },
    { label: 'k', description: 'Kill terminal', action: killTerminal },
  ]
};

export async function terminal(repository: MagitRepository) {
  return MenuUtil.showMenu(terminalMenu, { repository });
}

async function openExistingTerminal({ repository }: MenuState) {
  const chosen = await pickWorktreeTerminal(repository, 'Open terminal');
  return chosen?.show();
}

async function killTerminal({ repository }: MenuState) {
  const chosen = await pickWorktreeTerminal(repository, 'Kill terminal');
  chosen?.dispose();
}

async function pickWorktreeTerminal(repository: MagitRepository, placeholder: string): Promise<Terminal | undefined> {
  const terminals = terminalsForWorktree(repository.uri, repository.worktrees);
  if (terminals.length === 0) {
    window.showInformationMessage('No terminals for this worktree');
    return undefined;
  }
  const items: PickMenuItem<Terminal>[] = terminals.map(t => ({
    ...formatTerminalEntry(t, repository.uri),
    meta: t,
  }));
  return PickMenuUtil.showMenu(items, placeholder);
}
