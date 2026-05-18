import { Range, workspace, WorkspaceEdit } from 'vscode';
import { View } from './view';
import { MagitRepository } from '../../models/magitRepository';
import { magitFileSystemProvider } from '../../providers/magitFileSystemProvider';
import { MagitUri } from '../../common/magitUri';

export abstract class DocumentView extends View {

  isHighlightable = false;

  needsUpdate: boolean = true;

  constructor(public uri: MagitUri) {
    super();
  }

  public abstract update(state: MagitRepository): void | Promise<void>;

  // Refresh strategy: when the doc is open, push the new content as a
  // WorkspaceEdit. applyEdit routes the full-range replace through
  // computeMoreMinimalEdits, producing small surgical edits — VS Code's
  // edit-tracker then shifts cursor positions naturally instead of collapsing
  // them to the end (which is what `fireChanged` → `readFile` does, since the
  // FS-provider reload path's prefix/suffix diff degenerates to one big
  // middle-range replace). `fireChanged` is still fired so the FS provider
  // bumps mtime; the actual content-reload it triggers is a no-op because the
  // model is now dirty (textFileEditorModelManager skips dirty models).
  public async triggerUpdate() {
    const doc = workspace.textDocuments.find(d => d.uri.toString() === this.uri.toString());
    if (doc) {
      const newContent = this.render(0).join('\n');
      const edit = new WorkspaceEdit();
      edit.replace(this.uri, doc.validateRange(new Range(0, 0, Number.MAX_SAFE_INTEGER, 0)), newContent);
      await workspace.applyEdit(edit);
    }
    magitFileSystemProvider.fireChanged(this.uri);
  }
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