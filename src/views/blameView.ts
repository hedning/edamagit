import { DocumentView, RebuildableViewKind } from './general/documentView';
import { Uri } from 'vscode';
import { buildMagitUri } from '../common/magitUri';
import { TextView } from './general/textView';
import MagitUtils from '../utils/magitUtils';
import { MagitRepository } from '../models/magitRepository';
import { gitRunInUri } from '../utils/gitRawRunner';

export class BlameView extends DocumentView {

  isHighlightable = false;
  needsUpdate = false;

  public async update(state: MagitRepository): Promise<void> {
    const path = this.uri.fragment;
    if (!path) return;
    const blameResult = await gitRunInUri(state.uri, ['blame', path]);
    const blameTextView = new TextView(blameResult.stdout);
    blameTextView.isHighlightable = false;
    this.subViews = [blameTextView];
    this.triggerUpdate();
  }
}

export const Blame: RebuildableViewKind<[Uri]> = {
  authority: 'blame',
  buildUri: (repo, fileUri) => {
    const basename = fileUri.path.slice(fileUri.path.lastIndexOf('/') + 1);
    return buildMagitUri(repo, 'blame', {
      authority: Blame.authority,
      title: basename,
      fragment: fileUri.path,
    });
  },
  build: async (uri) => {
    const repo = await MagitUtils.ensureRepoForMagitUri(uri);
    if (!repo) return undefined;
    const view = new BlameView(uri);
    await view.update(repo);
    return view;
  },
};
