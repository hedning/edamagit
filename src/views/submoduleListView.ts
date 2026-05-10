import { buildMagitUri, MagitUri } from '../common/magitUri';
import { DocumentView, RebuildableViewKind } from './general/documentView';
import MagitUtils from '../utils/magitUtils';
import { MagitRepository } from '../models/magitRepository';
import { TextView } from './general/textView';

export default class SubmoduleListView extends DocumentView {

  constructor(uri: MagitUri, magitState: MagitRepository) {
    super(uri);
    this.provideContent(magitState);
  }

  provideContent(magitState: MagitRepository) {
    this.subViews = [
      ...magitState.submodules.map(submodule => new TextView(`${submodule.name}\t\t${submodule.path}\t\t${submodule.url}`)),
    ];
  }

  public update(state: MagitRepository): void {
    this.provideContent(state);
    this.triggerUpdate();
  }
}

export const SubmoduleList: RebuildableViewKind<[]> = {
  authority: 'submodules',
  buildUri: (repo) => buildMagitUri(repo.uri, 'submodules', { authority: SubmoduleList.authority }),
  build: async (uri) => {
    const repo = await MagitUtils.ensureRepoForMagitUri(uri);
    return repo ? new SubmoduleListView(uri, repo) : undefined;
  },
};
