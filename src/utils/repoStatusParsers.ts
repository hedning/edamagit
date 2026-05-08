import { Commit, Ref, RefType, Remote, Submodule, UpstreamRef } from '../typings/git';
import * as Constants from '../common/constants';

/**
 * Pure parsers for git output used to build a MagitRepository without
 * relying on VSCode's built-in git extension Repository object. The IO
 * wrappers that invoke git live in `repoStatus.ts` — keeping the parsers
 * isolated lets them be unit-tested without pulling in the gitRun chain.
 */

export const FIELD = '\x1f';
export const RECORD = '\x1e';

export interface PorcelainHead {
  name?: string;
  commit?: string;
  upstream?: UpstreamRef;
  ahead?: number;
  behind?: number;
}

export interface PorcelainStatus {
  HEAD: PorcelainHead;
  hasUntracked: boolean;
}

/**
 * Parse `git status --porcelain=v2 --branch` for the bits we care about:
 * HEAD branch / commit / upstream / ahead / behind, and whether any
 * untracked files exist. We do not parse file entries here — diff is
 * sourced via `git diff` and `git diff --staged` elsewhere.
 */
export function parsePorcelainStatus(output: string): PorcelainStatus {
  const HEAD: PorcelainHead = {};
  let hasUntracked = false;

  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length);
      if (head !== '(detached)') HEAD.name = head;
    } else if (line.startsWith('# branch.oid ')) {
      const oid = line.slice('# branch.oid '.length);
      if (oid !== '(initial)') HEAD.commit = oid;
    } else if (line.startsWith('# branch.upstream ')) {
      const upstream = line.slice('# branch.upstream '.length);
      const slash = upstream.indexOf('/');
      if (slash > 0) {
        HEAD.upstream = { remote: upstream.slice(0, slash), name: upstream.slice(slash + 1) };
      }
    } else if (line.startsWith('# branch.ab ')) {
      const ab = line.slice('# branch.ab '.length);
      const m = /^\+(\d+)\s+-(\d+)$/.exec(ab);
      if (m) {
        HEAD.ahead = parseInt(m[1], 10);
        HEAD.behind = parseInt(m[2], 10);
      }
    } else if (line.startsWith('? ')) {
      hasUntracked = true;
    }
  }
  return { HEAD, hasUntracked };
}

export function parseRefs(output: string): Ref[] {
  const refs: Ref[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line) continue;
    const ref = parseRefLine(line);
    if (ref) refs.push(ref);
  }
  return refs;
}

function parseRefLine(line: string): Ref | undefined {
  // `<refname>\x1f<objectname>\x1f<*objectname>` — peeled is empty for non-tags
  const parts = line.split(FIELD);
  if (parts.length < 2) return undefined;
  const refname = parts[0];
  const objectname = parts[1];
  const peeled = parts[2] ?? '';

  if (refname.startsWith('refs/heads/')) {
    return { type: RefType.Head, name: refname.slice('refs/heads/'.length), commit: objectname };
  }
  if (refname.startsWith('refs/remotes/')) {
    const fullName = refname.slice('refs/remotes/'.length);
    const slash = fullName.indexOf('/');
    if (slash <= 0) return undefined;
    return { type: RefType.RemoteHead, name: fullName, commit: objectname, remote: fullName.slice(0, slash) };
  }
  if (refname.startsWith('refs/tags/')) {
    return { type: RefType.Tag, name: refname.slice('refs/tags/'.length), commit: peeled || objectname };
  }
  return undefined;
}

export function parseRemotes(output: string): Remote[] {
  // `git remote -v` emits two lines per remote: `<name>\t<url> (fetch|push)`
  const map = new Map<string, { fetchUrl?: string; pushUrl?: string }>();
  for (const line of output.split(/\r?\n/)) {
    if (!line) continue;
    const m = /^(\S+)\t(.+) \((fetch|push)\)$/.exec(line);
    if (!m) continue;
    const [, name, url, kind] = m;
    const entry = map.get(name) ?? {};
    if (kind === 'fetch') entry.fetchUrl = url;
    else entry.pushUrl = url;
    map.set(name, entry);
  }
  return Array.from(map.entries()).map(([name, urls]) => ({
    name,
    fetchUrl: urls.fetchUrl,
    pushUrl: urls.pushUrl,
    isReadOnly: false,
  }));
}

export function parseSubmodulesIni(text: string): Submodule[] {
  // Minimal .gitmodules parser. Sections look like:
  //   [submodule "name"]
  //       path = foo
  //       url = https://...
  const result: Submodule[] = [];
  let current: { name?: string; path?: string; url?: string } | undefined;
  const flush = () => {
    if (current?.name && current.path !== undefined && current.url !== undefined) {
      result.push({ name: current.name, path: current.path, url: current.url });
    }
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const sectionMatch = /^\[submodule\s+"([^"]+)"\]$/.exec(line);
    if (sectionMatch) {
      flush();
      current = { name: sectionMatch[1] };
      continue;
    }
    if (line.startsWith('[')) {
      flush();
      current = undefined;
      continue;
    }
    if (!current) continue;
    const kv = /^([\w-]+)\s*=\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, value] = kv;
    if (key === 'path') current.path = value;
    else if (key === 'url') current.url = value;
  }
  flush();
  return result;
}

export function parseSubmodulesConfigList(output: string): Submodule[] {
  // Output of `git config --file .gitmodules --list` is one
  // `submodule.<name>.<key>=<value>` line per setting.
  const map = new Map<string, { path?: string; url?: string }>();
  for (const line of output.split(/\r?\n/)) {
    if (!line) continue;
    const m = /^submodule\.(.+)\.([\w-]+)=(.*)$/.exec(line);
    if (!m) continue;
    const [, name, key, value] = m;
    const entry = map.get(name) ?? {};
    if (key === 'path') entry.path = value;
    else if (key === 'url') entry.url = value;
    map.set(name, entry);
  }
  return Array.from(map.entries())
    .filter(([, v]) => v.path !== undefined && v.url !== undefined)
    .map(([name, v]) => ({ name, path: v.path!, url: v.url! }));
}

export const COMMIT_FORMAT = `format:%H${FIELD}%P${FIELD}%an${FIELD}%ae${FIELD}%aI${FIELD}%cI${FIELD}%B${RECORD}`;

export function parseCommits(output: string): Commit[] {
  const records = output.split(RECORD);
  const commits: Commit[] = [];
  for (const raw of records) {
    // `git log --format=format:...` inserts a newline between commits when
    // the format doesn't end with one, so all records except the first start
    // with `\n`. Strip leading newlines so they don't end up in the hash.
    const record = raw.replace(/^\r?\n+/, '').replace(Constants.FinalLineBreakRegex, '');
    if (!record) continue;
    const f = record.split(FIELD);
    if (f.length < 7) continue;
    commits.push({
      hash: f[0],
      parents: f[1].length > 0 ? f[1].split(' ') : [],
      authorName: f[2],
      authorEmail: f[3],
      authorDate: f[4] ? new Date(f[4]) : undefined,
      commitDate: f[5] ? new Date(f[5]) : undefined,
      message: stripTrailingNewlines(f[6]),
    });
  }
  return commits;
}

function stripTrailingNewlines(s: string): string {
  return s.replace(/\n+$/, '');
}
