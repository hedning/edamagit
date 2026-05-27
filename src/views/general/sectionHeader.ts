import { SemanticTokenTypes } from '../../common/constants';
import { UnclickableSemanticTextView, Token } from './semanticTextView';

export enum Section {
  Untracked = 'Untracked files',
  Unstaged = 'Unstaged changes',
  Staged = 'Staged changes',
  Stashes = 'Stashes',
  Worktrees = 'Worktrees',
  Terminals = 'Terminals',
  RecentCommits = 'Recent commits',
  UnmergedInto = 'Unmerged into',
  UnpushedTo = 'Unpushed to',
  UnpulledFrom = 'Unpulled from',
  Merging = 'Merging',
  CherryPicking = 'Cherry Picking',
  Reverting = 'Reverting',
  HEAD = 'HEAD',
  Branches = 'Branches',
  Remote = 'Remote',
  Tags = 'Tags',
  PullRequests = 'Pull Requests',
  Issues = 'Issues',
  Changes = 'Changes',
  Parents = 'Parents',
}

export class SectionHeaderView extends UnclickableSemanticTextView {

  constructor(section: Section, count?: number, extraText?: string) {
    const rest = `${extraText ? ' ' + extraText + '' : ''}${count ? ' (' + count + ')' : ''}`;
    super(new Token(section.valueOf(), SemanticTokenTypes.SectionHeader), rest);
  }
}