import { Range, TextDocument, workspace, WorkspaceEdit } from 'vscode';
import { View } from './view';
import { MagitRepository } from '../../models/magitRepository';
import { magitFileSystemProvider } from '../../providers/magitFileSystemProvider';
import { MagitUri } from '../../common/magitUri';
import { computeLineDiff, LineDiffHunk } from '../../utils/lineDiff';

export abstract class DocumentView extends View {

  isHighlightable = false;

  needsUpdate: boolean = true;

  constructor(public uri: MagitUri) {
    super();
  }

  public abstract update(state: MagitRepository): void | Promise<void>;

  // Refresh strategy: compute a line-level diff against the open document and
  // push the resulting hunks as a multi-edit `WorkspaceEdit`. The FS-provider
  // reload path's prefix/suffix diff collapses any middle change into one big
  // replace, which pushes the cursor to the end of the file. So does
  // `applyEdit` with a single full-range replace, because VS Code skips
  // `computeMoreMinimalEdits` for read-only editors. Supplying already-minimal
  // per-line edits sidesteps both and lets the model's edit-tracker shift
  // cursor positions through inserts/deletes naturally. `fireChanged` is fired
  // only when there are actual diffs (so the FS provider's mtime advances); a
  // no-op refresh skips it to avoid spurious reloads.
  public async triggerUpdate() {
    const doc = workspace.textDocuments.find(d => d.uri.toString() === this.uri.toString());
    if (doc) {
      const oldLines: string[] = [];
      for (let i = 0; i < doc.lineCount; i++) oldLines.push(doc.lineAt(i).text);
      const hunks = computeLineDiff(oldLines, this.render(0));
      if (hunks.length > 0) {
        const edit = new WorkspaceEdit();
        for (const h of hunks) {
          const e = hunkToEdit(h, doc);
          if (e) edit.replace(this.uri, e.range, e.text);
        }
        await workspace.applyEdit(edit);
        magitFileSystemProvider.fireChanged(this.uri);
      }
    } else {
      magitFileSystemProvider.fireChanged(this.uri);
    }
  }
}

function hunkToEdit(hunk: LineDiffHunk, doc: TextDocument): { range: Range, text: string } | undefined {
  const N = doc.lineCount;
  const { oldStartLine, oldEndLine, newLines } = hunk;

  if (oldStartLine === oldEndLine && newLines.length === 0) return undefined;

  if (oldEndLine < N) {
    // Common case: end the range at the start of the surviving next line, and
    // include a trailing newline in the replacement so the separator survives.
    return {
      range: new Range(oldStartLine, 0, oldEndLine, 0),
      text: newLines.length > 0 ? newLines.join('\n') + '\n' : ''
    };
  }

  // Hunk touches end-of-document. Last-line handling has no `\n` after it.
  if (oldStartLine === N) {
    // Pure insertion past the last line — must be non-empty.
    const last = doc.lineAt(N - 1).text.length;
    return {
      range: new Range(N - 1, last, N - 1, last),
      text: '\n' + newLines.join('\n')
    };
  }

  if (newLines.length > 0) {
    return {
      range: new Range(oldStartLine, 0, N - 1, doc.lineAt(N - 1).text.length),
      text: newLines.join('\n')
    };
  }

  // Pure deletion through end-of-doc: also consume the `\n` before
  // `oldStartLine` (if there is one) so we don't leave a trailing newline.
  if (oldStartLine === 0) {
    return {
      range: new Range(0, 0, N - 1, doc.lineAt(N - 1).text.length),
      text: ''
    };
  }
  return {
    range: new Range(oldStartLine - 1, doc.lineAt(oldStartLine - 1).text.length, N - 1, doc.lineAt(N - 1).text.length),
    text: ''
  };
}

// Per-view factory. Owns the encode side (`buildUri`) and identifies the
// view kind by `authority`. Each view file exports one of these alongside
// its class.
//
// `TArgs` is whatever extra inputs the live "open this view" path needs
// beyond the repo — revs+args for log, a commit for commit-detail, a section
// for section-diff. For rebuild-from-URI to work, all of `TArgs` must be
// recoverable from the URI alone.
export interface ViewKind<TArgs extends any[] = any[]> {
  authority: string;
  buildUri(repo: MagitRepository, ...args: TArgs): MagitUri;
}

// Stronger contract: the view can be rebuilt from URI alone. `build` is the
// single constructor used by both the fresh-open path and the FS provider's
// rebuild path — they're the same operation, and the live caller just
// happens to have constructed the URI a moment earlier.
//
// Returning `undefined` is honest: the URI's repo couldn't be located, etc.
// Only `RebuildableViewKind`s can be passed to `provider.register`.
export interface RebuildableViewKind<TArgs extends any[] = any[]> extends ViewKind<TArgs> {
  build(uri: MagitUri): Promise<DocumentView | undefined>;
}