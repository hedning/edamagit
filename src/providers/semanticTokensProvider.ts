import * as vscode from 'vscode';
import { views } from '../extension';
import { View } from '../views/general/view';
import { SemanticTokenTypes } from '../common/constants';
import { SemanticTextView } from '../views/general/semanticTextView';

export default class SemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {

  readonly legend = new vscode.SemanticTokensLegend(Object.values(SemanticTokenTypes), []);

  dispose() { }

  provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.ProviderResult<vscode.SemanticTokens> {
    const currentView = views.get(document.uri.toString());
    const builder = new vscode.SemanticTokensBuilder(this.legend);
    if (currentView) {
      // Render-set token line numbers can briefly outrun the document model when
      // the view tree updates faster than VSCode swaps in our new content.
      // Drop out-of-bounds tokens instead of letting VSCode reject the whole batch.
      this.visitNode(currentView, builder, document.lineCount);
    }
    return builder.build();
  }

  visitNode(view: View, builder: vscode.SemanticTokensBuilder, lineCount: number) {
    if (view instanceof SemanticTextView) {
      view.tokens.forEach(token => {
        if (token.range.end.line < lineCount) {
          builder.push(token.range, token.tokenType);
        }
      });
    }

    if (!view.folded) {
      view.subViews.forEach(v => this.visitNode(v, builder, lineCount));

      // Include first 'line' of folded view, but only if it's a SemanticTextView
    } else if (view.subViews.length) {

      let firstSubView = view.subViews[0];
      if (firstSubView instanceof SemanticTextView) {
        firstSubView.tokens.forEach(token => {
          if (token.range.end.line < lineCount) {
            builder.push(token.range, token.tokenType);
          }
        });
      }
    }
  }
}
