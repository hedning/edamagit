import * as vscode from 'vscode';
import { views } from '../extension';
import * as Constants from '../common/constants';
import FilePathUtils from '../utils/filePathUtils';
import MagitUtils from '../utils/magitUtils';
import { MagitRepository } from '../models/magitRepository';

export default class ContentProvider implements vscode.TextDocumentContentProvider {

  public viewUpdatedEmitter = new vscode.EventEmitter<vscode.Uri>();
  onDidChange: vscode.Event<vscode.Uri>;

  private _subscriptions: vscode.Disposable;

  constructor() {

    this.onDidChange = this.viewUpdatedEmitter.event;

    let changed: vscode.Uri[] = [];
    let timeout: NodeJS.Timeout | undefined = undefined;
    async function update() {
      const seen = new Set<string>()
      // Note, this only triggers if there's a visible 
      for (const visibleEditor of vscode.window.visibleTextEditors) {
        if (visibleEditor.document.uri.scheme !== Constants.MagitUriScheme) continue;
        for (const uri of changed) {
          if (!FilePathUtils.isDescendant(visibleEditor.document.uri.query, uri.fsPath)) continue;

          const repository = await MagitUtils.getCurrentMagitRepo(visibleEditor.document.uri);
          if (!repository) continue;
          if (seen.has(repository.uri.fsPath)) continue;

          seen.add(repository.uri.fsPath);
          MagitUtils.magitStatusAndUpdate(repository);
        }
      }
      changed = []
    }

    this._subscriptions = vscode.Disposable.from(
      vscode.workspace.onDidCloseTextDocument(
        (doc) => {
          if (doc.uri.scheme !== Constants.MagitUriScheme) return;

          views.delete(doc.uri.toString());
        }
      ),
      vscode.workspace.onDidSaveTextDocument(
        async (doc) => {
          return
          changed.push(doc.uri);
          if (timeout) clearTimeout(timeout);
          // Ughh, 20ms is actually too low...
          timeout = setTimeout(update, 200);
        }
      ),
    );
  }

  dispose() {
    this._subscriptions.dispose();
    this.viewUpdatedEmitter.dispose();
  }

  provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {

    const view = views.get(uri.toString());

    if (view) {
      view.emitter = this.viewUpdatedEmitter;
      return view.render(0).join('\n');
    }
    return '';
  }
}