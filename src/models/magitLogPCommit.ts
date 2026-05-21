import { MagitChange } from './magitChange';
import { MagitLogEntry } from './magitLogCommit';

export interface MagitLogPEntry extends MagitLogEntry {
  body: string;
  changes: MagitChange[];
}
