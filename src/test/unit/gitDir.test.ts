import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Uri } from 'vscode';
import { resolveGitDir } from '../../utils/gitDir';

suite('resolveGitDir', () => {
  let tmp: string;

  setup(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'edamagit-gitdir-'));
  });

  teardown(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test('regular repo: gitDir and commonDir both point at <root>/.git', async () => {
    const root = path.join(tmp, 'repo');
    await fs.mkdir(path.join(root, '.git'), { recursive: true });

    const { gitDir, commonDir } = await resolveGitDir(Uri.file(root));

    assert.strictEqual(gitDir.fsPath, path.join(root, '.git'));
    assert.strictEqual(commonDir.fsPath, path.join(root, '.git'));
  });

  test('worktree: gitDir follows .git pointer; commonDir resolves via commondir', async () => {
    const main = path.join(tmp, 'main');
    const wt = path.join(tmp, 'wt');
    const wtGitDir = path.join(main, '.git', 'worktrees', 'wt');
    await fs.mkdir(path.join(main, '.git'), { recursive: true });
    await fs.mkdir(wtGitDir, { recursive: true });
    await fs.mkdir(wt, { recursive: true });
    await fs.writeFile(path.join(wt, '.git'), `gitdir: ${wtGitDir}\n`);
    await fs.writeFile(path.join(wtGitDir, 'commondir'), '../..\n');

    const { gitDir, commonDir } = await resolveGitDir(Uri.file(wt));

    assert.strictEqual(gitDir.fsPath, wtGitDir);
    assert.strictEqual(commonDir.fsPath, path.join(main, '.git'));
  });

  test('worktree with relative gitdir pointer is resolved against the working tree', async () => {
    const main = path.join(tmp, 'main');
    const wt = path.join(tmp, 'wt');
    const wtGitDir = path.join(main, '.git', 'worktrees', 'wt');
    await fs.mkdir(path.join(main, '.git'), { recursive: true });
    await fs.mkdir(wtGitDir, { recursive: true });
    await fs.mkdir(wt, { recursive: true });
    await fs.writeFile(path.join(wt, '.git'), 'gitdir: ../main/.git/worktrees/wt\n');
    await fs.writeFile(path.join(wtGitDir, 'commondir'), '../..\n');

    const { gitDir, commonDir } = await resolveGitDir(Uri.file(wt));

    assert.strictEqual(gitDir.fsPath, wtGitDir);
    assert.strictEqual(commonDir.fsPath, path.join(main, '.git'));
  });

  test('missing .git falls back to <root>/.git for both', async () => {
    const root = path.join(tmp, 'no-git');
    await fs.mkdir(root, { recursive: true });

    const { gitDir, commonDir } = await resolveGitDir(Uri.file(root));

    assert.strictEqual(gitDir.fsPath, path.join(root, '.git'));
    assert.strictEqual(commonDir.fsPath, path.join(root, '.git'));
  });
});
