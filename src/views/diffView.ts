import { DocumentView } from './general/documentView';
import { buildMagitUri, MagitUri } from '../common/magitUri';
import { TextView } from './general/textView';
import { MagitRepository } from '../models/magitRepository';
import { gitRun } from '../utils/gitRawRunner';
import { MagitChange } from '../models/magitChange';
import { ChangeSectionView } from './changes/changesSectionView';
import { Section } from './general/sectionHeader';

export class DiffView extends DocumentView {

  static UriPath: string = 'diff';
  static UriAuthority: string = 'diff';
  isHighlightable = false;
  needsUpdate = false;

  constructor(uri: MagitUri, private changes: MagitChange[]) {
    super(uri);

    this.addSubview(new ChangeSectionView(Section.Changes, changes));
  }

  public update(state: MagitRepository): void { }

  static encodeLocation(repository: MagitRepository, diffId: string): MagitUri {
    return buildMagitUri(repository.uri, DiffView.UriPath, {
      authority: DiffView.UriAuthority,
      fragment: diffId,
    });
  }
  // No `static rebuild`: DiffView holds the parsed output of a specific
  // `git diff` invocation whose args aren't in the URI. Across a window
  // reload the FS provider returns FileNotFound, and the tab is dropped.
}