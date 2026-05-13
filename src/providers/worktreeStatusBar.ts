import * as path from 'path';
import * as vscode from 'vscode';
import { Disposable, StatusBarItem, window } from 'vscode';
import { gitApi } from '../extension';
import { Repository } from '../typings/git';
import { currentWorktree } from '../utils/currentWorktree';

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
    const repo = currentWorktree();
    if (this.currentRepo !== repo) {
      this.currentRepoSub?.dispose();
      this.currentRepoSub = repo?.state.onDidChange(() => this.render());
      this.currentRepo = repo;
    }
    this.render();
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
