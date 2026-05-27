import { SemanticTextView, Token } from './general/semanticTextView';
import { SemanticTokenTypes } from '../common/constants';
import * as Constants from '../common/constants';

export class ErrorMessageView extends SemanticTextView {

  constructor(latestGitError: string) {
    let truncated = latestGitError.split(Constants.LineSplitterRegex)[0] ?? '';
    truncated = truncated.replace('\r', ' ').slice(0, 61);
    super(
      new Token('GitError!', SemanticTokenTypes.SectionHeader),
      ` ${truncated} [ $ for detailed log ]`);
  }
}
