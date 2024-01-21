import { MagitRepository } from '../models/magitRepository';
import { MenuUtil, MenuState, Menu } from '../menu/menu';
import { gitRun } from '../utils/gitRawRunner';
import MagitUtils from '../utils/magitUtils';
import { window } from 'vscode';
import * as Commit from '../commands/commitCommands';

const taggingMenu: Menu = {
  title: 'Tagging',
  commands: [
    { label: 't', description: 'Create', action: createTag },
    { label: 'k', description: 'Delete', action: deleteTag },
    // { label: 'p', description: 'Prune', action: pruneTags }
  ]
};

export async function tagging(repository: Thenable<MagitRepository | undefined>) {

  const switches = [
    { key: '-a', name: '--annotate', description: 'Annotate' },
    { key: '-f', name: '--force', description: 'Force' },
    // { key: '-s', name: '--sign', description: 'Sign' }
  ];

  return MenuUtil.showMenu(taggingMenu, { repository, switches });
}

async function createTag({ repository, switches }: MenuState) {
  const repo = await repository;
  if (!repo) return;


  const tagName = await window.showInputBox({ prompt: 'Tag name' });

  if (tagName) {

    const ref = await MagitUtils.chooseRef(repo, 'Place tag on', true, true);

    if (ref) {

      const args = ['tag', ...MenuUtil.switchesToArgs(switches), tagName, ref];

      if (
        switches?.find(({ key, activated }) => key === '-a' && activated)
      ) {
        return Commit.runCommitLikeCommand(repo, args, {
          updatePostCommitTask: true,
        });
      }

      return await gitRun(repo.gitRepository, args);
    }
  }
}

async function deleteTag({ repository, switches }: MenuState) {
  const repo = await repository;
  if (!repo) return;

  const tagRef = await MagitUtils.chooseTag(repo, 'Delete tag');

  if (tagRef) {

    const args = ['tag', '-d', ...MenuUtil.switchesToArgs(switches), tagRef];

    return await gitRun(repo.gitRepository, args);
  }
}