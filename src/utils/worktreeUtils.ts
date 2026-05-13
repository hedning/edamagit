import { Uri } from 'vscode';
import { gitRunInUri, LogLevel } from './gitRawRunner';
import { parseWorktreeList, Worktree } from './worktreeParsers';

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
