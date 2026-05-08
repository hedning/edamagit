import { Uri } from 'vscode';

export interface Worktree {
  path: Uri;
  head?: string;
  branch?: string;
  bare: boolean;
  detached: boolean;
  locked?: string;
  prunable?: string;
}

/**
 * Parse `git worktree list --porcelain`. Each block looks like:
 *   worktree <absolute path>
 *   HEAD <sha>
 *   branch refs/heads/<name>     | detached
 *   [bare]
 *   [locked [reason]]
 *   [prunable [reason]]
 * with a blank line between blocks.
 */
export function parseWorktreeList(output: string): Worktree[] {
  const worktrees: Worktree[] = [];
  let current: Partial<Worktree> | undefined;

  const flush = () => {
    if (current?.path) {
      worktrees.push({
        path: current.path,
        head: current.head,
        branch: current.branch,
        bare: current.bare ?? false,
        detached: current.detached ?? false,
        locked: current.locked,
        prunable: current.prunable,
      });
    }
    current = undefined;
  };

  for (const line of output.split(/\r?\n/)) {
    if (line === '') {
      flush();
      continue;
    }
    const space = line.indexOf(' ');
    const key = space === -1 ? line : line.slice(0, space);
    const value = space === -1 ? '' : line.slice(space + 1);
    if (key === 'worktree') {
      current = { path: Uri.file(value) };
    } else if (!current) {
      continue;
    } else if (key === 'HEAD') {
      current.head = value;
    } else if (key === 'branch') {
      current.branch = value.startsWith('refs/heads/') ? value.slice('refs/heads/'.length) : value;
    } else if (key === 'bare') {
      current.bare = true;
    } else if (key === 'detached') {
      current.detached = true;
    } else if (key === 'locked') {
      current.locked = value || '';
    } else if (key === 'prunable') {
      current.prunable = value || '';
    }
  }
  flush();
  return worktrees;
}
