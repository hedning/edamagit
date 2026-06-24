import * as path from 'path';
import { TabInputText, Uri, window } from 'vscode';
import { View } from '../general/view';
import { Section, SectionHeaderView } from '../general/sectionHeader';
import { TextView } from '../general/textView';

export interface SessionFile {
  uri: Uri;
  /** Human-friendly description, e.g. 'commit message'. */
  label: string;
  /** Path relative to the git dir, e.g. 'rebase-merge/git-rebase-todo'. */
  relativePath: string;
}

/**
 * Files git opens in `$EDITOR` during an operation, keyed by their path
 * relative to the per-worktree git dir. Listed so an in-progress commit,
 * merge, tag or rebase buffer stays visible (and reachable with RET) from the
 * status view, the same way the Terminals section surfaces editor terminals.
 */
const SESSION_FILE_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['COMMIT_EDITMSG', 'commit message'],
  ['MERGE_MSG', 'merge message'],
  ['SQUASH_MSG', 'squash message'],
  ['TAG_EDITMSG', 'tag message'],
  ['rebase-merge/git-rebase-todo', 'rebase todo'],
];

export class SessionFilesSectionView extends View {
  isFoldable = true;

  get id() { return Section.Editing.toString(); }

  constructor(files: SessionFile[]) {
    super();
    const labelWidth = Math.max(0, ...files.map(f => f.label.length));
    this.subViews = [
      new SectionHeaderView(Section.Editing, files.length),
      ...files.map(f => new SessionFileItemView(f, labelWidth)),
    ];
  }
}

export class SessionFileItemView extends TextView {
  constructor(public file: SessionFile, labelWidth: number) {
    super(`  ${file.label.padEnd(labelWidth)}  ${file.relativePath}`);
  }
}

/**
 * Scan open editor tabs for the git session files belonging to `gitDir` (the
 * current worktree's git dir), in the order declared above. Each worktree has
 * its own git dir, so matching against it naturally excludes another
 * worktree's buffers.
 */
export function sessionFilesForWorktree(gitDir: Uri): SessionFile[] {
  const openTextPaths = collectOpenTextPaths();
  const files: SessionFile[] = [];
  for (const [relativePath, label] of SESSION_FILE_LABELS) {
    const target = path.join(gitDir.fsPath, ...relativePath.split('/'));
    const uri = openTextPaths.get(target);
    if (uri) files.push({ uri, label, relativePath });
  }
  return files;
}

function collectOpenTextPaths(): Map<string, Uri> {
  const result = new Map<string, Uri>();
  for (const group of window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof TabInputText) {
        result.set(tab.input.uri.fsPath, tab.input.uri);
      }
    }
  }
  return result;
}
