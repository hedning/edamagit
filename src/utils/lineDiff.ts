// Line-level diff used by `DocumentView.triggerUpdate` so view refreshes can
// be pushed to the model as multiple small per-line edits. VS Code's edit
// tracker then shifts cursor positions through inserts/deletes naturally
// instead of collapsing them to the end of one big middle replace (which is
// what happens with the FS-provider reload path or with `workspace.applyEdit`
// against a read-only editor — both skip `computeMoreMinimalEdits`).
//
// Input is full text (with `\n` or `\r\n` separators) — splitting into lines
// is an internal detail. Hunks reference line indices in the split form of
// `a`. Two implementations:
// - `computeLineDiffMyers` — Myers' O(N*D) algorithm. Cheap when changes are
//   sparse (the typical refresh after a magit action: a handful of lines
//   change in a buffer of hundreds or thousands).
// - `computeLineDiffLcs` — straightforward O(N*M) LCS DP. Default for now;
//   kept as a sanity reference, though its quadratic space gets ugly fast.

import { LineSplitterRegex } from '../common/constants';

export interface LineDiffHunk {
  // Range in `a`'s split-line form, half-open: lines [oldStartLine, oldEndLine).
  oldStartLine: number;
  oldEndLine: number;
  // Replacement lines (may be empty for pure deletion).
  newLines: string[];
}

// Edit-script ops: 0 = equal, 1 = delete from old, 2 = insert from new.
type Op = 0 | 1 | 2;

export const computeLineDiff = computeLineDiffLcs;

export function computeLineDiffMyers(aText: string, bText: string): LineDiffHunk[] {
  const a = aText.split(LineSplitterRegex);
  const b = bText.split(LineSplitterRegex);
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max === 0) return [];

  // `v[max + k]` holds the furthest `x` reached on diagonal `k = x - y` after
  // `D` non-diagonal steps. We snapshot `v` at the start of each `D` iteration
  // so we can backtrack later.
  const v = new Int32Array(2 * max + 1);
  const trace: Int32Array[] = [];

  let finalD = -1;
  outer:
  for (let d = 0; d <= max; d++) {
    trace.push(new Int32Array(v));
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[max + k - 1] < v[max + k + 1])) {
        x = v[max + k + 1]; // arrived via insertion (kPrev = k + 1)
      } else {
        x = v[max + k - 1] + 1; // arrived via deletion (kPrev = k - 1)
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[max + k] = x;
      if (x >= n && y >= m) { finalD = d; break outer; }
    }
  }

  const ops: Op[] = [];
  let x = n, y = m;
  for (let d = finalD; d > 0; d--) {
    const vd = trace[d];
    const k = x - y;
    const kPrev = (k === -d || (k !== d && vd[max + k - 1] < vd[max + k + 1]))
      ? k + 1
      : k - 1;
    const xPrev = vd[max + kPrev];
    const yPrev = xPrev - kPrev;
    // Snake backward to the (xPrev, yPrev) endpoint, then the single
    // non-diagonal step that took us off that diagonal.
    while (x > xPrev && y > yPrev) { ops.push(0); x--; y--; }
    if (x === xPrev) { ops.push(2); y--; } else { ops.push(1); x--; }
  }
  // Initial snake — diagonal moves before any non-diag step.
  while (x > 0 && y > 0) { ops.push(0); x--; y--; }
  ops.reverse();

  return opsToHunks(ops, b);
}

export function computeLineDiffLcs(aText: string, bText: string): LineDiffHunk[] {
  const a = aText.split(LineSplitterRegex);
  const b = bText.split(LineSplitterRegex);
  const n = a.length;
  const m = b.length;

  const dp: Int32Array[] = [];
  for (let i = 0; i <= n; i++) dp.push(new Int32Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
      }
    }
  }

  const ops: Op[] = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { ops.push(0); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) { ops.push(1); i--; }
    else { ops.push(2); j--; }
  }
  while (i > 0) { ops.push(1); i--; }
  while (j > 0) { ops.push(2); j--; }
  ops.reverse();

  return opsToHunks(ops, b);
}

function opsToHunks(ops: Op[], newLines: string[]): LineDiffHunk[] {
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
