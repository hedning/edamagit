import { buildMagitUri, MagitUri } from '../common/magitUri';
import { Section } from './general/sectionHeader';
import { DocumentView, RebuildableViewKind } from './general/documentView';
import { ChangeSectionView } from './changes/changesSectionView';
import { MagitRepository } from '../models/magitRepository';
import MagitUtils from '../utils/magitUtils';

// Only Staged/Unstaged are valid sections for this view; other Section
// values would never produce a useful diff and we'd reject them on rebuild.
export type SectionDiffSection = Section.Staged | Section.Unstaged;

export default class SectionDiffView extends DocumentView {

  private section: SectionDiffSection;

  constructor(uri: MagitUri) {
    super(uri);
    this.section = uri.fragment === 'staged' ? Section.Staged : Section.Unstaged;
  }

  provideContent(magitState: MagitRepository) {

    let changeSection;

    if (this.section === Section.Staged) {

      changeSection = new ChangeSectionView(Section.Staged, magitState.indexChanges, 'sectionDiffView');

    } else {
      changeSection = new ChangeSectionView(Section.Unstaged, magitState.workingTreeChanges, 'sectionDiffView');
    }

    this.subViews = [
      changeSection
    ];
  }

  public update(state: MagitRepository): void {
    this.provideContent(state);
    this.triggerUpdate();
  }

}

export const SectionDiff: RebuildableViewKind<[SectionDiffSection]> = {
  authority: 'sectionDiff',
  buildUri: (repo, section) => {
    const leaf = section === Section.Staged ? 'staged' : 'unstaged';
    return buildMagitUri(repo, leaf, {
      authority: SectionDiff.authority,
      title: leaf,
      fragment: leaf,
    });
  },
  build: async (uri) => {
    const repo = await MagitUtils.ensureRepoForMagitUri(uri);
    if (!repo) return undefined;
    const view = new SectionDiffView(uri);
    await view.update(repo);
    return view;
  },
};