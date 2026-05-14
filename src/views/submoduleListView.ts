import { buildMagitUri, MagitUri } from '../common/magitUri';
import { DocumentView, RebuildableViewKind } from './general/documentView';
import MagitUtils from '../utils/magitUtils';
import { MagitRepository } from '../models/magitRepository';
import { TextView } from './general/textView';

export default class SubmoduleListView extends DocumentView {

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
  buildUri: (repo) => buildMagitUri(repo, 'submodules', { authority: SubmoduleList.authority }),
  build: async (uri) => {
    const repo = await MagitUtils.ensureRepoForMagitUri(uri);
    if (!repo) return undefined;
    const view = new SubmoduleListView(uri);
    await view.update(repo);
    return view;
  },
};
