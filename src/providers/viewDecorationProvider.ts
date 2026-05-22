import * as vscode from 'vscode';
import { views } from '../extension';
import { visitVisibleViews } from '../utils/viewUtils';
import { DecorationKind, DecorationRange, isDecoratableView } from '../views/general/decoratableView';
import * as Constants from '../common/constants';

// Paints line backgrounds and overview-ruler marks for diff lines in magit
// views. Ranges come from the view tree (DecoratableView), not from scanning
// rendered text, so the +/- char no longer needs to live at column 0 and
// commit-message lines containing +/- can't be misclassified.
export class ViewDecorationProvider {

  private readonly types: Record<DecorationKind, vscode.TextEditorDecorationType>;

  constructor() {
    this.types = {
      added: vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
        // overviewRulerLane doesn't scale very well
        // overviewRulerLane: vscode.OverviewRulerLane.Left,
        // overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.addedForeground'),
      }),
      removed: vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
        // Doesn't scale great
        // overviewRulerLane: vscode.OverviewRulerLane.Left,
        // overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.deletedForeground'),
      }),
    };
  }

  dispose() {
    for (const t of Object.values(this.types)) t.dispose();
  }

  apply(editor: vscode.TextEditor) {
    if (editor.document.uri.scheme !== Constants.MagitUriScheme) return;

    const root = views.get(editor.document.uri.toString());
    const buckets: Record<DecorationKind, vscode.Range[]> = { added: [], removed: [] };

    if (root) {
      const lineCount = editor.document.lineCount;
      visitVisibleViews(root, view => {
        if (!isDecoratableView(view)) return;
        for (const d of view.getDecorations()) {
          // Render-set line numbers can briefly outrun the document model
          // when the view tree updates faster than VSCode swaps in our new
          // content. Drop out-of-bounds ranges instead of throwing.
          if (d.range.end.line < lineCount) {
            buckets[d.kind].push(d.range);
          }
        }
      });
    }

    // Always call setDecorations (even with []) so stale marks clear.
    for (const kind of Object.keys(this.types) as DecorationKind[]) {
      editor.setDecorations(this.types[kind], buckets[kind]);
    }
  }

  applyToEditorsFor(uri: vscode.Uri) {
    const key = uri.toString();
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.toString() === key) this.apply(editor);
    }
  }

  applyToAllVisible() {
    for (const editor of vscode.window.visibleTextEditors) this.apply(editor);
  }
}
