import { View } from '../general/view';
import { Section, SectionHeaderView } from '../general/sectionHeader';
import { TextView } from '../general/textView';
import { LineBreakView } from '../general/lineBreakView';
import { Stash } from '../../models/stash';

export class StashSectionView extends View {
  isFoldable = true;

  get id() { return Section.Stashes.toString(); }

  constructor(stashes: Stash[]) {
    super();
    this.subViews = [
      new SectionHeaderView(Section.Stashes, stashes.length),
      ...stashes.slice(0, 7).map(stash => new StashItemView(stash)),
    ];
  }
}

export class StashItemView extends TextView {

  public get section() {
    return StashItemView.getSection(this.stash);
  }

  private static getSection(stash: Stash) {
    return `stash@{${stash.index}}`;
  }

  constructor(public stash: Stash) {
    super(`${StashItemView.getSection(stash)} ${stash.description}`);
  }
}