import { Uri } from 'vscode';
import { gitRunInUri, LogLevel } from './gitRawRunner';
import { parseWorktreeList, Worktree } from './worktreeParsers';

export type { Worktree } from './worktreeParsers';

export async function listWorktrees(rootUri: Uri): Promise<Worktree[]> {
  const result = await gitRunInUri(rootUri, ['worktree', 'list', '--porcelain'], {}, LogLevel.None);
  return parseWorktreeList(result.stdout);
}
