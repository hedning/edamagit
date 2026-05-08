import * as assert from 'assert';
import { suite, test } from 'mocha';
import { Uri } from 'vscode';
import { parseWorktreeList } from '../../utils/worktreeParsers';

suite('worktreeParsers', () => {

  suite('parseWorktreeList', () => {
    test('parses a main worktree on a branch and a detached worktree', () => {
      const out = [
        'worktree /repo/main',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /repo/detached',
        'HEAD def456',
        'detached',
        '',
      ].join('\n');
      const wts = parseWorktreeList(out);
      assert.strictEqual(wts.length, 2);
      assert.strictEqual(wts[0].path.fsPath, Uri.file('/repo/main').fsPath);
      assert.strictEqual(wts[0].head, 'abc123');
      assert.strictEqual(wts[0].branch, 'main');
      assert.strictEqual(wts[0].detached, false);
      assert.strictEqual(wts[1].path.fsPath, Uri.file('/repo/detached').fsPath);
      assert.strictEqual(wts[1].head, 'def456');
      assert.strictEqual(wts[1].branch, undefined);
      assert.strictEqual(wts[1].detached, true);
    });

    test('parses bare, locked and prunable flags', () => {
      const out = [
        'worktree /repo/bare',
        'bare',
        '',
        'worktree /repo/locked',
        'HEAD aaa',
        'branch refs/heads/topic',
        'locked needs review',
        '',
        'worktree /repo/pruned',
        'HEAD bbb',
        'detached',
        'prunable gitdir file points to non-existent location',
        '',
      ].join('\n');
      const wts = parseWorktreeList(out);
      assert.strictEqual(wts.length, 3);
      assert.strictEqual(wts[0].bare, true);
      assert.strictEqual(wts[1].locked, 'needs review');
      assert.strictEqual(wts[2].prunable, 'gitdir file points to non-existent location');
    });

    test('handles trailing newline without an empty separator', () => {
      const out = 'worktree /repo/main\nHEAD abc\nbranch refs/heads/main\n';
      const wts = parseWorktreeList(out);
      assert.strictEqual(wts.length, 1);
      assert.strictEqual(wts[0].branch, 'main');
    });
  });
});
