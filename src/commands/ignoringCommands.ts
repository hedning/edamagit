import { MagitRepository } from '../models/magitRepository';
import { MenuUtil, MenuState } from '../menu/menu';
import { PickMenuUtil, PickMenuItem } from '../menu/pickMenu';
import FilePathUtils from '../utils/filePathUtils';
import * as fs from 'fs';
import { window } from 'vscode';
import { EOL } from 'os';
import * as Constants from '../common/constants';

const ignoringMenu = {
  title: 'Ignoring',
  commands: [
    { label: 'l', description: 'Ignore locally', action: ({ repository }: MenuState) => ignore(repository) },
    { label: 'g', description: 'Ignore globally (add to .gitignore)', action: ({ repository }: MenuState) => ignore(repository, true) }
  ]
};

export async function ignoring(repository: Thenable<MagitRepository | undefined>) {
  return MenuUtil.showMenu(ignoringMenu, { repository });
}

async function ignore(repository: Thenable<MagitRepository | undefined>, globally = false) {
  const repo = await repository;
  if (!repo) return;

  const ignoreSuggestions: PickMenuItem<string>[] = [];

  repo.untrackedFiles.forEach(change => {
    const fileName = FilePathUtils.fileName(change.originalUri);
    const fileExtension = FilePathUtils.fileExtension(fileName);

    const globPattern1 = `/*.${fileExtension}`;
    const globPattern2 = `*.${fileExtension}`;

    ignoreSuggestions.push({ label: fileName, meta: fileName });
    ignoreSuggestions.push({ label: globPattern1, meta: globPattern1 });
    ignoreSuggestions.push({ label: globPattern2, meta: globPattern2 });
  });

  const ignorePattern = await PickMenuUtil.showMenuWithFreeform(ignoreSuggestions, `File or pattern to ignore ${globally ? 'globally' : 'locally'}`);

  if (ignorePattern) {

    let gitIgnoreFilePath: string;

    if (globally) {
      gitIgnoreFilePath = repo.uri.fsPath + '/.gitignore';
    } else {
      gitIgnoreFilePath = repo.uri.fsPath + '/.git/info/exclude';
    }

    return new Promise<void>((resolve, reject) => {
      fs.appendFile(gitIgnoreFilePath, EOL + ignorePattern, (err) => {
        if (err) {
          reject(err);
          return;
        }
        window.setStatusBarMessage(`Wrote file ${gitIgnoreFilePath}`, Constants.StatusMessageDisplayTimeout);
        resolve();
      });
    });
  }
}