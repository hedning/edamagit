import * as fs from 'fs/promises';
import * as path from 'path';
import { Uri } from 'vscode';

export interface ResolvedGitDir {
  /**
   * Per-worktree git directory. State-of-operation files live here:
   * HEAD, *_HEAD, MERGE_MSG, rebase-merge/, rebase-apply/, sequencer/.
   */
  gitDir: Uri;
  /**
   * Shared git directory. refs/, packed-refs, hooks/ live here. For a
   * non-worktree repo this equals `gitDir`.
   */
  commonDir: Uri;
}

/**
 * Resolve the actual git directory for a working tree.
 *
 * For a regular repo `<root>/.git` is a directory and serves as both the
 * per-worktree and common dir. For a linked worktree `<root>/.git` is a
 * file containing `gitdir: <path>` that points into
 * `<main>/.git/worktrees/<name>/`; its `commondir` file then points back
 * to the shared `<main>/.git`.
 *
 * On any read failure the conventional `<root>/.git` is returned for both;
 * callers will fail on the actual read of state files instead.
 */
export async function resolveGitDir(repoRoot: Uri): Promise<ResolvedGitDir> {
  const dotGit = path.join(repoRoot.fsPath, '.git');
  let gitDir = dotGit;
  try {
    const stat = await fs.stat(dotGit);
    if (!stat.isDirectory()) {
      const content = await fs.readFile(dotGit, 'utf8');
      const match = content.match(/^gitdir:\s*(.+)$/m);
      if (match) {
        const value = match[1].trim();
        gitDir = path.isAbsolute(value) ? value : path.resolve(repoRoot.fsPath, value);
      }
    }
  } catch {
    return { gitDir: Uri.file(dotGit), commonDir: Uri.file(dotGit) };
  }

  let commonDir = gitDir;
  try {
    const content = await fs.readFile(path.join(gitDir, 'commondir'), 'utf8');
    const value = content.trim();
    commonDir = path.isAbsolute(value) ? value : path.resolve(gitDir, value);
  } catch {
    // No commondir → not a worktree; gitDir is also the common dir.
  }

  return { gitDir: Uri.file(gitDir), commonDir: Uri.file(commonDir) };
}
