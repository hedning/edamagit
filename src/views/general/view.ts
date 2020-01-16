import { Range, Position } from 'vscode';

export abstract class View {

  subViews: View[] = [];
  range: Range = new Range(0, 0, 0, 0);
  isFoldable: boolean = false;

  onClicked(): View | undefined { return this; }

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

  click(position: Position): View | undefined {
    if (this.range.contains(position)) {
      const result = this.onClicked();
      const subResults = this.subViews
        .map(subView => subView.click(position))
        .filter(r => r);

      return subResults.length > 0 ? subResults[0] : result;
    }
  }

  addSubview(...views: View[]) {
    this.subViews.push(...views);
  }
}