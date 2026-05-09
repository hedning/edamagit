import assert = require('assert');
import { Uri } from 'vscode';
import { MagitChange } from '../models/magitChange';
import { Status, Ref } from '../typings/git';
import { LineSplitterRegex } from '../common/constants';
import GitTextUtils from './gitTextUtils';

/**
 * Only handles repeating filenames, since it's not possible to parse if the name is not repeating
 *
 * This is asserted
 */
function findFileFromHeader(text: string) {
  // Might need to support --cc too?
  const prefix = 'diff --git';
  assert(text.startsWith(prefix), text);

  const double_string = text.slice(prefix.length);
  assert(double_string.length % 2 === 0); // should be 2*(' a|b/'.length + file_name.length)
  const to = double_string.length >> 1; // /2, we've already paid for modulo
  const first = double_string.slice(3, to); // ' a/`.length === 3
  const second = double_string.slice(to + 3);
  assert(first === second);
  return first;
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
  assert(text.startsWith('diff '), text);
  // if (!text.startsWith('* Unmerged path')) {
  //   assert(text.startsWith('diff '), text);
  // }
  assert(text.endsWith('\n'), text);

  // todo: handle this form of new file mode
  // diff --git a/src/commands/mergingCommands.ts b/src/commands/mergingCommands.ts
  // new file mode 100644
  // index 0000000..e69de29

  const startOfHunks = text.indexOf('\n@@');
  // Note, we should really do +1 here, and special -1 to handle \r correctly
  const header = text.slice(0, startOfHunks);
  const headerLines = header.split(LineSplitterRegex);

  // We might want to know if we're in combined mode or in --git mode?
  let status: Status;
  if (text.startsWith('diff --cc')) {
    status = Status.BOTH_MODIFIED;
  } else {
    status = Status.MODIFIED;
  }

  let oldFile: string | null = null;
  let newFile: string | null = null;
  for (let i = 1; i < headerLines.length; i++) {
    const line = headerLines[i];
    if (line.startsWith('new file mode')) {
      // If the file is empty we don't get `---/+++` lines
      newFile = findFileFromHeader(headerLines[0]);
      oldFile = '/dev/null';
      status = Status.INDEX_ADDED;
    }
    else if (line.startsWith('deleted file mode')) {
      oldFile = findFileFromHeader(headerLines[0]);
      newFile = '/dev/null';
      status = Status.DELETED;
    }
    else if (line.startsWith('rename from')) {
      oldFile = line.slice('rename from '.length);
      status = Status.INDEX_RENAMED;
    }
    else if (line.startsWith('rename to')) {
      newFile = line.slice('rename to '.length);
      status = Status.INDEX_RENAMED;
    }
    else if (line.startsWith('---')) oldFile = line.slice('--- a/'.length);
    else if (line.startsWith('+++')) newFile = line.slice('+++ a/'.length);
  }
  if (oldFile === null || newFile === null) { // Fallback for stuff like binary files
    // This will fail if the header doesn't repeat the filename
    newFile = findFileFromHeader(headerLines[0]);
    oldFile = newFile;
  }

  const original = status === Status.DELETED ? oldFile : newFile;
  const rename = status === Status.INDEX_RENAMED ? newFile : undefined;
  const file = rename ? rename : original;

  const originalUri = Uri.joinPath(root, original);
  const renameUri = rename ? Uri.joinPath(root, rename) : undefined;
  const uri = Uri.joinPath(root, file);

  const change: MagitChange = {
    status: status,
    uri: uri,
    originalUri: originalUri, // Yeah, this doesn't really make sense for new files
    renameUri: renameUri,
    relativePath: file,
    diff: text,
    hunks: GitTextUtils.diffToHunks(text, file),
    ref: ref,
  };
  return change;
}

export function diffToMagitChanges(text: string, root: Uri, ref?: Ref): MagitChange[] {
  const changes: MagitChange[] = [];
  // Handle conflicts in diff --staged
  while (text.startsWith('*')) {
    // This should work with both \r\n and \n
    const i = text.indexOf('\n');
    text = text.slice(i + 1);
  }
  while (text.length > 0) {
    let index = text.indexOf('\ndiff ', '\ndiff '.length);
    let changeDiff = text.slice(0, index);
    changeDiff = changeDiff.replace(/^\*.*/, '');
    if (!changeDiff.endsWith('\n')) changeDiff += '\n';
    changes.push(diffToMagitChange(changeDiff, root, ref));

    if (index === -1) break;
    text = text.slice(index + 1);
  }
  return changes;
}
