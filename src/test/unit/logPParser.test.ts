import * as assert from 'assert';
import { Uri } from 'vscode';
import { parseLogP } from '../../views/logPView';
import { Status } from '../../typings/git';

const ROOT = Uri.parse('file:///repo');

// Mirrors the `--format=%x00%H\x1f%an\x1f%at\x1f%s%n%b%x00` output git
// produces, including the leading/trailing NUL bytes around each commit's
// fields and the patch wedged between consecutive commits.
function buildLog(parts: { hash: string, author: string, time: string, subject: string, body: string, diff: string }[]): string {
  let out = '';
  for (const p of parts) {
    out += '\x00' + p.hash + '\x1f' + p.author + '\x1f' + p.time + '\x1f' + p.subject + '\n' + p.body + '\x00';
    if (p.diff) out += '\n' + p.diff;
  }
  return out;
}

suite('logPView.parseLogP', () => {

  test('empty input', () => {
    assert.deepStrictEqual(parseLogP('', ROOT), []);
  });

  test('single commit with subject only and one file modification', () => {
    const diff = [
      'diff --git a/file.txt b/file.txt',
      'index 1111111..2222222 100644',
      '--- a/file.txt',
      '+++ b/file.txt',
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
      '',
    ].join('\n');

    const stdout = buildLog([
      { hash: 'abc123', author: 'Alice', time: '1700000000', subject: 'fix bug', body: '', diff },
    ]);

    const entries = parseLogP(stdout, ROOT);
    assert.strictEqual(entries.length, 1);
    const e = entries[0];
    assert.strictEqual(e.commit.hash, 'abc123');
    assert.strictEqual(e.author, 'Alice');
    assert.strictEqual(e.commit.message, 'fix bug');
    assert.strictEqual(e.body, '');
    assert.strictEqual(e.changes.length, 1);
    assert.strictEqual(e.changes[0].status, Status.MODIFIED);
    assert.strictEqual(e.changes[0].relativePath, 'file.txt');
  });

  test('commit body with blank lines is preserved without leading subject', () => {
    const diff = [
      'diff --git a/a.txt b/a.txt',
      'new file mode 100644',
      'index 0000000..3333333',
      '--- /dev/null',
      '+++ b/a.txt',
      '@@ -0,0 +1,1 @@',
      '+hi',
      '',
    ].join('\n');

    const stdout = buildLog([
      {
        hash: 'def456', author: 'Bob', time: '1700001000',
        subject: 'add feature',
        body: 'Detail line one.\n\nDetail line two.',
        diff,
      },
    ]);

    const entries = parseLogP(stdout, ROOT);
    assert.strictEqual(entries.length, 1);
    const e = entries[0];
    assert.strictEqual(e.body, 'Detail line one.\n\nDetail line two.');
    assert.strictEqual(e.commit.message, 'add feature\n\nDetail line one.\n\nDetail line two.');
    assert.strictEqual(e.changes.length, 1);
    assert.strictEqual(e.changes[0].status, Status.INDEX_ADDED);
  });

  test('multiple commits parsed independently', () => {
    const diff1 = [
      'diff --git a/x b/x',
      'index 1..2 100644',
      '--- a/x',
      '+++ b/x',
      '@@ -1,1 +1,1 @@',
      '-a',
      '+b',
      '',
    ].join('\n');

    const diff2 = [
      'diff --git a/y b/y',
      'new file mode 100644',
      'index 0..3',
      '--- /dev/null',
      '+++ b/y',
      '@@ -0,0 +1,1 @@',
      '+y',
      '',
    ].join('\n');

    const stdout = buildLog([
      { hash: 'aaa', author: 'A', time: '1', subject: 's1', body: '', diff: diff1 },
      { hash: 'bbb', author: 'B', time: '2', subject: 's2', body: '', diff: diff2 },
    ]);

    const entries = parseLogP(stdout, ROOT);
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].commit.hash, 'aaa');
    assert.strictEqual(entries[1].commit.hash, 'bbb');
    assert.strictEqual(entries[0].changes[0].relativePath, 'x');
    assert.strictEqual(entries[1].changes[0].relativePath, 'y');
  });

  test('commit with no diff (merge / empty) produces no changes', () => {
    const stdout = buildLog([
      { hash: 'merge1', author: 'M', time: '3', subject: 'merge', body: '', diff: '' },
    ]);

    const entries = parseLogP(stdout, ROOT);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].changes.length, 0);
  });
});
