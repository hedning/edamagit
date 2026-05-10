import { DocumentView } from './general/documentView';
import { buildMagitUri, MagitUri } from '../common/magitUri';
import { TextView } from './general/textView';
import { MagitRepository } from '../models/magitRepository';
import { ChangeSectionView } from './changes/changesSectionView';
import { Section } from './general/sectionHeader';
import { MagitChange } from '../models/magitChange';
import { Stash } from '../models/stash';

export class StashDetailView extends DocumentView {

  static UriPath: string = 'stash';
  needsUpdate = false;

  constructor(public uri: MagitUri, stash: Stash, unstaged: MagitChange[], staged: MagitChange[], untracked: MagitChange[]) {
    super(uri);

    this.addSubview(new TextView(`Stash@{${stash.index}} ${stash.description}`));

    if (unstaged.length > 0) {
      this.addSubview(new ChangeSectionView(Section.Unstaged, unstaged, `-stashDetail@{${stash.index}}`));
    }

    if (staged.length > 0) {
      this.addSubview(new ChangeSectionView(Section.Staged, staged, `-stashDetail@{${stash.index}}`));
    }

    if (untracked.length > 0) {
      this.addSubview(new ChangeSectionView(Section.Untracked, untracked, `-stashDetail@{${stash.index}}`));
    }

  }

  public update(state: MagitRepository): void { }

  static index = 0;
  static encodeLocation(repository: MagitRepository, stash: Stash): MagitUri {
    return buildMagitUri(repository.uri, StashDetailView.UriPath, { fragment: `stash@{${stash.index}}#${StashDetailView.index++}` });
  }
}