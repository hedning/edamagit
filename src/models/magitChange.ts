import { Change, Ref } from '../typings/git';
import { MagitChangeHunk } from './magitChangeHunk';

export interface MagitChange extends Change {
  ref?: Ref;
  hunks?: MagitChangeHunk[];
  diff?: string;
  relativePath?: string;
}
