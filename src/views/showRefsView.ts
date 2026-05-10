import { buildMagitUri, MagitUri } from '../common/magitUri';
import { Section, SectionHeaderView } from './general/sectionHeader';
import { DocumentView } from './general/documentView';
import { MagitRepository } from '../models/magitRepository';
import { TagSectionView } from './tags/tagSectionView';
import { BranchesSectionView } from './branches/branchesSectionView';
import { RemoteSectionView } from './remotes/remoteSectionView';

export default class ShowRefsView extends DocumentView {

  static UriPath: string = 'refs';
  static UriAuthority: string = 'refs';

  constructor(uri: MagitUri, magitState: MagitRepository) {
    super(uri);
    this.provideContent(magitState);
  }

  provideContent(magitState: MagitRepository) {

    this.subViews = [
      new SectionHeaderView(Section.HEAD),
      new BranchesSectionView(magitState.branches, magitState.HEAD),
      ...magitState.remotes.map(remote => new RemoteSectionView(remote)),
      new TagSectionView(magitState.tags)
    ];
  }

  public update(state: MagitRepository): void {
    this.provideContent(state);
    this.triggerUpdate();
  }

  static encodeLocation(repository: MagitRepository): MagitUri {
    return buildMagitUri(repository.uri, ShowRefsView.UriPath, { authority: ShowRefsView.UriAuthority });
  }
}