import { buildMagitUri, MagitUri } from '../common/magitUri';
import { DocumentView } from './general/documentView';
import MagitUtils from '../utils/magitUtils';
import { MagitRepository } from '../models/magitRepository';
import { TextView } from './general/textView';

export default class SubmoduleListView extends DocumentView {

  static UriPath: string = 'submodules';
  static UriAuthority: string = 'submodules';

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

  static buildUri(repository: MagitRepository): MagitUri {
    return buildMagitUri(repository.uri, SubmoduleListView.UriPath, { authority: SubmoduleListView.UriAuthority });
  }

  static async rebuild(uri: MagitUri): Promise<SubmoduleListView | undefined> {
    const repo = await MagitUtils.ensureRepoForMagitUri(uri);
    return repo ? new SubmoduleListView(uri, repo) : undefined;
  }
}