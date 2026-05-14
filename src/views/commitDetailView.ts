import { DocumentView, RebuildableViewKind } from './general/documentView';
import { buildMagitUri } from '../common/magitUri';
import MagitUtils from '../utils/magitUtils';
import { getRef } from '../commands/visitAtPointCommands';
import { getCommit } from '../utils/commitCache';
import { TextView } from './general/textView';
import { MagitCommit } from '../models/magitCommit';
import { MagitRepository } from '../models/magitRepository';
import { ChangeView } from './changes/changeView';
import { Section } from './general/sectionHeader';
import { LineBreakView } from './general/lineBreakView';
import GitTextUtils from '../utils/gitTextUtils';
import { CommitItemView, CommitSectionView } from './commits/commitSectionView';
import { Commit } from '../typings/git';

export class CommitDetailView extends DocumentView {

  isHighlightable = true;
  needsUpdate = false;

  public commit?: MagitCommit;

  public async update(state: MagitRepository): Promise<void> {
    const commitHash = this.uri.fragment;
    if (!commitHash) return;

    const refs = state.remotes.reduce(
      (prev, remote) => remote.branches.concat(prev),
      state.branches.concat(state.tags),
    );
    const { commit, changes, shortstat } = await getRef(state, commitHash);
    const parents = await Promise.all(commit.parents.map(p => getCommit(state.uri, p)));

    this.commit = commit;
    this.subViews = [];

    this.addSubview(new CommitItemView(commit, undefined, refs));
    const author = `${commit.authorName} <${commit.authorEmail}>`;
    this.addSubview(new TextView(`Author:     ${author}`));

    this.addSubview(new TextView(`AuthorDate: ${commit.authorDate}`));
    this.addSubview(new TextView(`CommitDate: ${commit.commitDate}`));

    this.addSubview(new CommitSectionView(Section.Parents, parents, refs));

    this.addSubview(new LineBreakView(), new TextView(commit.message), new LineBreakView());

    if (shortstat) {
      this.addSubview(new LineBreakView(), new TextView(shortstat));
    }

    this.addSubview(
      ...changes.map(change => {
        const view = new ChangeView(Section.Changes, change, commit.hash);
        view.foldedByDefault = false;
        return view;
      }),
    );

    this.triggerUpdate();
  }
}

// Tab subjects are truncated to keep labels reasonably bounded — the full
// message is always visible inside the view itself.
const SubjectMaxWidth = 40;

export const CommitDetail: RebuildableViewKind<[Commit]> = {
  authority: 'commit',
  // VS Code's `getUriBasenameLabel` formats the label and then runs `basename`
  // on it with the formatter's separator, so a literal `/` in the summary
  // (`feat/foo: bar`) would chop the `commit: ` prefix off the tab title.
  // Substitute U+2215 DIVISION SLASH — visually identical, opaque to
  // `basename`. Full hash stays in the fragment for `build`.
  buildUri: (repo, commit) => {
    const subject = GitTextUtils.shortCommitMessage(commit.message).replace(/\//g, '∕');
    const truncated = subject.length > SubjectMaxWidth ? subject.slice(0, SubjectMaxWidth - 1) + '…' : subject;
    const shortHash = GitTextUtils.shortHash(commit.hash);
    return buildMagitUri(repo, 'commit', {
      authority: CommitDetail.authority,
      title: `${truncated} (${shortHash})`,
      fragment: commit.hash,
    });
  },
  build: async (uri) => {
    const repo = await MagitUtils.ensureRepoForMagitUri(uri);
    if (!repo || !uri.fragment) return undefined;
    const view = new CommitDetailView(uri);
    await view.update(repo);
    return view;
  },
};