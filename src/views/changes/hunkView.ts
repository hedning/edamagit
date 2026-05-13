import { Range } from 'vscode';
import { MagitChangeHunk } from '../../models/magitChangeHunk';
import { Ref } from '../../typings/git';
import { Section } from '../general/sectionHeader';
import { TextView } from '../general/textView';
import { DecoratableView, DecorationKind, DecorationRange } from '../general/decoratableView';
import * as Constants from '../../common/constants';

// Renders a hunk with the leading +/-/space stripped — the patch character
// at column 0 is line metadata, not source content, and trips up grep, copy,
// and indentation. The raw patch stays on `changeHunk.diff` for stage/apply/
// discard; only the on-screen text is stripped. Added/removed lines are
// reported as `DecorationRange`s so the decoration provider can paint them.
export class HunkView extends TextView implements DecoratableView {
  isFoldable = true;

  private _decorations: DecorationRange[] = [];

  get id() { return this.changeHunk.diff; }

  constructor(public section: Section, public changeHunk: MagitChangeHunk, public ref?: Ref) {
    // textContent is unused — `render` derives display text from the patch.
    super('');
  }

  render(startLineNumber: number): string[] {
    this.retrieveFold();
    this._decorations = [];

    const rawLines = this.changeHunk.diff.split(Constants.LineSplitterRegex);
    const displayLines: string[] = new Array(rawLines.length);

    for (let i = 0; i < rawLines.length; i++) {
      const raw = rawLines[i];
      // Line 0 is the `@@ -a,b +c,d @@` header — keep as-is.
      if (i === 0) {
        displayLines[i] = raw;
        continue;
      }
      const lead = raw.charCodeAt(0);
      // 0x2B '+', 0x2D '-', 0x20 ' '
      if (lead === 0x2B || lead === 0x2D || lead === 0x20) {
        displayLines[i] = raw.slice(1);
      } else {
        displayLines[i] = raw;
      }
      if (!this.folded) {
        let kind: DecorationKind | undefined;
        if (lead === 0x2B) kind = 'added';
        else if (lead === 0x2D) kind = 'removed';
        if (kind) {
          const docLine = startLineNumber + i;
          this._decorations.push({
            kind,
            range: new Range(docLine, 0, docLine, displayLines[i].length),
          });
        }
      }
    }

    // Range covers the full unfolded extent regardless of fold state — the
    // base TextView convention; sibling views' line bookkeeping depends on it.
    const lastLine = displayLines[displayLines.length - 1];
    this.range = new Range(
      startLineNumber, 0,
      startLineNumber + displayLines.length - 1, lastLine.length,
    );

    return [this.folded ? displayLines[0] : displayLines.join('\n')];
  }

  getDecorations(): DecorationRange[] {
    return this._decorations;
  }
}
