import * as assert from 'assert';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Uri } from 'vscode';
import { diffToMagitChange, diffToMagitChanges } from '../../utils/diffParser';
import { Status } from '../../typings/git';

const ROOT = Uri.parse('file:///repo');

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Alice',
  GIT_AUTHOR_EMAIL: 'alice@example.com',
  GIT_COMMITTER_NAME: 'Alice',
  GIT_COMMITTER_EMAIL: 'alice@example.com',
};

function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, env: gitEnv, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed (status ${result.status}): ${result.stderr}`);
  }
  return result.stdout;
}

suite('diffParser.diffToMagitChange', () => {

  test('parses a basic modification diff', () => {
    const text = [
      'diff --git a/file.txt b/file.txt',
      'index 1111111..2222222 100644',
      '--- a/file.txt',
      '+++ b/file.txt',
      '@@ -1,2 +1,2 @@',
      ' line one',
      '-old',
      '+new',
      '',
    ].join('\n');

    const change = diffToMagitChange(text, ROOT);
    assert.strictEqual(change.status, Status.MODIFIED);
    assert.strictEqual(change.relativePath, 'file.txt');
    assert.strictEqual(change.renameUri, undefined);
    assert.ok(change.uri.path.endsWith('/repo/file.txt'));
    assert.strictEqual(change.hunks?.length, 1);
  });

  test('detects new file mode', () => {
    const text = [
      'diff --git a/new.txt b/new.txt',
      'new file mode 100644',
      'index 0000000..3333333',
      '--- /dev/null',
      '+++ b/new.txt',
      '@@ -0,0 +1,1 @@',
      '+hello',
      '',
    ].join('\n');

    const change = diffToMagitChange(text, ROOT);
    assert.strictEqual(change.status, Status.INDEX_ADDED);
    assert.strictEqual(change.relativePath, 'new.txt');
  });

  test('detects deleted file mode', () => {
    const text = [
      'diff --git a/gone.txt b/gone.txt',
      'deleted file mode 100644',
      'index 4444444..0000000',
      '--- a/gone.txt',
      '+++ /dev/null',
      '@@ -1,1 +0,0 @@',
      '-bye',
      '',
    ].join('\n');

    const change = diffToMagitChange(text, ROOT);
    assert.strictEqual(change.status, Status.DELETED);
    assert.strictEqual(change.relativePath, 'gone.txt');
  });

  test('detects rename with diff --cc combined mode', () => {
    const text = [
      'diff --cc file.txt',
      'index 1111111,2222222..3333333',
      '--- a/file.txt',
      '+++ b/file.txt',
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
      '',
    ].join('\n');

    const change = diffToMagitChange(text, ROOT);
    assert.strictEqual(change.status, Status.BOTH_MODIFIED);
  });

  test('detects rename', () => {
    const text = [
      'diff --git a/old-name.txt b/new-name.txt',
      'similarity index 90%',
      'rename from old-name.txt',
      'rename to new-name.txt',
      'index 1111111..2222222 100644',
      '--- a/old-name.txt',
      '+++ b/new-name.txt',
      '@@ -1,1 +1,1 @@',
      '-x',
      '+y',
      '',
    ].join('\n');

    const change = diffToMagitChange(text, ROOT);
    assert.strictEqual(change.status, Status.INDEX_RENAMED);
    assert.strictEqual(change.relativePath, 'new-name.txt');
    assert.ok(change.renameUri !== undefined);
    assert.ok(change.renameUri!.path.endsWith('/repo/new-name.txt'));
    // Note: originalUri points at the new path too — see comment in diffToMagitChange
    assert.ok(change.originalUri.path.endsWith('/repo/new-name.txt'));
  });
});

suite('diffParser.diffToMagitChanges', () => {

  test('splits multiple file diffs', () => {
    const text = [
      'diff --git a/a.txt b/a.txt',
      'index 1111111..2222222 100644',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,1 +1,1 @@',
      '-x',
      '+y',
      'diff --git a/b.txt b/b.txt',
      'index 3333333..4444444 100644',
      '--- a/b.txt',
      '+++ b/b.txt',
      '@@ -1,1 +1,1 @@',
      '-foo',
      '+bar',
      '',
    ].join('\n');

    const changes = diffToMagitChanges(text, ROOT);
    assert.strictEqual(changes.length, 2);
    assert.strictEqual(changes[0].relativePath, 'a.txt');
    assert.strictEqual(changes[1].relativePath, 'b.txt');
  });

  test('returns [] for empty input', () => {
    assert.deepStrictEqual(diffToMagitChanges('', ROOT), []);
  });

  test('skips leading "* Unmerged path" lines', () => {
    const text = [
      '* Unmerged path c.txt',
      'diff --git a/a.txt b/a.txt',
      'index 1111111..2222222 100644',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,1 +1,1 @@',
      '-x',
      '+y',
      '',
    ].join('\n');

    const changes = diffToMagitChanges(text, ROOT);
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].relativePath, 'a.txt');
  });
});

// Real git output rather than a handcrafted string: git marks the end of a
// filename containing a space with a trailing tab on the ---/+++ lines. This
// exercises the actual bytes git produces so the parser keeps stripping it.
suite('diffParser with real git output', () => {
  let tmp: string;

  setup(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edamagit-diffparser-'));
    git(tmp, ['init', '-q', '-b', 'main']);
  });

  teardown(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('parses a filename containing a space (trailing tab in header)', () => {
    const name = 'my file.txt';
    fs.writeFileSync(path.join(tmp, name), 'one\ntwo\n');
    git(tmp, ['add', '.']);
    git(tmp, ['commit', '-qm', 'init']);
    fs.writeFileSync(path.join(tmp, name), 'one\nTWO\n');

    const rawDiff = git(tmp, ['diff']);
    // Guard the precondition: git really does append the trailing tab here.
    assert.ok(rawDiff.includes(`--- a/${name}\t`), `expected trailing tab in header:\n${rawDiff}`);

    const changes = diffToMagitChanges(rawDiff, ROOT);
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].relativePath, name);
    assert.ok(changes[0].uri.path.endsWith(`/repo/${name}`));
  });

  // git C-quotes any path containing control characters — or, with
  // core.quotePath on, any byte >= 0x80 — emitting `--- "a/ta\tb.txt"`
  // (double-quoted, tab escaped as backslash-t). The parser decodes it.
  test('parses a filename containing a tab (git C-quotes the path)', () => {
    const name = 'ta\tb.txt';
    fs.writeFileSync(path.join(tmp, name), 'one\ntwo\n');
    git(tmp, ['add', '.']);
    git(tmp, ['commit', '-qm', 'init']);
    fs.writeFileSync(path.join(tmp, name), 'one\nTWO\n');

    const rawDiff = git(tmp, ['diff']);
    // Precondition: git really does C-quote the header for this name.
    assert.ok(rawDiff.includes('--- "a/'), `expected C-quoted header:\n${rawDiff}`);

    const changes = diffToMagitChanges(rawDiff, ROOT);
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].relativePath, name);
    assert.ok(changes[0].uri.path.endsWith(`/repo/${name}`));
  });

  // With core.quotePath on (the default), git octal-escapes every byte >= 0x80,
  // so a UTF-8 name is spread across several `\NNN` escapes that must be
  // reassembled into bytes before decoding (é -> \303\251).
  test('parses a non-ASCII filename (git octal-escapes the UTF-8 bytes)', () => {
    const name = 'résumé.txt';
    fs.writeFileSync(path.join(tmp, name), 'x\n');
    git(tmp, ['add', '.']);
    git(tmp, ['commit', '-qm', 'init']);
    fs.writeFileSync(path.join(tmp, name), 'y\n');

    const rawDiff = git(tmp, ['diff']);
    // Precondition: git emits octal byte escapes, not the raw characters.
    assert.ok(rawDiff.includes('\\303\\251'), `expected octal-escaped header:\n${rawDiff}`);

    const changes = diffToMagitChanges(rawDiff, ROOT);
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].relativePath, name);
    assert.ok(changes[0].uri.path.endsWith(`/repo/${name}`));
  });
});
