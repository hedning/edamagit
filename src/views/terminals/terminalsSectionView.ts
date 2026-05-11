import * as path from 'path';
import { TabInputTerminal, Terminal, TerminalLocation, Uri, window } from 'vscode';
import { View } from '../general/view';
import { Section, SectionHeaderView } from '../general/sectionHeader';
import { TextView } from '../general/textView';
import { Worktree } from '../../utils/worktreeParsers';

export class TerminalsSectionView extends View {
  isFoldable = true;

  get id() { return Section.Terminals.toString(); }

  constructor(terminals: Terminal[], currentRoot: Uri) {
    super();
    this.subViews = [
      new SectionHeaderView(Section.Terminals, terminals.length),
      ...terminals.map(t => new TerminalItemView(t, currentRoot)),
    ];
  }
}

export class TerminalItemView extends TextView {
  constructor(public terminal: Terminal, currentRoot: Uri) {
    super(TerminalItemView.format(terminal, currentRoot));
  }

  private static format(t: Terminal, currentRoot: Uri): string {
    const cwd = t.shellIntegration?.cwd;
    const rel = cwd ? path.relative(currentRoot.fsPath, cwd.fsPath) : '';
    const cwdLabel = rel === '' ? '.' : rel;
    return `  ${t.name}  ${cwdLabel}`;
  }
}

/**
 * Returns the editor-area terminals whose shell-integration cwd belongs to
 * `currentRoot` rather than to any nested worktree contained within it.
 * Panel terminals are excluded; so are terminals without shell integration.
 */
export function terminalsForWorktree(currentRoot: Uri, worktrees: Worktree[]): Terminal[] {
  // Sort longest-first so the prefix search finds the deepest containing
  // worktree, not just any ancestor — this is what excludes terminals
  // inside a nested worktree from the parent's list.
  const sortedPaths = Array.from(new Set(worktrees.map(w => normalize(w.path.fsPath))))
    .sort((a, b) => b.length - a.length);
  const currentPath = normalize(currentRoot.fsPath);
  const editorNames = collectEditorTerminalNames();

  return window.terminals.filter(t => {
    if (!isEditorTerminal(t, editorNames)) return false;
    const cwd = t.shellIntegration?.cwd;
    if (!cwd) return false;
    const cwdPath = normalize(cwd.fsPath);
    const deepest = sortedPaths.find(wp => cwdPath === wp || cwdPath.startsWith(wp + path.sep));
    return deepest === currentPath;
  });
}

function isEditorTerminal(t: Terminal, editorNames: Set<string>): boolean {
  // VS Code reconstructs creationOptions without `location` for UI-created
  // terminals, so we can only trust this branch for terminals our extension
  // (or another) created with an explicit location.
  const loc = t.creationOptions.location;
  if (loc === TerminalLocation.Editor) return true;
  if (typeof loc === 'object' && loc !== null && 'viewColumn' in loc) return true;
  // Fallback: a tab in the editor area carries this terminal's name. Imperfect
  // when two terminals share a name (e.g. two unnamed zshs), but it's the only
  // signal the public API exposes — TabInputTerminal has no terminal handle.
  return editorNames.has(t.name);
}

function collectEditorTerminalNames(): Set<string> {
  const names = new Set<string>();
  for (const group of window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof TabInputTerminal) {
        names.add(tab.label);
      }
    }
  }
  return names;
}

function normalize(p: string): string {
  return p.endsWith(path.sep) && p.length > 1 ? p.slice(0, -1) : p;
}
