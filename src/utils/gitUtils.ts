import { getRepoUri } from '../commands/visitAtPointCommands';
import { MagitRepository } from '../models/magitRepository';
import { Repository, Change, Status } from '../typings/git';
import { IExecutionResult } from './commandRunner/command';
import { gitRun, gitRunInUri } from './gitRawRunner';

export default class GitUtils {

  public static setConfigVariable(repository: MagitRepository, key: string, val: string): Promise<IExecutionResult<string>> {
    let args = ['config', '--local', key, val];
    return gitRunInUri(repository.uri, args);
  }
}

export async function getChanges(repo: Repository, ref: string) {
  const res = await gitRun(repo, ['show', '-z', '--name-status', '--format=', ref]);
  const entries = res.stdout.split('\x00');
  return parseChanges(repo, entries);
}

export function parseChanges(repo: Repository, entries: string[]) {
  let index = 0;
  const result: Change[] = [];
  while (index < entries.length - 1) {
    entriesLoop: while (index < entries.length - 1) {
      const change = entries[index++];
      const resourcePath = entries[index++];
      if (!change || !resourcePath) {
        break;
      }

      const originalUri = getRepoUri(repo, resourcePath);
      let status: Status = Status.UNTRACKED;

      // Copy or Rename status comes with a number, e.g. 'R100'. We don't need the number, so we use only first character of the status.
      switch (change[0]) {
        case 'M':
          status = Status.MODIFIED;
          break;

        case 'A':
          status = Status.INDEX_ADDED;
          break;

        case 'D':
          status = Status.DELETED;
          break;

        // Rename contains two paths, the second one is what the file is renamed/copied to.
        case 'R': {
          if (index >= entries.length) {
            break;
          }

          const newPath = entries[index++];
          if (!newPath) {
            break;
          }

          const uri = getRepoUri(repo, newPath);
          result.push({
            uri,
            renameUri: uri,
            originalUri,
            status: Status.INDEX_RENAMED
          });

          continue;
        }
        default:
          // Unknown status
          break entriesLoop;
      }

      result.push({
        status,
        originalUri,
        uri: originalUri,
        renameUri: originalUri,
      });
    }
  }
  return result;
}
