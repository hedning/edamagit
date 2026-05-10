import { buildMagitUri, MagitUri } from '../common/magitUri';
import { Section, SectionHeaderView } from './general/sectionHeader';
import { DocumentView, RebuildableViewKind } from './general/documentView';
import MagitUtils from '../utils/magitUtils';
import { MagitRepository } from '../models/magitRepository';
import { TagSectionView } from './tags/tagSectionView';
import { BranchesSectionView } from './branches/branchesSectionView';
import { RemoteSectionView } from './remotes/remoteSectionView';

export default class ShowRefsView extends DocumentView {

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

}

export const ShowRefs: RebuildableViewKind<[]> = {
  authority: 'refs',
  buildUri: (repo) => buildMagitUri(repo.uri, 'refs', { authority: ShowRefs.authority }),
  build: async (uri) => {
    const repo = await MagitUtils.ensureRepoForMagitUri(uri);
    return repo ? new ShowRefsView(uri, repo) : undefined;
  },
};