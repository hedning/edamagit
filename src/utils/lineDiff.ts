// Line-level diff used by `DocumentView.triggerUpdate` so view refreshes can
// be pushed to the model as multiple small per-line edits. VS Code's edit
// tracker then shifts cursor positions through inserts/deletes naturally
// instead of collapsing them to the end of one big middle replace (which is
// what happens with the FS-provider reload path or with `workspace.applyEdit`
// against a read-only editor — both skip `computeMoreMinimalEdits`).
//
// O(N*M) LCS — good enough for typical magit buffers (status, log, diff).
// If a view ever gets large enough for this to bite, switch to Myers.

export interface LineDiffHunk {
  // Range in `oldLines`, half-open: lines [oldStartLine, oldEndLine).
  oldStartLine: number;
  oldEndLine: number;
  // Replacement lines (may be empty for pure deletion).
  newLines: string[];
}

export function computeLineDiff(oldLines: string[], newLines: string[]): LineDiffHunk[] {
  const n = oldLines.length;
  const m = newLines.length;

  const dp: Int32Array[] = [];
  for (let i = 0; i <= n; i++) dp.push(new Int32Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
      }
    }
  }

  const ops: (0 | 1 | 2)[] = []; // 0=eq, 1=del, 2=ins
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      ops.push(0); i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push(1); i--;
    } else {
      ops.push(2); j--;
    }
  }
  while (i > 0) { ops.push(1); i--; }
  while (j > 0) { ops.push(2); j--; }
  ops.reverse();

  const hunks: LineDiffHunk[] = [];
  let aPos = 0, bPos = 0;
  let curStart = -1;
  let curEnd = -1;
  let curIns: string[] = [];

  const flush = () => {
    if (curStart === -1) return;
    hunks.push({ oldStartLine: curStart, oldEndLine: curEnd, newLines: curIns });
    curStart = -1;
    curEnd = -1;
    curIns = [];
  };

  for (const op of ops) {
    if (op === 0) {
      flush();
      aPos++;
      bPos++;
    } else if (op === 1) {
      if (curStart === -1) { curStart = aPos; curEnd = aPos; }
      curEnd = aPos + 1;
      aPos++;
    } else {
      if (curStart === -1) { curStart = aPos; curEnd = aPos; }
      curIns.push(newLines[bPos]);
      bPos++;
    }
  }
  flush();

  return hunks;
}
