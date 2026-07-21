import assert = require('assert');
import { Uri } from 'vscode';
import { MagitChange } from '../models/magitChange';
import { Status, Ref } from '../typings/git';
import { LineSplitterRegex } from '../common/constants';
import GitTextUtils from './gitTextUtils';

// Git appends a single trailing tab to `---`/`+++` header lines when the
// filename contains a space, to mark where the name ends. Tabs *within* a
// filename are C-quoted (see unquoteCStyle), so the only raw tab here is that
// delimiter.
function stripTabSuffix(file: string): string {
  return file.endsWith('\t') ? file.slice(0, -1) : file;
}

// Decode a git C-quoted path (`"a/ta\tb.txt"`) back to its literal name. git
// wraps paths containing control characters — or, with core.quotePath on
// (the default), any byte >= 0x80 — in double quotes, escaping \a \b \t \n \v
// \f \r \" \\ and emitting every other byte as octal \NNN. We rebuild the raw
// bytes and UTF-8 decode, so a multibyte name spread across octal escapes
// reassembles correctly.
function unquoteCStyle(quoted: string): string {
  const SIMPLE: { [key: string]: number } = {
    a: 0x07, b: 0x08, t: 0x09, n: 0x0a, v: 0x0b, f: 0x0c, r: 0x0d,
    '"': 0x22, '\\': 0x5c,
  };
  const bytes: number[] = [];
  const pushUtf8 = (ch: string) => { for (const byte of Buffer.from(ch, 'utf8')) { bytes.push(byte); } };

  let i = 1; // skip the opening quote
  while (i < quoted.length && quoted[i] !== '"') {
    const ch = quoted[i];
    if (ch !== '\\') { pushUtf8(ch); i++; continue; }

    const esc = quoted[i + 1];
    if (esc === undefined) { break; } // dangling backslash; git never emits this
    if (esc in SIMPLE) { bytes.push(SIMPLE[esc]); i += 2; continue; }
    if (esc >= '0' && esc <= '7') {
      i++; // skip the backslash
      let octal = '';
      while (octal.length < 3 && quoted[i] >= '0' && quoted[i] <= '7') { octal += quoted[i]; i++; }
      bytes.push(parseInt(octal, 8) & 0xff);
      continue;
    }
    pushUtf8(esc); i += 2; // unknown escape: keep the character literally
  }
  return Buffer.from(bytes).toString('utf8');
}

// git prefixes the working-tree path with `a/` or `b/`; drop it, but leave
// sentinels like /dev/null (and anything else without the prefix) untouched.
function stripABPrefix(path: string): string {
  return path.startsWith('a/') || path.startsWith('b/') ? path.slice(2) : path;
}

// Extract the repo-relative path from the part of a `---`/`+++` line that
// follows the `--- `/`+++ ` marker, handling both the quoted and plain forms.
function parseDiffHeaderPath(afterMarker: string): string {
  const path = afterMarker.startsWith('"') ? unquoteCStyle(afterMarker) : stripTabSuffix(afterMarker);
  return stripABPrefix(path);
}

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

  // Quoted form: ` "a/<path>" "b/<path>"`. unquoteCStyle stops at the first
  // closing quote, so it yields just the `a/<path>` half.
  const trimmed = double_string.trimStart();
  if (trimmed.startsWith('"')) {
    return stripABPrefix(unquoteCStyle(trimmed));
  }

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
      const from = line.slice('rename from '.length);
      oldFile = from.startsWith('"') ? unquoteCStyle(from) : from;
      status = Status.INDEX_RENAMED;
    }
    else if (line.startsWith('rename to')) {
      const to = line.slice('rename to '.length);
      newFile = to.startsWith('"') ? unquoteCStyle(to) : to;
      status = Status.INDEX_RENAMED;
    }
    else if (line.startsWith('---')) oldFile = parseDiffHeaderPath(line.slice('--- '.length));
    else if (line.startsWith('+++')) newFile = parseDiffHeaderPath(line.slice('+++ '.length));
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
