import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Disposable, StatusBarItem, Uri, window, workspace } from 'vscode';
import { gitApi } from '../extension';
import { asMagitUri, repoUriFromMagitUri } from '../common/magitUri';
import { Repository } from '../typings/git';

export class WorktreeStatusBar implements Disposable {

  private item: StatusBarItem;
  private currentRepo: Repository | undefined;
  private currentRepoSub: Disposable | undefined;
  private disposables: Disposable[] = [];

  constructor() {
    this.item = window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100000);
    this.item.command = 'magit.status';
    this.disposables.push(this.item);

    this.disposables.push(
      window.onDidChangeActiveTextEditor(() => this.update()),
      window.tabGroups.onDidChangeTabs(() => this.update()),
      window.tabGroups.onDidChangeTabGroups(() => this.update()),
      window.onDidChangeActiveTerminal(() => this.update()),
      window.onDidChangeTerminalShellIntegration(e => {
        if (e.terminal === window.activeTerminal) this.update();
      }),
      window.onDidEndTerminalShellExecution(e => {
        if (e.execution.cwd && e.execution.cwd !== this.currentRepo?.rootUri) this.update();
      }),
      gitApi.onDidOpenRepository(() => this.update()),
      gitApi.onDidCloseRepository(() => this.update()),
    );

    this.update();
  }

  private update() {
    const repo = this.resolveRepo();
    if (this.currentRepo !== repo) {
      this.currentRepoSub?.dispose();
      this.currentRepoSub = repo?.state.onDidChange(() => this.render());
      this.currentRepo = repo;
    }
    this.render();
  }

  private resolveRepo(): Repository | undefined {
    // Prefer the active text editor (covers regular files and .magit views).
    const editor = window.activeTextEditor;
    if (editor) {
      const repo = this.repoForUri(editor.document.uri);
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

    // Fallback: first workspace folder. Keeps the item populated on startup
    // before any editor is focused.
    const folder = workspace.workspaceFolders?.[0];
    if (folder) {
      const repo = gitApi.getRepository(folder.uri);
      if (repo) return repo;
    }

    return undefined;
  }

  private repoForUri(uri: Uri): Repository | undefined {
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

  private render() {
    const repo = this.currentRepo;
    if (!repo) {
      this.item.hide();
      return;
    }
    const head = repo.state.HEAD;
    const ref = head?.name ?? head?.commit?.slice(0, 7) ?? '(no branch)';
    const folder = path.basename(repo.rootUri.fsPath);
    this.item.text = `${folder} $(git-branch) ${ref}`;
    this.item.tooltip = `Magit: ${repo.rootUri.fsPath}`;
    this.item.show();
  }

  dispose() {
    this.currentRepoSub?.dispose();
    this.disposables.forEach(d => d.dispose());
  }
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
