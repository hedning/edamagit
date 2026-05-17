import { DocumentView, RebuildableViewKind } from './general/documentView';
import { buildMagitUri } from '../common/magitUri';
import { TextView } from './general/textView';
import MagitUtils from '../utils/magitUtils';
import { MagitRepository } from '../models/magitRepository';
import { ChangeSectionView } from './changes/changesSectionView';
import { Section } from './general/sectionHeader';
import { MagitChange } from '../models/magitChange';
import { Stash } from '../models/stash';
import { getRef } from '../commands/visitAtPointCommands';
import { RefType, Status } from '../typings/git';
import { gitRunInUri } from '../utils/gitRawRunner';
import { diffToMagitChanges } from '../utils/diffParser';

export class StashDetailView extends DocumentView {

  needsUpdate = false;

  public async update(state: MagitRepository): Promise<void> {
    const indexStr = this.uri.fragment.match(/^stash@\{(\d+)\}$/)?.[1];
    if (indexStr === undefined) return;
    const index = Number.parseInt(indexStr, 10);
    const stash = state.stashes?.find(s => s.index === index);
    if (!stash) return;
    
    const ref = `refs/stash@{${index}}`;
    
    let diff = (await gitRunInUri(state.uri, ['stash', 'show', '-p', `stash@{${index}}`])).stdout;
    let changes: MagitChange[] = diffToMagitChanges(diff, state.uri, { commit: ref, type: RefType.Head });
    this.addSubview(new TextView(`Stash@{${stash.index}} ${stash.description}`));
    if (changes.length > 0) {
      this.addSubview(new ChangeSectionView(Section.Changes, changes, `-stashDetail@{${stash.index}}`));
    }
    this.triggerUpdate();
  }
}

export const StashDetail: RebuildableViewKind<[Stash]> = {
  authority: 'stash',
  buildUri: (repo, stash) => buildMagitUri(repo, 'stash', {
    authority: StashDetail.authority,
    title: `stash@{${stash.index}} ${stash.description}`.replace(/\//g, '∕'),
    fragment: `stash@{${stash.index}}`,
  }),
  build: async (uri) => {
    const repo = await MagitUtils.ensureRepoForMagitUri(uri);
    if (!repo) return undefined;
    const view = new StashDetailView(uri);
    await view.update(repo);
    return view;
  },
};
