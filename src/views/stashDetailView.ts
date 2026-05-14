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
import { Status } from '../typings/git';

export class StashDetailView extends DocumentView {

  needsUpdate = false;

  public async update(state: MagitRepository): Promise<void> {
    const indexStr = this.uri.fragment.match(/^stash@\{(\d+)\}$/)?.[1];
    if (indexStr === undefined) return;
    const index = Number.parseInt(indexStr, 10);

    const stash = state.stashes?.find(s => s.index === index);
    if (!stash) return;

    const ref = `refs/stash@{${index}}`;
    const { commit, changes: unstaged } = await getRef(state, ref);
    const { changes: staged } = await getRef(state, commit.parents[1]);

    let untracked: MagitChange[] = [];
    if (commit.parents.length === 3) {
      const { changes } = await getRef(state, commit.parents[2]);
      untracked = changes.map(c => ({ ...c, status: Status.UNTRACKED, section: Section.Untracked }));
    }

    this.subViews = [];
    this.addSubview(new TextView(`Stash@{${stash.index}} ${stash.description}`));
    if (unstaged.length > 0) {
      this.addSubview(new ChangeSectionView(Section.Unstaged, unstaged, `-stashDetail@{${stash.index}}`));
    }
    if (staged.length > 0) {
      this.addSubview(new ChangeSectionView(Section.Staged, staged, `-stashDetail@{${stash.index}}`));
    }
    if (untracked.length > 0) {
      this.addSubview(new ChangeSectionView(Section.Untracked, untracked, `-stashDetail@{${stash.index}}`));
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
