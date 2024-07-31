import * as vscode from 'vscode';
import { views } from '../extension';
import { HunkView } from '../views/changes/hunkView';
import { ChangeView } from '../views/changes/changeView';
import { View } from '../views/general/view';
import { Status } from '../typings/git';
import { getStatusText } from '../utils/gitTextUtils';
import { ChangeSectionView } from '../views/changes/changesSectionView';


function createSymbol(view: ChangeView) {
    const change = view.change;
    return new vscode.DocumentSymbol(change.relativePath || change.uri.path, '', vscode.SymbolKind.File, view.range, view.range);
}

export class SymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken) {
        const currentView = views.get(document.uri.toString());
        if (!currentView) return;

        const symbols: vscode.DocumentSymbol[] = [];
        function iter(view: View) {
            if (view instanceof ChangeSectionView) {
                const changes: vscode.DocumentSymbol[] = [];
                for (const changeView of view.subViews) {
                    if (!(changeView instanceof ChangeView)) continue;
                    changes.push(createSymbol(changeView));
                }
                const section = new vscode.DocumentSymbol(view.section, '', vscode.SymbolKind.Namespace, view.range, view.range);
                section.children = changes;
                symbols.push(section);
                return;

            } else if (view instanceof ChangeView) {
                // Commit views doesn't have a section
                symbols.push(createSymbol(view));
                return;
            }
            for (const sub of view.subViews) iter(sub);
        }
        iter(currentView);

        return symbols;
    }

}