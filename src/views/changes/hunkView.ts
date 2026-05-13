import { Range } from 'vscode';
import { MagitChangeHunk } from '../../models/magitChangeHunk';
import { Ref } from '../../typings/git';
import { Section } from '../general/sectionHeader';
import { TextView } from '../general/textView';
import { DecoratableView, DecorationRange } from '../general/decoratableView';
import * as Constants from '../../common/constants';

export class HunkView extends TextView implements DecoratableView {
  isFoldable = true;

  private _decorations: DecorationRange[] = [];

  get id() { return this.changeHunk.diff; }

  constructor(public section: Section, public changeHunk: MagitChangeHunk, public ref?: Ref) {
    super(changeHunk.diff);
  }

  render(startLineNumber: number): string[] {
    this._decorations = [];
    const lines = super.render(startLineNumber);

    // When folded only the first line is visible; the diff body isn't on
    // screen so don't emit any ranges. The visible line is the hunk header
    // (e.g. `@@ -1,5 +1,7 @@`), not a +/- line.
    if (!this.folded) {
      const diffLines = this.changeHunk.diff.split(Constants.LineSplitterRegex);
      diffLines.forEach((line, i) => {
        const kind = classifyDiffLine(line);
        if (!kind) return;
        const docLine = startLineNumber + i;
        this._decorations.push({
          kind,
          range: new Range(docLine, 0, docLine, line.length),
        });
      });
    }

    return lines;
  }

  getDecorations(): DecorationRange[] {
    return this._decorations;
  }
}

function classifyDiffLine(line: string): 'added' | 'removed' | undefined {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'added';
  if (line.startsWith('-') && !line.startsWith('---')) return 'removed';
  return undefined;
}
