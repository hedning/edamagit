import * as assert from 'assert';
import { suite, test } from 'mocha';
import { Uri } from 'vscode';
import GitTextUtils, { getStatusText } from '../../utils/gitTextUtils';
import { Status } from '../../typings/git';

suite('gitTextUtils', () => {

  suite('getStatusText', () => {
    test('maps MODIFIED to unstaged', () => {
      assert.strictEqual(getStatusText(Status.MODIFIED), 'unstaged');
    });

    test('maps INDEX_MODIFIED to staged', () => {
      assert.strictEqual(getStatusText(Status.INDEX_MODIFIED), 'staged');
    });

    test('maps INDEX_ADDED to staged', () => {
      assert.strictEqual(getStatusText(Status.INDEX_ADDED), 'staged');
    });

    test('maps UNTRACKED to untracked', () => {
      assert.strictEqual(getStatusText(Status.UNTRACKED), 'untracked');
    });

    test('falls back to numeric string for other statuses', () => {
      assert.strictEqual(getStatusText(Status.DELETED), `${Status.DELETED}`);
    });
  });

  suite('diffToHunks', () => {
    const relativePath = 'file.txt';

    test('returns [] when no hunk header is present', () => {
      const result = GitTextUtils.diffToHunks('diff --git a/x b/x\nindex 111..222\n', relativePath);
      assert.deepStrictEqual(result, []);
    });

    test('parses a single hunk', () => {
      const diff = [
        'diff --git a/file.txt b/file.txt',
        'index 1111111..2222222 100644',
        '--- a/file.txt',
        '+++ b/file.txt',
        '@@ -1,3 +1,3 @@',
        ' line one',
        '-line two',
        '+line TWO',
        ' line three',
        '',
      ].join('\n');

      const hunks = GitTextUtils.diffToHunks(diff, relativePath);
      assert.strictEqual(hunks.length, 1);
      assert.ok(hunks[0].diffHeader.startsWith('diff --git'));
      assert.ok(hunks[0].diff.startsWith('@@ -1,3 +1,3 @@'));
      assert.strictEqual(hunks[0].relativePath, relativePath);
    });

    test('splits multiple hunks on the @@ boundary', () => {
      const diff = [
        'diff --git a/file.txt b/file.txt',
        'index 1111111..2222222 100644',
        '--- a/file.txt',
        '+++ b/file.txt',
        '@@ -1,3 +1,3 @@',
        ' a',
        '-b',
        '+B',
        ' c',
        '@@ -10,3 +10,3 @@',
        ' x',
        '-y',
        '+Y',
        ' z',
      ].join('\n');

      const hunks = GitTextUtils.diffToHunks(diff, relativePath);
      assert.strictEqual(hunks.length, 2);
      assert.ok(hunks[0].diff.startsWith('@@ -1,3 +1,3 @@'));
      assert.ok(hunks[1].diff.startsWith('@@ -10,3 +10,3 @@'));
      // Both share the same diff header
      assert.strictEqual(hunks[0].diffHeader, hunks[1].diffHeader);
    });
  });

  suite('parseConflictStatuses', () => {
    test('parses each XY conflict code to the right Status', () => {
      const input = [
        'DD a',
        'AU b',
        'UD c',
        'UA d',
        'DU e',
        'AA f',
        'UU g',
      ].join('\0') + '\0';
      const map = GitTextUtils.parseConflictStatuses(input);
      assert.strictEqual(map.size, 7);
      assert.strictEqual(map.get('a'), Status.BOTH_DELETED);
      assert.strictEqual(map.get('b'), Status.ADDED_BY_US);
      assert.strictEqual(map.get('c'), Status.DELETED_BY_THEM);
      assert.strictEqual(map.get('d'), Status.ADDED_BY_THEM);
      assert.strictEqual(map.get('e'), Status.DELETED_BY_US);
      assert.strictEqual(map.get('f'), Status.BOTH_ADDED);
      assert.strictEqual(map.get('g'), Status.BOTH_MODIFIED);
    });

    test('ignores non-conflict porcelain entries', () => {
      const input = ' M file.ts\0M  staged.ts\0?? new.ts\0DU conflict.ts\0';
      const map = GitTextUtils.parseConflictStatuses(input);
      assert.strictEqual(map.size, 1);
      assert.strictEqual(map.get('conflict.ts'), Status.DELETED_BY_US);
    });

    test('skips the trailing old path of a rename entry', () => {
      // R staged rename: "R  newname\0oldname\0", followed by a conflict entry
      const input = 'R  new.ts\0old.ts\0DU conflict.ts\0';
      const map = GitTextUtils.parseConflictStatuses(input);
      assert.strictEqual(map.size, 1);
      assert.strictEqual(map.get('conflict.ts'), Status.DELETED_BY_US);
      assert.strictEqual(map.has('old.ts'), false);
    });

    test('handles paths containing spaces', () => {
      const input = 'DU path with spaces.ts\0';
      const map = GitTextUtils.parseConflictStatuses(input);
      assert.strictEqual(map.get('path with spaces.ts'), Status.DELETED_BY_US);
    });

    test('returns empty map for empty input', () => {
      assert.strictEqual(GitTextUtils.parseConflictStatuses('').size, 0);
    });
  });

  suite('parseMergeStatus', () => {
    test('extracts merging branches and trims trailing newline from MERGE_HEAD', () => {
      const head = 'abc1234\n';
      const message = "Merge branch 'feature/foo' into 'develop'";
      const result = GitTextUtils.parseMergeStatus(head, message);
      assert.deepStrictEqual(result, ['abc1234', ['feature/foo', 'develop']]);
    });

    test('returns undefined when message has no quoted branches', () => {
      const result = GitTextUtils.parseMergeStatus('abc1234\n', 'no branches mentioned');
      assert.strictEqual(result, undefined);
    });
  });

  suite('parseRevListLeftRight', () => {
    test('separates < and > prefixed commits, ignoring others', () => {
      const input = '<aaa\n>bbb\n<ccc\nignored\n>ddd\n';
      const [left, right] = GitTextUtils.parseRevListLeftRight(input);
      assert.deepStrictEqual(left, ['aaa', 'ccc']);
      assert.deepStrictEqual(right, ['bbb', 'ddd']);
    });

    test('handles empty input', () => {
      const [left, right] = GitTextUtils.parseRevListLeftRight('');
      assert.deepStrictEqual(left, []);
      assert.deepStrictEqual(right, []);
    });

    test('handles CRLF line endings', () => {
      const input = '<aaa\r\n>bbb\r\n';
      const [left, right] = GitTextUtils.parseRevListLeftRight(input);
      assert.deepStrictEqual(left, ['aaa']);
      assert.deepStrictEqual(right, ['bbb']);
    });
  });

  suite('parseSequencerTodo', () => {
    test('returns [] for undefined input', () => {
      assert.deepStrictEqual(GitTextUtils.parseSequencerTodo(undefined), []);
    });

    test('skips comment lines and parses todo entries', () => {
      const todo = [
        '# Sequencer commands:',
        'pick abc1234 first commit message',
        'pick def5678 another commit',
        '# more comments',
      ].join('\n');

      const commits = GitTextUtils.parseSequencerTodo(todo);
      assert.strictEqual(commits.length, 2);
      assert.strictEqual(commits[0].hash, 'abc1234');
      assert.strictEqual(commits[0].message, 'first commit message');
      assert.deepStrictEqual(commits[0].parents, []);
      assert.strictEqual(commits[1].hash, 'def5678');
      assert.strictEqual(commits[1].message, 'another commit');
    });
  });

  suite('commitDetailTextToCommit', () => {
    test('parses From/Subject/From: lines from a format-patch style commit', () => {
      const text = [
        'From abcdef1234567890 Mon Sep 17 00:00:00 2001',
        'From: Jane Doe <jane@example.com>',
        'Date: Fri, 1 Jan 2021 00:00:00 +0000',
        'Subject: [PATCH] add awesome feature',
        '',
        'body',
      ].join('\n');

      const commit = GitTextUtils.commitDetailTextToCommit(text);
      assert.strictEqual(commit.hash, 'abcdef1234567890');
      assert.strictEqual(commit.message, '[PATCH] add awesome feature');
      assert.strictEqual(commit.authorEmail, 'Jane Doe');
      assert.deepStrictEqual(commit.parents, []);
    });

    test('returns empty fields when patterns are missing', () => {
      const commit = GitTextUtils.commitDetailTextToCommit('garbage');
      assert.strictEqual(commit.hash, '');
      assert.strictEqual(commit.message, '');
      assert.strictEqual(commit.authorEmail, '');
    });
  });

  suite('remoteBranchFullNameToSegments', () => {
    test('splits "remote/branch"', () => {
      assert.deepStrictEqual(
        GitTextUtils.remoteBranchFullNameToSegments('origin/main'),
        ['origin', 'main']);
    });

    test('keeps slashes in the branch portion', () => {
      assert.deepStrictEqual(
        GitTextUtils.remoteBranchFullNameToSegments('origin/feature/x'),
        ['origin', 'feature/x']);
    });

    test('returns ["", ""] for undefined input', () => {
      assert.deepStrictEqual(
        GitTextUtils.remoteBranchFullNameToSegments(undefined),
        ['', '']);
    });
  });

  suite('shortHash', () => {
    test('returns first 7 chars', () => {
      assert.strictEqual(GitTextUtils.shortHash('abcdef1234567890'), 'abcdef1');
    });

    test('returns empty string for undefined', () => {
      assert.strictEqual(GitTextUtils.shortHash(undefined), '');
    });

    test('returns full hash if shorter than 7 chars', () => {
      assert.strictEqual(GitTextUtils.shortHash('abc'), 'abc');
    });
  });

  suite('shortCommitMessage', () => {
    test('returns first line of multiline message', () => {
      assert.strictEqual(
        GitTextUtils.shortCommitMessage('first line\nsecond line\nthird'),
        'first line');
    });

    test('returns empty string for undefined', () => {
      assert.strictEqual(GitTextUtils.shortCommitMessage(undefined), '');
    });
  });

  suite('formatError', () => {
    test('strips "error: " prefix from message', () => {
      assert.strictEqual(
        GitTextUtils.formatError({ message: 'error: something broke' }),
        'something broke');
    });

    test('prefers friendlyMessage over stderr and message', () => {
      assert.strictEqual(
        GitTextUtils.formatError({
          friendlyMessage: 'be nice',
          stderr: 'noisy',
          message: 'raw',
        }),
        'be nice');
    });

    test('truncates very long messages with ellipsis', () => {
      const long = 'x'.repeat(500);
      const out = GitTextUtils.formatError({ message: long });
      assert.strictEqual(out.length, 350);
      assert.ok(out.endsWith('...'));
    });
  });
});
