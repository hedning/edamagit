import { MagitChangeHunk } from '../../models/magitChangeHunk';
import { Ref } from '../../typings/git';
import { Section } from '../general/sectionHeader';
import { TextView } from '../general/textView';

export class HunkView extends TextView {
  isFoldable = true;

  get id() { return this.changeHunk.diff; }

  constructor(public section: Section, public changeHunk: MagitChangeHunk, public ref?: Ref) {
    super(changeHunk.diff);
  }
}