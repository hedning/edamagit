export interface MagitChangeHunk {
  diff: string;
  diffHeader: string;
  // Repo-relative; the live MagitRepository.uri provides the root at visit time
  // so the file resolves to the worktree the view was opened from.
  relativePath: string;
}