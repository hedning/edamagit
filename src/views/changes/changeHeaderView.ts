import { UnclickableSemanticTextView, Token } from '../general/semanticTextView';
import { MagitChange } from '../../models/magitChange';
import { SemanticTokenTypes } from '../../common/constants';
import { Status } from '../../typings/git';

export class ChangeHeaderView extends UnclickableSemanticTextView {

  constructor(public change: MagitChange) {
    super(...ChangeHeaderView.buildContent(change));
  }

  // Untracked entries have no status-label prefix; the old grammar only
  // highlighted lines that began with a status word, so leave those plain.
  private static buildContent(change: MagitChange): (string | Token)[] {
    const statusLabel = mapFileStatusToLabel(change.status);
    const mergingStatusLabel = mapFileStatusToMergingLabel(change.status);
    const text = `${statusLabel ? statusLabel.padEnd(11) : ''}${change.relativePath}${mergingStatusLabel ? ` (${mergingStatusLabel})` : ''}`;
    return [statusLabel ? new Token(text, SemanticTokenTypes.FileHeader) : text];
  }
}

function mapFileStatusToLabel(status: Status): string {
  switch (status) {
    case Status.INDEX_MODIFIED:
    case Status.MODIFIED:
      return 'modified';
    case Status.INDEX_ADDED:
      return 'new file';
    case Status.INDEX_DELETED:
    case Status.DELETED:
      return 'deleted';
    case Status.INDEX_RENAMED:
      return 'renamed';
    case Status.INDEX_COPIED:
      return 'copied';
    case Status.UNTRACKED:
      return '';
    case Status.ADDED_BY_US:
    case Status.ADDED_BY_THEM:
    case Status.DELETED_BY_US:
    case Status.DELETED_BY_THEM:
    case Status.BOTH_ADDED:
    case Status.BOTH_DELETED:
    case Status.BOTH_MODIFIED:
      return 'unmerged';
    default:
      return '';
  }
}

function mapFileStatusToMergingLabel(status: Status): string | undefined {
  switch (status) {
    case Status.ADDED_BY_US:
      return 'added by us';
    case Status.ADDED_BY_THEM:
      return 'added by them';
    case Status.DELETED_BY_US:
      return 'deleted by us';
    case Status.DELETED_BY_THEM:
      return 'deleted by them';
    case Status.BOTH_ADDED:
      return 'both added';
    case Status.BOTH_DELETED:
      return 'both deleted';
    case Status.BOTH_MODIFIED:
      return 'both modified';
    default:
      return undefined;
  }
}