import { Uri } from 'vscode';
import { Commit, Ref, Remote, Submodule } from '../typings/git';
import { gitRunInUri, LogLevel } from './gitRawRunner';
import * as Constants from '../common/constants';
import {
  COMMIT_FORMAT,
  FIELD,
  PorcelainStatus,
  parseCommits,
  parsePorcelainStatus,
  parseRefs,
  parseRemotes,
  parseSubmodulesConfigList,
} from './repoStatusParsers';

/**
 * IO wrappers around direct `git` invocations. Pure parsing lives in
 * `repoStatusParsers.ts`.
 */

export type { PorcelainHead, PorcelainStatus } from './repoStatusParsers';

export async function readPorcelainStatus(rootUri: Uri): Promise<PorcelainStatus> {
  const result = await gitRunInUri(
    rootUri,
    ['status', '--porcelain=v2', '--branch'],
    {},
    LogLevel.None
  );
  return parsePorcelainStatus(result.stdout);
}

export async function readRefs(rootUri: Uri): Promise<Ref[]> {
  const result = await gitRunInUri(
    rootUri,
    ['for-each-ref', `--format=%(refname)${FIELD}%(objectname)${FIELD}%(*objectname)`, 'refs/heads', 'refs/remotes', 'refs/tags'],
    {},
    LogLevel.None
  );
  return parseRefs(result.stdout);
}

export async function readRemotes(rootUri: Uri): Promise<Remote[]> {
  const result = await gitRunInUri(rootUri, ['remote', '-v'], {}, LogLevel.None);
  return parseRemotes(result.stdout);
}

export async function readSubmodules(rootUri: Uri): Promise<Submodule[]> {
  try {
    const result = await gitRunInUri(
      rootUri,
      ['config', '--file', '.gitmodules', '--list'],
      {},
      LogLevel.None
    );
    return parseSubmodulesConfigList(result.stdout);
  } catch {
    return [];
  }
}

export async function readLog(rootUri: Uri, headCommit: string | undefined, maxEntries = 100): Promise<Commit[]> {
  if (!headCommit) return [];
  try {
    const result = await gitRunInUri(
      rootUri,
      ['log', `-n`, String(maxEntries), `--format=${COMMIT_FORMAT}`],
      {},
      LogLevel.None
    );
    return parseCommits(result.stdout);
  } catch {
    return [];
  }
}

export async function readCommit(rootUri: Uri, hash: string): Promise<Commit> {
  const result = await gitRunInUri(
    rootUri,
    ['show', '-s', `--format=${COMMIT_FORMAT}`, hash],
    {},
    LogLevel.None
  );
  const commits = parseCommits(result.stdout);
  if (commits.length === 0) {
    return { hash, message: '', parents: [] };
  }
  return commits[0];
}

export async function readConfig(rootUri: Uri, key: string): Promise<string | undefined> {
  try {
    const result = await gitRunInUri(rootUri, ['config', '--get', key], {}, LogLevel.None);
    return result.stdout.replace(Constants.FinalLineBreakRegex, '');
  } catch {
    return undefined;
  }
}

/**
 * Returns the commit hash currently being applied by an in-progress rebase,
 * if any. Mirrors `RepositoryState.rebaseCommit?.hash` from the git extension.
 */
export async function readRebaseCommitHash(rootUri: Uri): Promise<string | undefined> {
  try {
    const result = await gitRunInUri(
      rootUri,
      ['rev-parse', '--verify', '--quiet', 'REBASE_HEAD'],
      {},
      LogLevel.None
    );
    const hash = result.stdout.replace(Constants.FinalLineBreakRegex, '');
    return hash || undefined;
  } catch {
    return undefined;
  }
}
