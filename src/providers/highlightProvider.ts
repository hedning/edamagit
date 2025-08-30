import * as vscode from 'vscode';
import { views } from '../extension';

export default class HighlightProvider implements vscode.DocumentHighlightProvider {

  dispose() { }

  provideDocumentHighlights(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.DocumentHighlight[]> {

    const currentView = views.get(document.uri.toString());
    if (!currentView) return;

    const clickedView = currentView.click(position);
    if (!clickedView?.isHighlightable) return;

    // Ideally we probably want the default word highlighting here? But turning this off results in really awful highlighting.

    // Some notes:
    // vscode won't ask for new highlights if the cursor stays inside a highlight range, and for 
    // some reason they proactively kill highlights when you move (this might make sense if highlighting is slow) resulting
    // in a blinking header highlight, which get really annoying
    // But by highlighting the line and the header we can easily F7 between them, though ctrl+up and undo cursor basically does that already
    const header = document.lineAt(clickedView.range.start).range
    const line = document.lineAt(position.line).range;
    return [new vscode.DocumentHighlight(header, vscode.DocumentHighlightKind.Text), new vscode.DocumentHighlight(line, vscode.DocumentHighlightKind.Text)];
  }
}
