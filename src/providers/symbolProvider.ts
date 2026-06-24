import * as vscode from 'vscode';
import { views } from '../extension';
import { ChangeView } from '../views/changes/changeView';
import { View } from '../views/general/view';
import { ChangeSectionView } from '../views/changes/changesSectionView';
import { BranchHeaderSectionView } from '../views/branches/branchHeaderSectionView';
import { WorktreeSectionView, WorktreeItemView } from '../views/worktrees/worktreeSectionView';
import { TerminalsSectionView, TerminalItemView } from '../views/terminals/terminalsSectionView';
import { SessionFilesSectionView, SessionFileItemView } from '../views/sessionFiles/sessionFilesSectionView';
import { StashSectionView } from '../views/stashes/stashSectionView';
import { Section } from '../views/general/sectionHeader';
import LogView from '../views/logView';


function createSymbol(view: ChangeView) {
    const change = view.change;
    return new vscode.DocumentSymbol(change.relativePath || change.uri.path, '', vscode.SymbolKind.File, view.range, view.range);
}

function buildSectionSymbol(view: View): vscode.DocumentSymbol | undefined {
    if (view instanceof ChangeSectionView) {
        const children: vscode.DocumentSymbol[] = [];
        for (const changeView of view.subViews) {
            if (changeView instanceof ChangeView) children.push(createSymbol(changeView));
        }
        const sym = new vscode.DocumentSymbol(view.section, '', vscode.SymbolKind.Namespace, view.range, view.range);
        sym.children = children;
        return sym;
    }
    if (view instanceof ChangeView) {
        return createSymbol(view);
    }
    if (view instanceof WorktreeSectionView) {
        const children: vscode.DocumentSymbol[] = [];
        for (const sub of view.subViews) {
            if (!(sub instanceof WorktreeItemView)) continue;
            const wt = sub.worktree;
            const name = wt.branch || (wt.bare ? '(bare)' : wt.detached ? '(detached)' : wt.path.fsPath);
            children.push(new vscode.DocumentSymbol(name, wt.path.fsPath, vscode.SymbolKind.Module, sub.range, sub.range));
        }
        const sym = new vscode.DocumentSymbol(Section.Worktrees, '', vscode.SymbolKind.Namespace, view.range, view.range);
        sym.children = children;
        return sym;
    }
    if (view instanceof TerminalsSectionView) {
        const children: vscode.DocumentSymbol[] = [];
        for (const sub of view.subViews) {
            if (!(sub instanceof TerminalItemView)) continue;
            children.push(new vscode.DocumentSymbol(sub.terminal.name, '', vscode.SymbolKind.Event, sub.range, sub.range));
        }
        const sym = new vscode.DocumentSymbol(Section.Terminals, '', vscode.SymbolKind.Namespace, view.range, view.range);
        sym.children = children;
        return sym;
    }
    if (view instanceof SessionFilesSectionView) {
        const children: vscode.DocumentSymbol[] = [];
        for (const sub of view.subViews) {
            if (!(sub instanceof SessionFileItemView)) continue;
            children.push(new vscode.DocumentSymbol(sub.file.label, sub.file.relativePath, vscode.SymbolKind.File, sub.range, sub.range));
        }
        const sym = new vscode.DocumentSymbol(Section.Editing, '', vscode.SymbolKind.Namespace, view.range, view.range);
        sym.children = children;
        return sym;
    }
    if (view instanceof StashSectionView) {
        return new vscode.DocumentSymbol(Section.Stashes, '', vscode.SymbolKind.Namespace, view.range, view.range);
    }
    return undefined;
}

export class SymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken) {
        const currentView = views.get(document.uri.toString());
        if (!currentView) return;

        if (currentView instanceof LogView) {
            const header = currentView.subViews[0];
            if (!header) return [];
            const range = new vscode.Range(header.range.start, currentView.range.end);
            return [new vscode.DocumentSymbol(currentView.headerText, '', vscode.SymbolKind.Namespace, range, header.range)];
        }

        // BranchHeaderSectionView is a fold sibling of the other sections (so
        // folding the HEAD block doesn't collapse the whole buffer), but we
        // still want sticky scroll to keep "HEAD: <repo> <branch>" pinned for
        // the entire document. That requires the HEAD symbol's range to
        // contain every other section: build the sibling symbols first, then
        // attach them as children of a HEAD symbol whose range spans from the
        // header line to the end of the document.
        const symbols: vscode.DocumentSymbol[] = [];
        let headerView: BranchHeaderSectionView | undefined;
        const siblings: vscode.DocumentSymbol[] = [];

        for (const sub of currentView.subViews) {
            if (sub instanceof BranchHeaderSectionView) {
                headerView = sub;
                continue;
            }
            const sym = buildSectionSymbol(sub);
            if (sym) siblings.push(sym);
        }

        if (headerView) {
            const end = currentView.range.end.isAfter(headerView.range.end) ? currentView.range.end : headerView.range.end;
            const range = new vscode.Range(headerView.range.start, end);
            const head = new vscode.DocumentSymbol(headerView.headerText, '', vscode.SymbolKind.Namespace, range, headerView.range);
            head.children = siblings;
            symbols.push(head);
        } else {
            symbols.push(...siblings);
        }

        return symbols;
    }

}
