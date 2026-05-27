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
//
// Both go through `diffTrimmed`, which strips the common prefix/suffix and
// only diffs the changed middle. That keeps the usual case (huge buffer, a
// few changed lines) cheap, and — via per-algorithm size caps — collapses a
// pathologically large change into a single replace hunk instead of trying to
// allocate an O(N*M) table / O(N*D) trace big enough to crash the host. A
// DiffView refresh really can pit a 50k-line buffer against a 4k-line one;
// the LCS table for that is ~200M Int32 cells (~800MB) and simply fails to
// allocate. Fine-grained edits buy cursor stability, which is worthless when
// nearly every line changed anyway.

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

// A core algorithm diffs two already-trimmed line arrays into an edit script,
// or returns `null` to signal "too big — fall back to a single replace".
type CoreDiff = (a: string[], b: string[]) => Op[] | null;

// LCS allocates one flat Int32 table of (n+1)*(m+1) cells. 16M cells is ~64MB
// — comfortably below the heap, while still handling the largest diffs we
// actually want line-level edits for (a few thousand lines each side).
const MAX_LCS_AREA = 16_000_000;
// Myers snapshots its frontier (size ~2*(n+m)) once per edit-distance step, so
// its memory scales with (n+m)*D. Cap total lines low enough that even a
// fully-different pair stays well-bounded.
const MAX_MYERS_LINES = 5_000;

export const computeLineDiff = computeLineDiffLcs;

export function computeLineDiffMyers(aText: string, bText: string): LineDiffHunk[] {
  return diffTrimmed(aText, bText, myersOps);
}

export function computeLineDiffLcs(aText: string, bText: string): LineDiffHunk[] {
  return diffTrimmed(aText, bText, lcsOps);
}

// Split, strip the common prefix/suffix, then run the chosen core algorithm on
// the changed middle. Core hunk indices are relative to the trimmed region, so
// shift them back by `lo`. If the core bails (`null`), emit one replace hunk
// for the whole middle — the trimmed prefix/suffix is untouched, so cursors
// outside the changed region still survive.
function diffTrimmed(aText: string, bText: string, core: CoreDiff): LineDiffHunk[] {
  const a = aText.split(LineSplitterRegex);
  const b = bText.split(LineSplitterRegex);

  const aLen = a.length, bLen = b.length;
  let lo = 0;
  while (lo < aLen && lo < bLen && a[lo] === b[lo]) lo++;
  let aHi = aLen, bHi = bLen;
  while (aHi > lo && bHi > lo && a[aHi - 1] === b[bHi - 1]) { aHi--; bHi--; }

  if (aHi === lo && bHi === lo) return [];

  const aCore = a.slice(lo, aHi);
  const bCore = b.slice(lo, bHi);

  const ops = core(aCore, bCore);
  if (ops === null) {
    return [{ oldStartLine: lo, oldEndLine: aHi, newLines: bCore }];
  }

  const hunks = opsToHunks(ops, bCore);
  for (const h of hunks) { h.oldStartLine += lo; h.oldEndLine += lo; }
  return hunks;
}

function myersOps(a: string[], b: string[]): Op[] | null {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max === 0) return [];
  if (max > MAX_MYERS_LINES) return null;

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

  return ops;
}

function lcsOps(a: string[], b: string[]): Op[] | null {
  const n = a.length;
  const m = b.length;
  if ((n + 1) * (m + 1) > MAX_LCS_AREA) return null;

  // Flat (n+1)*(m+1) table, row-major: dp[i*w + j]. A single allocation keeps
  // the area cap meaningful (one buffer, not n+1 small ones).
  const w = m + 1;
  const dp = new Int32Array((n + 1) * w);
  for (let i = 1; i <= n; i++) {
    const ai = a[i - 1];
    const row = i * w;
    const prev = row - w;
    for (let j = 1; j <= m; j++) {
      if (ai === b[j - 1]) {
        dp[row + j] = dp[prev + j - 1] + 1;
      } else {
        const up = dp[prev + j], left = dp[row + j - 1];
        dp[row + j] = up >= left ? up : left;
      }
    }
  }

  const ops: Op[] = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { ops.push(0); i--; j--; }
    else if (dp[(i - 1) * w + j] >= dp[i * w + j - 1]) { ops.push(1); i--; }
    else { ops.push(2); j--; }
  }
  while (i > 0) { ops.push(1); i--; }
  while (j > 0) { ops.push(2); j--; }
  ops.reverse();

  return ops;
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
