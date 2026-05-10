import { buildMagitUri, MagitUri } from '../common/magitUri';
import { Section } from './general/sectionHeader';
import { DocumentView } from './general/documentView';
import { ChangeSectionView } from './changes/changesSectionView';
import { MagitRepository } from '../models/magitRepository';
import MagitUtils from '../utils/magitUtils';

// Only Staged/Unstaged are valid sections for this view; other Section
// values would never produce a useful diff and we'd reject them on rebuild.
type SectionDiffSection = Section.Staged | Section.Unstaged;

export default class SectionDiffView extends DocumentView {

  static UriAuthority: string = 'sectionDiff';

  constructor(uri: MagitUri, magitState: MagitRepository, private section: SectionDiffSection) {
    super(uri);
    this.provideContent(magitState, true);
  }

  provideContent(magitState: MagitRepository, unfoldAll = false) {

    let changeSection;

    if (this.section === Section.Staged) {

      changeSection = new ChangeSectionView(Section.Staged, magitState.indexChanges, 'sectionDiffView');

    } else {
      changeSection = new ChangeSectionView(Section.Unstaged, magitState.workingTreeChanges, 'sectionDiffView');
    }

    // Unfold to show diff
    if (unfoldAll) {
      changeSection.subViews.forEach(changeView => {
        changeView.folded = false;
        changeView.subViews.forEach(hunkView => hunkView.folded = false);
      });
    }

    this.subViews = [
      changeSection
    ];
  }

  public update(state: MagitRepository): void {
    this.provideContent(state);
    this.triggerUpdate();
  }

  static encodeLocation(repository: MagitRepository, section: SectionDiffSection): MagitUri {
    const leaf = section === Section.Staged ? 'staged' : 'unstaged';
    return buildMagitUri(repository.uri, leaf, {
      authority: SectionDiffView.UriAuthority,
      fragment: leaf,
    });
  }

  static async rebuild(uri: MagitUri): Promise<SectionDiffView | undefined> {
    const repo = await MagitUtils.ensureRepoForMagitUri(uri);
    if (!repo) return undefined;
    const section = uri.fragment === 'staged' ? Section.Staged : Section.Unstaged;
    return new SectionDiffView(uri, repo, section);
  }
}