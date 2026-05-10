import { DocumentView, ViewKind } from './general/documentView';
import { buildMagitUri, MagitUri } from '../common/magitUri';
import { MagitRepository } from '../models/magitRepository';
import { MagitChange } from '../models/magitChange';
import { ChangeSectionView } from './changes/changesSectionView';
import { Section } from './general/sectionHeader';

export class DiffView extends DocumentView {

  isHighlightable = false;
  needsUpdate = false;

  constructor(uri: MagitUri, private changes: MagitChange[]) {
    super(uri);

    this.addSubview(new ChangeSectionView(Section.Changes, changes));
  }

  public update(state: MagitRepository): void { }
}

// `Diff` doesn't extend `RebuildableViewKind`: the parsed output of a
// specific `git diff` invocation isn't recoverable from the URI alone, so
// the FS provider returns FileNotFound on window reload and the tab drops.
export const Diff: ViewKind<[string]> = {
  authority: 'diff',
  buildUri: (repo, diffId) => buildMagitUri(repo.uri, 'diff', {
    authority: Diff.authority,
    fragment: diffId,
  }),
};
