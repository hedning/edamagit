import * as vscode from 'vscode';
import { views } from '../extension';
import { SemanticTokenTypes } from '../common/constants';
import { SemanticTextView } from '../views/general/semanticTextView';
import { visitVisibleViews } from '../utils/viewUtils';

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
      const lineCount = document.lineCount;
      visitVisibleViews(currentView, view => {
        if (!(view instanceof SemanticTextView)) return;
        view.tokens.forEach(token => {
          if (token.range.end.line < lineCount) {
            builder.push(token.range, token.tokenType);
          }
        });
      });
    }
    return builder.build();
  }
}
