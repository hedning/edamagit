import { Uri } from 'vscode';
import { MenuUtil, MenuState, Menu } from '../menu/menu';
import { MagitRepository } from '../models/magitRepository';
import * as Commit from './commitCommands';
import * as Staging from './stagingCommands';
import * as Blaming from './blamingCommands';
import * as Diffing from './diffingCommands';
import * as Logging from './loggingCommands';

const filePopupMenu: Menu = {
  title: 'File Actions',
  commands: [
    {
      label: 's', description: 'Stage', action: async ({ repository, data }: MenuState) => {
        const repo = await repository;
        if (!repo) return;

        Staging.stageFile(repo, data as Uri);
      }
    },
    {
      label: 'u', description: 'Unstage', action: async ({ repository, data }: MenuState) => {
        const repo = await repository;
        if (!repo) return;

        Staging.unstageFile(repo, data as Uri);
      }
    },
    { label: 'c', description: 'Commit', action: async ({ repository }: MenuState) => Commit.magitCommit(repository) },
    // { label: 'D', description: 'Diff...', action: () => { } },
    {
      label: 'd', description: 'Diff', action: async ({ repository, data }: MenuState) => {
        const repo = await repository;
        if (!repo) return;

        Diffing.diffFile(repo, data as Uri);
      }
    },
    // { label: 'L', description: 'Log...', action: () => { } },
    {
      label: 'l', description: 'log', action: async ({ repository, data }: MenuState) => {
        const repo = await repository;
        if (!repo) return;

        Logging.logFile(repo, data as Uri);
      }
    },
    // { label: 't', description: 'trace', action: () => { } },
    // { label: 'B', description: 'Blame...', action: () => { } },
    {
      label: 'b', description: 'Blame', action: async ({ repository, data }: MenuState) => {
        const repo = await repository;
        if (!repo) return;

        Blaming.blameFile(repo, data as Uri);
      }
    },
    // { label: 'n', description: 'prev blob', action: () => { } },
    // { label: 'n', description: 'next blob', action: () => { } }
  ]
};


export async function filePopup(repository: MagitRepository, fileUri: Uri) {
  const promise = new Promise<MagitRepository>((res, rej) => { res(repository); });
  return MenuUtil.showMenu(filePopupMenu, { repository: promise, data: fileUri });
}
