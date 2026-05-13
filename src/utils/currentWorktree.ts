import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Uri, window, workspace } from 'vscode';
import { gitApi } from '../extension';
import { asMagitUri, repoUriFromMagitUri } from '../common/magitUri';
import { Repository } from '../typings/git';

/**
 * Resolve the "current" git repository (worktree) from the user's focus:
 * active editor → focused terminal → first workspace folder.
 *
 * Handles magit URIs and files under `<main>/.git/worktrees/<name>/…` (e.g.
 * `COMMIT_EDITMSG`), which would otherwise resolve to the main repo instead of
 * the worktree.
 */
export function currentWorktree(): Repository | undefined {
  const editor = window.activeTextEditor;
  if (editor) {
    const repo = repoForUri(editor.document.uri);
    if (repo) return repo;
  }

  // Terminal editors: the active tab is a TabInputTerminal. There's no API
  // tying a tab to a specific terminal, so we use the most recently focused
  // terminal as a heuristic.
  const tab = window.tabGroups.activeTabGroup.activeTab;
  if (tab?.input instanceof vscode.TabInputTerminal) {
    const cwd = terminalCwd(window.activeTerminal);
    if (cwd) {
      const repo = gitApi.getRepository(cwd);
      if (repo) return repo;
    }
  }

  const folder = workspace.workspaceFolders?.[0];
  if (folder) {
    const repo = gitApi.getRepository(folder.uri);
    if (repo) return repo;
  }

  return undefined;
}

function repoForUri(uri: Uri): Repository | undefined {
  const magitUri = asMagitUri(uri);
  if (magitUri) {
    return gitApi.getRepository(repoUriFromMagitUri(magitUri)) ?? undefined;
  }
  // Files like COMMIT_EDITMSG for a worktree live under
  // `<main>/.git/worktrees/<name>/…`, which is inside the main repo's root.
  // `getRepository` would resolve that to the main repo; redirect to the
  // actual worktree by reading the `gitdir` pointer.
  const wtGitDir = uri.scheme === 'file'
    ? uri.fsPath.match(/^(.*[\\/]\.git[\\/]worktrees[\\/][^\\/]+)[\\/]/)?.[1]
    : undefined;
  if (wtGitDir) {
    const repo = repoFromWorktreeGitDir(wtGitDir);
    if (repo) return repo;
  }
  return gitApi.getRepository(uri) ?? undefined;
}

function repoFromWorktreeGitDir(worktreeGitDir: string): Repository | undefined {
  try {
    const gitdir = fs.readFileSync(path.join(worktreeGitDir, 'gitdir'), 'utf8').trim();
    return gitApi.getRepository(Uri.file(path.dirname(gitdir))) ?? undefined;
  } catch {
    return undefined;
  }
}

function terminalCwd(terminal: vscode.Terminal | undefined): Uri | undefined {
  if (!terminal) return undefined;
  if (terminal.shellIntegration?.cwd) return terminal.shellIntegration.cwd;
  const opts = terminal.creationOptions as { cwd?: string | Uri } | undefined;
  const cwd = opts?.cwd;
  if (!cwd) return undefined;
  return typeof cwd === 'string' ? Uri.file(cwd) : cwd;
}
