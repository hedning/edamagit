import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { Uri } from 'vscode';
import { resolveGitDir } from './gitDir';

// State-of-operation files are per-worktree; ref storage is shared.
const PER_WORKTREE_STATE_FILES = [
  'HEAD', 'MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD',
  'REVERT_HEAD', 'FETCH_HEAD', 'ORIG_HEAD',
];
const COMMON_STATE_FILES = ['packed-refs'];

// Cheap content fingerprint over the bits of the git dir that change when a
// magit view's data would actually differ — HEAD, state-of-operation refs,
// and the loose/packed ref tree. `index` is intentionally excluded: every
// `git status` invocation rewrites its stat cache, so including it would
// make the fingerprint tick on every probe and defeat the dedup.
export async function repoFingerprint(repoFsPath: string): Promise<string> {
  const { gitDir, commonDir } = await resolveGitDir(Uri.file(repoFsPath));
  const parts: string[] = [];

  for (const name of PER_WORKTREE_STATE_FILES) {
    parts.push(`${name}:${await readOrEmpty(path.join(gitDir.fsPath, name))}`);
  }
  for (const name of COMMON_STATE_FILES) {
    parts.push(`${name}:${await readOrEmpty(path.join(commonDir.fsPath, name))}`);
  }
  parts.push(`refs:${(await collectRefs(path.join(commonDir.fsPath, 'refs'))).join(';')}`);

  return crypto.createHash('sha1').update(parts.join('|')).digest('hex');
}

export function isInsideGitDir(fsPath: string, repoFsPath: string): boolean {
  const rel = path.relative(repoFsPath, fsPath);
  return rel === '.git' || rel.startsWith('.git' + path.sep);
}

async function readOrEmpty(p: string): Promise<string> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return '';
  }
}

async function collectRefs(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const sub of await collectRefs(full)) out.push(entry.name + '/' + sub);
    } else if (entry.isFile()) {
      out.push(`${entry.name}=${(await readOrEmpty(full)).trim()}`);
    }
  }
  return out;
}
