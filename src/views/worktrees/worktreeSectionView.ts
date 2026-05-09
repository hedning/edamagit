import { Uri } from 'vscode';
import { View } from '../general/view';
import { Section, SectionHeaderView } from '../general/sectionHeader';
import { TextView } from '../general/textView';
import { Worktree } from '../../utils/worktreeParsers';
import GitTextUtils from '../../utils/gitTextUtils';

export class WorktreeSectionView extends View {
  isFoldable = true;

  get id() { return Section.Worktrees.toString(); }

  constructor(worktrees: Worktree[], currentRoot: Uri) {
    super();
    const branchWidth = Math.max(0, ...worktrees.map(wt => branchLabel(wt).length));
    this.subViews = [
      new SectionHeaderView(Section.Worktrees, worktrees.length),
      ...worktrees.map(wt => new WorktreeItemView(wt, currentRoot, branchWidth)),
    ];
  }
}

export class WorktreeItemView extends TextView {

  constructor(public worktree: Worktree, currentRoot: Uri, branchWidth: number) {
    super(WorktreeItemView.format(worktree, currentRoot, branchWidth));
  }

  private static format(wt: Worktree, currentRoot: Uri, branchWidth: number): string {
    const marker = wt.path.fsPath === currentRoot.fsPath ? '*' : ' ';
    const branch = branchLabel(wt).padEnd(branchWidth);
    const hash = wt.head ? GitTextUtils.shortHash(wt.head) : '       ';
    const tags = stateTags(wt);
    return `${marker} ${branch}  ${hash}  ${wt.path.fsPath}${tags ? '  ' + tags : ''}`;
  }
}

function branchLabel(wt: Worktree): string {
  if (wt.bare) return '(bare)';
  if (wt.branch) return wt.branch;
  if (wt.detached) return '(detached)';
  return '';
}

function stateTags(wt: Worktree): string {
  const tags: string[] = [];
  if (wt.locked !== undefined) tags.push(wt.locked ? `locked: ${wt.locked}` : 'locked');
  if (wt.prunable !== undefined) tags.push('prunable');
  return tags.join(' · ');
}
