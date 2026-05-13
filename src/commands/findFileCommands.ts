import * as path from 'path';
import { QuickPickItem, QuickPickItemKind, Uri, window } from 'vscode';
import { gitApi } from '../extension';
import { currentWorktree } from '../utils/currentWorktree';
import { listFiles, listWorktrees, Worktree, worktreeDescription } from '../utils/worktreeUtils';

interface FileQuickPickItem extends QuickPickItem {
  relPath?: string;
  switch?: true;
}

interface WorktreeQuickPickItem extends QuickPickItem {
  worktree: Worktree;
}

export async function findFile() {
  let worktreeRoot = currentWorktree()?.rootUri;
  if (!worktreeRoot) {
    window.showInformationMessage('No git repository found.');
    return;
  }

  let initialFilter = '';
  while (true) {
    const result = await pickFile(worktreeRoot, initialFilter);
    if (!result) return;

    if (result.kind === 'file') {
      const fileUri = Uri.joinPath(worktreeRoot, result.relPath);
      await window.showTextDocument(fileUri, { preview: false });
      return;
    }

    initialFilter = result.value;
    const next = await pickWorktree(worktreeRoot);
    if (!next) return;
    worktreeRoot = next;
  }
}

type PickFileResult =
  | { kind: 'file'; relPath: string }
  | { kind: 'switch'; value: string };

function pickFile(worktreeRoot: Uri, initialValue: string): Promise<PickFileResult | undefined> {
  return new Promise(resolve => {
    const quickPick = window.createQuickPick<FileQuickPickItem>();
    quickPick.title = `Find file · ${worktreeTitle(worktreeRoot)}`;
    quickPick.placeholder = 'Type to filter files in this worktree';
    quickPick.matchOnDescription = true;
    quickPick.value = initialValue;
    quickPick.busy = true;
    quickPick.items = [switchItem()];

    let resolveOnHide: PickFileResult | undefined;

    quickPick.onDidAccept(() => {
      const picked = quickPick.activeItems[0];
      if (!picked) return;
      if (picked.switch) {
        resolveOnHide = { kind: 'switch', value: quickPick.value };
      } else if (picked.relPath) {
        resolveOnHide = { kind: 'file', relPath: picked.relPath };
      }
      quickPick.hide();
    });

    quickPick.onDidHide(() => {
      quickPick.dispose();
      resolve(resolveOnHide);
    });

    quickPick.show();

    listFiles(worktreeRoot).then(
      relPaths => {
        quickPick.items = [
          switchItem(),
          { label: '', kind: QuickPickItemKind.Separator },
          ...relPaths.map(fileItem),
        ];
        quickPick.busy = false;
      },
      err => {
        quickPick.busy = false;
        window.showErrorMessage(`Failed to list files: ${err?.message ?? err}`);
      },
    );
  });
}

function switchItem(): FileQuickPickItem {
  return {
    label: '$(arrow-swap) Switch worktree…',
    alwaysShow: true,
    switch: true,
  };
}

function fileItem(relPath: string): FileQuickPickItem {
  const dir = path.dirname(relPath);
  return {
    label: path.basename(relPath),
    description: dir === '.' ? '' : dir,
    relPath,
  };
}

function worktreeTitle(root: Uri): string {
  const folder = path.basename(root.fsPath);
  const repo = gitApi.getRepository(root);
  const head = repo?.state.HEAD;
  const ref = head?.name ?? head?.commit?.slice(0, 7);
  return ref ? `${folder} · ${ref}` : folder;
}

async function pickWorktree(currentRoot: Uri): Promise<Uri | undefined> {
  const worktrees = (await listWorktrees(currentRoot)).filter(wt => !wt.bare);
  if (worktrees.length === 0) return undefined;

  return new Promise(resolve => {
    const quickPick = window.createQuickPick<WorktreeQuickPickItem>();
    quickPick.title = 'Switch worktree';
    quickPick.placeholder = 'Pick a worktree to search';
    quickPick.matchOnDescription = true;
    quickPick.items = worktrees.map(wt => ({
      label: wt.path.fsPath === currentRoot.fsPath
        ? `$(check) ${path.basename(wt.path.fsPath)}`
        : `   ${path.basename(wt.path.fsPath)}`,
      description: worktreeDescription(wt),
      detail: wt.path.fsPath,
      worktree: wt,
    }));

    let chosen: Uri | undefined;

    quickPick.onDidAccept(() => {
      const picked = quickPick.activeItems[0];
      if (picked) chosen = picked.worktree.path;
      quickPick.hide();
    });

    quickPick.onDidHide(() => {
      quickPick.dispose();
      resolve(chosen);
    });

    quickPick.show();
  });
}
