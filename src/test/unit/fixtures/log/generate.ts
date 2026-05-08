// Builds a deterministic throwaway git repo and captures `git log` output
// using the same COMMIT_FORMAT the production code uses, so the parser tests
// can run against bytes git actually produces. The fixture is checked in;
// rerun via `npm run test:gen-fixtures` if you change COMMIT_FORMAT or want
// to cover new shapes.

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { COMMIT_FORMAT } from '../../../../utils/repoStatusParsers';
import { FIXTURES_SRC_DIR } from '../projectRoot';

const FIXTURE_DIR = path.join(FIXTURES_SRC_DIR, 'log');

const baseEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Alice',
  GIT_AUTHOR_EMAIL: 'alice@example.com',
  GIT_COMMITTER_NAME: 'Alice',
  GIT_COMMITTER_EMAIL: 'alice@example.com',
};

function git(cwd: string, args: string[], extraEnv: Record<string, string> = {}): Buffer {
  const result = spawnSync('git', args, { cwd, env: { ...baseEnv, ...extraEnv } });
  if (result.status !== 0) {
    process.stderr.write(result.stderr.toString());
    throw new Error(`git ${args.join(' ')} failed (status ${result.status})`);
  }
  return result.stdout;
}

function commit(cwd: string, message: string, isoDate: string) {
  git(cwd, ['commit', '--allow-empty', '-m', message], {
    GIT_AUTHOR_DATE: isoDate,
    GIT_COMMITTER_DATE: isoDate,
  });
}

function writeFixture(name: string, content: Buffer) {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const target = path.join(FIXTURE_DIR, name);
  fs.writeFileSync(target, content);
  process.stderr.write(`wrote ${content.length} bytes -> ${path.relative(process.cwd(), target)}\n`);
}

function buildBasicLog() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edamagit-fixture-'));
  try {
    git(tmp, ['init', '-q', '-b', 'main']);
    commit(tmp, 'first commit', '2024-01-01T00:00:00+00:00');
    commit(tmp, 'second: subject\n\nbody line one\nbody line two', '2024-01-02T00:00:00+00:00');
    commit(tmp, 'third: trailing whitespace then a tab\there', '2024-01-03T00:00:00+00:00');

    const stdout = git(tmp, ['log', '-n', '10', `--format=${COMMIT_FORMAT}`]);
    writeFixture('basic.log', stdout);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

buildBasicLog();
