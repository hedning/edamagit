import * as assert from 'assert';
import { Uri } from 'vscode';
import { diffToMagitChange, diffToMagitChanges } from '../../utils/diffParser';
import { Status } from '../../typings/git';

const ROOT = Uri.parse('file:///repo');

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
