import assert = require('assert');
import { toMagitChange } from '../commands/statusCommands';
import { getRepoUri } from '../commands/visitAtPointCommands';
import { MagitChange } from '../models/magitChange';
import { MagitRepository } from '../models/magitRepository';
import { Repository, Change, Status, Ref } from '../typings/git';
import { IExecutionResult } from './commandRunner/command';
import { gitRun } from './gitRawRunner';
import { LineSplitterRegex } from '../common/constants';
import { Uri } from 'vscode';
import GitTextUtils from './gitTextUtils';

export default class GitUtils {

  public static setConfigVariable(repository: MagitRepository, key: string, val: string): Promise<IExecutionResult<string>> {
    let args = ['config', '--local', key, val];
    return gitRun(repository.gitRepository, args);
  }
}


/**   
 * old mode<mode>
 * new mode<mode>
 * deleted file mode<mode>
 * new file mode<mode>
 * copy from<path>
 * copy to<path>
 * rename from<path>
 * rename to<path>
 * similarity index<number>
 * dissimilarity index<number>
 * index <hash>..< hash > <mode>

 * diff--git
 * diff--combined
 */
export function diffToMagitChange(text: string, root: Uri, ref?: Ref) {
  // This should be pretty fast, as 
  // we try to handle \r by treating it as any other character, ie. we simply search for \n
  // Perhaps just search for \r\n and use that as the splitter if found?
  assert(text.startsWith('diff '));
  assert(text.endsWith('\n'));

  const startOfHunks = text.indexOf('\n@@');
  assert(startOfHunks !== -1); // Lets assume there's at least one hunk
  const header = text.slice(0, startOfHunks);
  const headerLines = header.split(LineSplitterRegex);

  // We might want to know if we're in combined mode or in --git mode?
  let status: Status = Status.MODIFIED;
  let oldFile: string | null = null;
  let newFile: string | null = null;
  for (let i = 1; i < headerLines.length; i++) {
    const line = headerLines[i];
    if (line.startsWith('new file mode')) status = Status.INDEX_ADDED;
    else if (line.startsWith('deleted file mode')) status = Status.DELETED;
    else if (line.startsWith('rename ')) status = Status.INDEX_RENAMED; // this will happen twice
    else if (line.startsWith('---')) oldFile = line.slice('--- a/'.length);
    else if (line.startsWith('+++')) newFile = line.slice('+++ a/'.length);
  }
  assert(newFile); assert(oldFile);

  const original = status === Status.DELETED ? oldFile : newFile;
  const rename = status === Status.INDEX_RENAMED ? newFile : undefined;
  const file = rename ? rename : original;

  const originalUri = Uri.joinPath(root, original);
  const renameUri = rename ? Uri.joinPath(root, rename) : undefined;
  const uri = Uri.joinPath(root, file);

  let change: MagitChange = {
    status: status,
    uri: uri,
    originalUri: originalUri, // Yeah, this doesn't really make sense for new files
    renameUri: renameUri,
    relativePath: file,
    diff: text,
    hunks: GitTextUtils.diffToHunks(text, uri),
    ref: ref,
  };
  return change;
}


export function diffToMagitChanges(text: string, root: Uri, ref?: Ref): MagitChange[] {
  const changes: MagitChange[] = [];
  while (text.length > 0) {
    let index = text.indexOf('\ndiff ', '\ndiff '.length);
    let changeDiff = text.slice(0, index);
    if (!changeDiff.endsWith('\n')) changeDiff += '\n';
    changes.push(diffToMagitChange(changeDiff, root, ref));

    if (index === -1) break;
    text = text.slice(index + 1);
  }
  return changes;
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
