import * as vscode from 'vscode';
import { views } from '../extension';
import { HunkView } from '../views/changes/hunkView';
import { ChangeView } from '../views/changes/changeView';
import { View } from '../views/general/view';
import { Status } from '../typings/git';
import { getStatusText } from '../utils/gitTextUtils';
import { ChangeSectionView } from '../views/changes/changesSectionView';
import { BranchHeaderSectionView } from '../views/branches/branchHeaderSectionView';
import { WorktreeSectionView, WorktreeItemView } from '../views/worktrees/worktreeSectionView';
import { TerminalsSectionView, TerminalItemView } from '../views/terminals/terminalsSectionView';
import { StashSectionView } from '../views/stashes/stashSectionView';
import { Section } from '../views/general/sectionHeader';


function createSymbol(view: ChangeView) {
    const change = view.change;
    return new vscode.DocumentSymbol(change.relativePath || change.uri.path, '', vscode.SymbolKind.File, view.range, view.range);
}

export class SymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken) {
        const currentView = views.get(document.uri.toString());
        if (!currentView) return;

        const symbols: vscode.DocumentSymbol[] = [];
        // Sticky scroll only shows containers that are *nested ancestors* of
        // the current symbol, not flat siblings. So when we enter HEAD we
        // redirect subsequent pushes into its children for the duration.
        let scope: vscode.DocumentSymbol[] = symbols;
        function iter(view: View) {
            if (view instanceof BranchHeaderSectionView) {
                const head = new vscode.DocumentSymbol(view.headerText, '', vscode.SymbolKind.Namespace, view.range, view.range);
                scope.push(head);
                const outer = scope; scope = head.children;
                for (const sub of view.subViews) iter(sub);
                scope = outer;
                return;
            }
            if (view instanceof ChangeSectionView) {
                const changes: vscode.DocumentSymbol[] = [];
                for (const changeView of view.subViews) {
                    if (!(changeView instanceof ChangeView)) continue;
                    changes.push(createSymbol(changeView));
                }
                const section = new vscode.DocumentSymbol(view.section, '', vscode.SymbolKind.Namespace, view.range, view.range);
                section.children = changes;
                scope.push(section);
                return;

            } else if (view instanceof ChangeView) {
                // Commit views doesn't have a section
                scope.push(createSymbol(view));
                return;
            }
            if (view instanceof WorktreeSectionView) {
                const children: vscode.DocumentSymbol[] = [];
                for (const sub of view.subViews) {
                    if (!(sub instanceof WorktreeItemView)) continue;
                    const wt = sub.worktree;
                    const name = wt.branch || (wt.bare ? '(bare)' : wt.detached ? '(detached)' : wt.path.fsPath);
                    children.push(new vscode.DocumentSymbol(name, wt.path.fsPath, vscode.SymbolKind.Module, sub.range, sub.range));
                }
                const section = new vscode.DocumentSymbol(Section.Worktrees, '', vscode.SymbolKind.Namespace, view.range, view.range);
                section.children = children;
                scope.push(section);
                return;
            }
            if (view instanceof TerminalsSectionView) {
                const children: vscode.DocumentSymbol[] = [];
                for (const sub of view.subViews) {
                    if (!(sub instanceof TerminalItemView)) continue;
                    children.push(new vscode.DocumentSymbol(sub.terminal.name, '', vscode.SymbolKind.Event, sub.range, sub.range));
                }
                const section = new vscode.DocumentSymbol(Section.Terminals, '', vscode.SymbolKind.Namespace, view.range, view.range);
                section.children = children;
                scope.push(section);
                return;
            }
            if (view instanceof StashSectionView) {
                scope.push(new vscode.DocumentSymbol(Section.Stashes, '', vscode.SymbolKind.Namespace, view.range, view.range));
                return;
            }
            // todo: add branch symbols in the log view
            for (const sub of view.subViews) iter(sub);
        }
        iter(currentView);

        return symbols;
    }

}