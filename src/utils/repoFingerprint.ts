import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

const REF_FILES = [
  'HEAD', 'MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD',
  'REVERT_HEAD', 'FETCH_HEAD', 'ORIG_HEAD', 'packed-refs',
];

// Cheap content fingerprint over the bits of `.git/` that change when a magit
// view's data would actually differ — HEAD, state-of-operation refs, and the
// loose/packed ref tree. `.git/index` is intentionally excluded: every `git
// status` invocation rewrites its stat cache, so including it would make the
// fingerprint tick on every probe and defeat the dedup.
export async function repoFingerprint(repoFsPath: string): Promise<string> {
  const gitDir = path.join(repoFsPath, '.git');
  const parts: string[] = [];

  for (const name of REF_FILES) {
    parts.push(`${name}:${await readOrEmpty(path.join(gitDir, name))}`);
  }
  parts.push(`refs:${(await collectRefs(path.join(gitDir, 'refs'))).join(';')}`);

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
