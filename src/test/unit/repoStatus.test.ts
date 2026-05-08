import * as assert from 'assert';
import { suite, test } from 'mocha';
import { RefType } from '../../typings/git';
import {
  parsePorcelainStatus,
  parseRefs,
  parseRemotes,
  parseSubmodulesIni,
  parseSubmodulesConfigList,
  parseCommits,
} from '../../utils/repoStatusParsers';

const FIELD = '\x1f';
const RECORD = '\x1e';

suite('repoStatus', () => {

  suite('parsePorcelainStatus', () => {
    test('parses branch info, upstream and ab counts', () => {
      const out = [
        '# branch.oid abc123',
        '# branch.head main',
        '# branch.upstream origin/main',
        '# branch.ab +2 -3',
        '1 .M N... 100644 100644 100644 1111 2222 file.txt',
      ].join('\n');
      const { HEAD, hasUntracked } = parsePorcelainStatus(out);
      assert.strictEqual(HEAD.commit, 'abc123');
      assert.strictEqual(HEAD.name, 'main');
      assert.deepStrictEqual(HEAD.upstream, { remote: 'origin', name: 'main' });
      assert.strictEqual(HEAD.ahead, 2);
      assert.strictEqual(HEAD.behind, 3);
      assert.strictEqual(hasUntracked, false);
    });

    test('handles detached HEAD and (initial) oid', () => {
      const out = [
        '# branch.oid (initial)',
        '# branch.head (detached)',
      ].join('\n');
      const { HEAD } = parsePorcelainStatus(out);
      assert.strictEqual(HEAD.name, undefined);
      assert.strictEqual(HEAD.commit, undefined);
    });

    test('detects untracked files', () => {
      const out = [
        '# branch.head main',
        '? new.txt',
      ].join('\n');
      const { hasUntracked } = parsePorcelainStatus(out);
      assert.strictEqual(hasUntracked, true);
    });

    test('handles upstream names containing slashes', () => {
      const out = [
        '# branch.head feature',
        '# branch.upstream origin/topic/sub',
      ].join('\n');
      const { HEAD } = parsePorcelainStatus(out);
      assert.deepStrictEqual(HEAD.upstream, { remote: 'origin', name: 'topic/sub' });
    });
  });

  suite('parseRefs', () => {
    test('parses heads, remotes, and tags', () => {
      const lines = [
        `refs/heads/main${FIELD}aaaa${FIELD}`,
        `refs/remotes/origin/main${FIELD}bbbb${FIELD}`,
        `refs/tags/v1${FIELD}cccc${FIELD}dddd`, // annotated tag, peeled commit
        `refs/tags/light${FIELD}eeee${FIELD}`,
      ].join('\n');
      const refs = parseRefs(lines);
      assert.deepStrictEqual(refs, [
        { type: RefType.Head, name: 'main', commit: 'aaaa' },
        { type: RefType.RemoteHead, name: 'origin/main', commit: 'bbbb', remote: 'origin' },
        { type: RefType.Tag, name: 'v1', commit: 'dddd' },
        { type: RefType.Tag, name: 'light', commit: 'eeee' },
      ]);
    });

    test('skips unknown ref namespaces', () => {
      const lines = `refs/stash${FIELD}aaaa${FIELD}`;
      assert.deepStrictEqual(parseRefs(lines), []);
    });
  });

  suite('parseRemotes', () => {
    test('merges fetch and push lines for the same remote', () => {
      const out = [
        'origin\tgit@github.com:foo/bar.git (fetch)',
        'origin\tgit@github.com:foo/bar.git (push)',
        'fork\thttps://example.com/x.git (fetch)',
        'fork\thttps://elsewhere.com/x.git (push)',
      ].join('\n');
      const remotes = parseRemotes(out);
      assert.deepStrictEqual(remotes, [
        { name: 'origin', fetchUrl: 'git@github.com:foo/bar.git', pushUrl: 'git@github.com:foo/bar.git', isReadOnly: false },
        { name: 'fork', fetchUrl: 'https://example.com/x.git', pushUrl: 'https://elsewhere.com/x.git', isReadOnly: false },
      ]);
    });
  });

  suite('parseSubmodulesIni', () => {
    test('parses .gitmodules entries', () => {
      const ini = [
        '[submodule "deps/foo"]',
        '\tpath = deps/foo',
        '\turl = https://example.com/foo.git',
        '[submodule "deps/bar"]',
        '\tpath = deps/bar',
        '\turl = https://example.com/bar.git',
      ].join('\n');
      const subs = parseSubmodulesIni(ini);
      assert.deepStrictEqual(subs, [
        { name: 'deps/foo', path: 'deps/foo', url: 'https://example.com/foo.git' },
        { name: 'deps/bar', path: 'deps/bar', url: 'https://example.com/bar.git' },
      ]);
    });

    test('ignores incomplete entries', () => {
      const ini = '[submodule "x"]\npath = onlyPath\n';
      assert.deepStrictEqual(parseSubmodulesIni(ini), []);
    });
  });

  suite('parseSubmodulesConfigList', () => {
    test('builds entries from `git config --file .gitmodules --list` output', () => {
      const out = [
        'submodule.deps/foo.path=deps/foo',
        'submodule.deps/foo.url=https://example.com/foo.git',
        'submodule.bar.path=bar',
        'submodule.bar.url=https://example.com/bar.git',
        'submodule.bar.branch=main',
      ].join('\n');
      const subs = parseSubmodulesConfigList(out);
      assert.deepStrictEqual(subs, [
        { name: 'deps/foo', path: 'deps/foo', url: 'https://example.com/foo.git' },
        { name: 'bar', path: 'bar', url: 'https://example.com/bar.git' },
      ]);
    });
  });

  suite('parseCommits', () => {
    test('parses two commits with delimited fields', () => {
      const a = ['aaaa', 'pp1 pp2', 'Alice', 'a@x', '2024-01-01T00:00:00Z', '2024-01-01T01:00:00Z', 'first\n\nbody\n'].join(FIELD);
      const b = ['bbbb', '', 'Bob', 'b@x', '2024-02-02T00:00:00Z', '2024-02-02T01:00:00Z', 'second'].join(FIELD);
      const out = a + RECORD + b + RECORD;
      const commits = parseCommits(out);
      assert.strictEqual(commits.length, 2);
      assert.strictEqual(commits[0].hash, 'aaaa');
      assert.deepStrictEqual(commits[0].parents, ['pp1', 'pp2']);
      assert.strictEqual(commits[0].authorName, 'Alice');
      assert.strictEqual(commits[0].authorEmail, 'a@x');
      assert.strictEqual(commits[0].message, 'first\n\nbody');
      assert.strictEqual(commits[1].hash, 'bbbb');
      assert.deepStrictEqual(commits[1].parents, []);
      assert.strictEqual(commits[1].message, 'second');
    });

    test('strips git-inserted leading newlines between records', () => {
      // `git log --format=format:...%B${RECORD}` outputs `record\n\x1e\nrecord\n\x1e\n…`
      // because git terminates each commit with `\n` when the format doesn't.
      // Without stripping the leading `\n`, the next record's hash field
      // gets a `\n` prepended and pollutes downstream rendering.
      const a = ['aaaa', '', 'Alice', 'a@x', '2024-01-01T00:00:00Z', '2024-01-01T01:00:00Z', 'first\n'].join(FIELD);
      const b = ['bbbb', '', 'Bob', 'b@x', '2024-02-02T00:00:00Z', '2024-02-02T01:00:00Z', 'second\n'].join(FIELD);
      const out = a + RECORD + '\n' + b + RECORD + '\n';
      const commits = parseCommits(out);
      assert.strictEqual(commits.length, 2);
      assert.strictEqual(commits[0].hash, 'aaaa');
      assert.strictEqual(commits[1].hash, 'bbbb');
      assert.strictEqual(commits[1].message, 'second');
    });
  });
});
