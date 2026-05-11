import * as path from 'path';
import { Terminal, TerminalLocation, Uri, window } from 'vscode';
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

  console.log('[magit:terminals] currentPath=%s worktreePaths=%o', currentPath, sortedPaths);
  for (const t of window.terminals) {
    const creationCwd = 'cwd' in t.creationOptions ? t.creationOptions.cwd : undefined;
    console.log('[magit:terminals]   term=%s isEditor=%s integrationCwd=%s creationCwd=%o',
      t.name, isEditorTerminal(t), t.shellIntegration?.cwd?.fsPath, creationCwd);
  }

  return window.terminals.filter(t => {
    if (!isEditorTerminal(t)) return false;
    const cwd = t.shellIntegration?.cwd;
    if (!cwd) return false;
    const cwdPath = normalize(cwd.fsPath);
    const deepest = sortedPaths.find(wp => cwdPath === wp || cwdPath.startsWith(wp + path.sep));
    return deepest === currentPath;
  });
}

function isEditorTerminal(t: Terminal): boolean {
  const loc = t.creationOptions.location;
  if (loc === TerminalLocation.Editor) return true;
  if (typeof loc === 'object' && loc !== null && 'viewColumn' in loc) return true;
  return false;
}

function normalize(p: string): string {
  return p.endsWith(path.sep) && p.length > 1 ? p.slice(0, -1) : p;
}
