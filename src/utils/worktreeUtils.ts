import { Uri } from 'vscode';
import { gitRunInUri, LogLevel } from './gitRawRunner';
import { parseWorktreeList, Worktree } from './worktreeParsers';
import GitTextUtils from './gitTextUtils';

export type { Worktree } from './worktreeParsers';

export async function listWorktrees(rootUri: Uri): Promise<Worktree[]> {
  const result = await gitRunInUri(rootUri, ['worktree', 'list', '--porcelain'], {}, LogLevel.None);
  return parseWorktreeList(result.stdout);
}

/**
 * Tracked + untracked-not-ignored files in the worktree, relative to its root.
 * Mirrors what `git status` would consider, minus modifications detail.
 */
export async function listFiles(worktreeRoot: Uri): Promise<string[]> {
  const result = await gitRunInUri(
    worktreeRoot,
    ['ls-files', '-co', '--exclude-standard'],
    {},
    LogLevel.None,
  );
  return result.stdout.split(/\r?\n/).filter(line => line.length > 0);
}

export function worktreeDescription(wt: Worktree): string {
  if (wt.bare) return 'bare';
  const parts: string[] = [];
  if (wt.branch) parts.push(wt.branch);
  else if (wt.detached) parts.push('(detached)');
  if (wt.head) parts.push(GitTextUtils.shortHash(wt.head));
  if (wt.locked !== undefined) parts.push(wt.locked ? `locked: ${wt.locked}` : 'locked');
  if (wt.prunable !== undefined) parts.push('prunable');
  return parts.join(' · ');
}
