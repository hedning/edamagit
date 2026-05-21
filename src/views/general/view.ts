import { Range, Position } from 'vscode';

export abstract class View {

  private _range: Range = new Range(0, 0, 0, 0);
  subViews: View[] = [];
  isFoldable: boolean = false;
  isHighlightable: boolean = true;

  get range(): Range {
    return this._range;
  }

  set range(value: Range) {
    this._range = value;
  }

  render(startLineNumber: number): string[] {

    let currentLineNumber = startLineNumber;
    const renderedContent: string[] = [];

    this.subViews.forEach(
      v => {
        const subViewRender = v.render(currentLineNumber);
        currentLineNumber += (v.range.end.line - v.range.start.line) + 1;
        renderedContent.push(...subViewRender);
      }
    );
    this.range = new Range(startLineNumber, 0, currentLineNumber - 1, renderedContent.length > 0 ? renderedContent[renderedContent.length - 1].length : 0);

    return renderedContent;
  }

  get id(): string | undefined { return undefined; }

  onClicked(): View | undefined { return this; }

  click(position: Position): View | undefined {
    if (!this.range.contains(position)) return;

    const result = this.onClicked();

    let subResult: View | undefined = undefined;
    for (const subView of this.subViews) {
      subResult = subView.click(position);
      if (subResult) break;
    }

    return subResult ?? result;
  }

  addSubview(...views: View[]) {
    this.subViews.push(...views);
  }
}