import { Uri } from 'vscode';
import { Commit } from '../typings/git';
import { readCommit } from './repoStatus';

const commitCache = new Map<string, Promise<Commit>>();

export function getCommit(rootUri: Uri, hash: string): Promise<Commit> {

  const cached = commitCache.get(hash);
  if (cached) return cached;

  const commitTask = readCommit(rootUri, hash);
  commitCache.set(hash, commitTask);
  return commitTask;
}
