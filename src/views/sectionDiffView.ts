import { buildMagitUri, MagitUri } from '../common/magitUri';
import { Section } from './general/sectionHeader';
import { DocumentView } from './general/documentView';
import { ChangeSectionView } from './changes/changesSectionView';
import { MagitRepository } from '../models/magitRepository';

export default class SectionDiffView extends DocumentView {

  static UriPath: string = 'staged';
  static UriAuthority: string = 'sectionDiff';

  constructor(uri: MagitUri, magitState: MagitRepository, private section: Section) {
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

  static index = 0;
  static encodeLocation(repository: MagitRepository): MagitUri {
    return buildMagitUri(repository.uri, SectionDiffView.UriPath, {
      authority: SectionDiffView.UriAuthority,
      fragment: `${SectionDiffView.index++}`,
    });
  }
  // No `static rebuild`: the section (staged/unstaged) is a constructor
  // arg, not in the URI. Step 5 will encode it and add a real rebuild.
}