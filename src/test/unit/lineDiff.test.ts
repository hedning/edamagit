import * as assert from 'assert';
import { suite, test } from 'mocha';
import {
  LineDiffHunk,
  computeLineDiffLcs,
  computeLineDiffMyers,
} from '../../utils/lineDiff';

// Apply the hunks back to `a` and check that the result equals `b`. This is
// the invariant that `documentView.triggerUpdate` relies on — if it ever
// breaks, the assert in production fires.
function applyHunks(a: string[], hunks: LineDiffHunk[]): string[] {
  const result = a.slice();
  // Walk hunks in reverse so earlier indices remain stable.
  for (let i = hunks.length - 1; i >= 0; i--) {
    const h = hunks[i];
    result.splice(h.oldStartLine, h.oldEndLine - h.oldStartLine, ...h.newLines);
  }
  return result;
}

// Cheap structural check: hunks are sorted, non-overlapping, and never empty
// (an empty hunk would be a no-op slot that should have been dropped).
function assertHunksWellFormed(hunks: LineDiffHunk[]) {
  let prevEnd = -1;
  for (const h of hunks) {
    assert.ok(h.oldStartLine <= h.oldEndLine, `bad range: ${h.oldStartLine}..${h.oldEndLine}`);
    assert.ok(h.oldStartLine > prevEnd, `overlap at ${h.oldStartLine}, prevEnd=${prevEnd}`);
    const span = h.oldEndLine - h.oldStartLine;
    assert.ok(span > 0 || h.newLines.length > 0, 'empty hunk');
    prevEnd = h.oldEndLine;
  }
}

const impls: Array<[string, (a: string[], b: string[]) => LineDiffHunk[]]> = [
  ['lcs', computeLineDiffLcs],
  ['myers', computeLineDiffMyers],
];

for (const [name, computeLineDiff] of impls) {
  suite(`lineDiff (${name})`, () => {

    test('identical inputs produce no hunks', () => {
      const a = ['alpha', 'beta', 'gamma'];
      const hunks = computeLineDiff(a, a.slice());
      assert.deepStrictEqual(hunks, []);
    });

    test('both empty produces no hunks', () => {
      assert.deepStrictEqual(computeLineDiff([], []), []);
    });

    test('identical with trailing empty line produces no hunks', () => {
      // Mirrors what `join('\n')` writes when the buffer ends with `\n`.
      const a = ['alpha', 'beta', ''];
      const hunks = computeLineDiff(a, a.slice());
      assert.deepStrictEqual(hunks, []);
    });

    test('identical empty-string-only line produces no hunks', () => {
      const a = [''];
      assert.deepStrictEqual(computeLineDiff(a, a.slice()), []);
    });

    test('pure insertion into empty', () => {
      const a: string[] = [];
      const b = ['x', 'y'];
      const hunks = computeLineDiff(a, b);
      assertHunksWellFormed(hunks);
      assert.deepStrictEqual(applyHunks(a, hunks), b);
    });

    test('pure deletion to empty', () => {
      const a = ['x', 'y'];
      const b: string[] = [];
      const hunks = computeLineDiff(a, b);
      assertHunksWellFormed(hunks);
      assert.deepStrictEqual(applyHunks(a, hunks), b);
    });

    test('mid-document single-line replacement', () => {
      const a = ['a', 'b', 'c', 'd'];
      const b = ['a', 'B', 'c', 'd'];
      const hunks = computeLineDiff(a, b);
      assertHunksWellFormed(hunks);
      assert.deepStrictEqual(applyHunks(a, hunks), b);
      // Important property for cursor preservation: the diff should be
      // localized — not collapse the whole middle into one big replace.
      assert.strictEqual(hunks.length, 1);
      assert.strictEqual(hunks[0].oldStartLine, 1);
      assert.strictEqual(hunks[0].oldEndLine, 2);
    });

    test('pure insertion in the middle', () => {
      const a = ['a', 'b', 'c'];
      const b = ['a', 'NEW', 'b', 'c'];
      const hunks = computeLineDiff(a, b);
      assertHunksWellFormed(hunks);
      assert.deepStrictEqual(applyHunks(a, hunks), b);
      assert.strictEqual(hunks.length, 1);
      assert.strictEqual(hunks[0].oldStartLine, hunks[0].oldEndLine);
    });

    test('pure deletion in the middle', () => {
      const a = ['a', 'b', 'c', 'd'];
      const b = ['a', 'c', 'd'];
      const hunks = computeLineDiff(a, b);
      assertHunksWellFormed(hunks);
      assert.deepStrictEqual(applyHunks(a, hunks), b);
      assert.strictEqual(hunks.length, 1);
      assert.deepStrictEqual(hunks[0].newLines, []);
    });

    test('append at end', () => {
      const a = ['a', 'b'];
      const b = ['a', 'b', 'c', 'd'];
      const hunks = computeLineDiff(a, b);
      assertHunksWellFormed(hunks);
      assert.deepStrictEqual(applyHunks(a, hunks), b);
    });

    test('prepend at start', () => {
      const a = ['c', 'd'];
      const b = ['a', 'b', 'c', 'd'];
      const hunks = computeLineDiff(a, b);
      assertHunksWellFormed(hunks);
      assert.deepStrictEqual(applyHunks(a, hunks), b);
    });

    test('multiple separated changes do not coalesce', () => {
      const a = ['a', 'b', 'c', 'd', 'e'];
      const b = ['a', 'B', 'c', 'D', 'e'];
      const hunks = computeLineDiff(a, b);
      assertHunksWellFormed(hunks);
      assert.deepStrictEqual(applyHunks(a, hunks), b);
      assert.strictEqual(hunks.length, 2);
    });

    test('total replacement', () => {
      const a = ['a', 'b', 'c'];
      const b = ['x', 'y'];
      const hunks = computeLineDiff(a, b);
      assertHunksWellFormed(hunks);
      assert.deepStrictEqual(applyHunks(a, hunks), b);
    });

    test('blank-line equality is structural, not whitespace-collapsed', () => {
      const a = ['a', '', 'b'];
      const b = ['a', '', 'b'];
      assert.deepStrictEqual(computeLineDiff(a, b), []);
    });

    test('case-sensitive equality', () => {
      const a = ['Foo'];
      const b = ['foo'];
      const hunks = computeLineDiff(a, b);
      assert.strictEqual(hunks.length, 1);
      assert.deepStrictEqual(applyHunks(a, hunks), b);
    });

    test('large mostly-identical buffer with single middle change', () => {
      const a: string[] = [];
      for (let i = 0; i < 500; i++) a.push(`line ${i}`);
      const b = a.slice();
      b[250] = 'changed';
      const hunks = computeLineDiff(a, b);
      assertHunksWellFormed(hunks);
      assert.deepStrictEqual(applyHunks(a, hunks), b);
      assert.strictEqual(hunks.length, 1);
      assert.strictEqual(hunks[0].oldStartLine, 250);
      assert.strictEqual(hunks[0].oldEndLine, 251);
    });

    test('moved block', () => {
      const a = ['a', 'b', 'c', 'd', 'e'];
      const b = ['c', 'd', 'a', 'b', 'e'];
      const hunks = computeLineDiff(a, b);
      assertHunksWellFormed(hunks);
      assert.deepStrictEqual(applyHunks(a, hunks), b);
    });

    test('inserts at very start with empty old', () => {
      const a: string[] = [];
      const b = ['only line'];
      const hunks = computeLineDiff(a, b);
      assert.strictEqual(hunks.length, 1);
      assert.strictEqual(hunks[0].oldStartLine, 0);
      assert.strictEqual(hunks[0].oldEndLine, 0);
      assert.deepStrictEqual(hunks[0].newLines, ['only line']);
    });
  });
}

// Cross-check the two implementations on randomized inputs: they must produce
// the same applied result (the hunks themselves can differ — the algorithms
// don't have to agree on which lines to call "the same").
suite('lineDiff (lcs vs myers)', () => {

  function randomLines(rng: () => number, len: number, vocab: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < len; i++) out.push(`L${Math.floor(rng() * vocab)}`);
    return out;
  }

  // Deterministic seeded PRNG so failures reproduce.
  function mulberry32(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  test('100 random pairs apply to the same result', () => {
    const rng = mulberry32(1);
    for (let trial = 0; trial < 100; trial++) {
      const aLen = Math.floor(rng() * 30);
      const bLen = Math.floor(rng() * 30);
      const a = randomLines(rng, aLen, 6);
      const b = randomLines(rng, bLen, 6);

      const hL = computeLineDiffLcs(a, b);
      const hM = computeLineDiffMyers(a, b);

      assert.deepStrictEqual(applyHunks(a, hL), b, `lcs mismatch trial ${trial}`);
      assert.deepStrictEqual(applyHunks(a, hM), b, `myers mismatch trial ${trial}`);
    }
  });
});
