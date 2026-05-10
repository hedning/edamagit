import { DocumentView } from './general/documentView';
import { buildMagitUri, MagitUri } from '../common/magitUri';
import MagitUtils from '../utils/magitUtils';
import { getRef } from '../commands/visitAtPointCommands';
import { getCommit } from '../utils/commitCache';
import { TextView } from './general/textView';
import { MagitCommit } from '../models/magitCommit';
import { MagitRepository } from '../models/magitRepository';
import { MagitChange } from '../models/magitChange';
import { ChangeView } from './changes/changeView';
import { Section, SectionHeaderView } from './general/sectionHeader';
import { LineBreakView } from './general/lineBreakView';
import GitTextUtils from '../utils/gitTextUtils';
import { CommitItemView, CommitSectionView } from './commits/commitSectionView';
import { Commit, Ref } from '../typings/git';

export class CommitDetailView extends DocumentView {

  static UriPath: string = 'commit';
  static UriAuthority: string = 'commit';
  isHighlightable = true;
  needsUpdate = false;

  constructor(uri: MagitUri, public commit: MagitCommit, changes: MagitChange[], parents: Commit[], refs: Ref[], shortstat?: string) {
    super(uri);


    this.addSubview(new CommitItemView(commit, undefined, refs));
    // this.addSubview(shaView);
    const author = `${commit.authorName} <${commit.authorEmail}>`;
    const authorDetails = new TextView(`Author:     ${author}`);
    this.addSubview(authorDetails);

    this.addSubview(new TextView(`AuthorDate: ${commit.authorDate}`));
    this.addSubview(new TextView(`CommitDate: ${commit.commitDate}`));


    this.addSubview(new CommitSectionView(Section.Parents, parents, refs));

    const messageView = new TextView(commit.message);
    this.addSubview(new LineBreakView(), messageView, new LineBreakView());

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


  }

  public update(state: MagitRepository): void { }

  static index = 0;
  static buildUri(repository: MagitRepository, commit: Commit): MagitUri {
    // VS Code's `getUriBasenameLabel` formats the label and then runs
    // `basename` on it with the formatter's separator, so a literal `/` in
    // the summary (`feat/foo: bar`) would chop the `Commit <hash>: ` prefix
    // off the tab title. Substitute U+2215 DIVISION SLASH like we do for the
    // path leaf — visually identical, opaque to `basename`.
    const summary = GitTextUtils.shortCommitMessage(commit.message).replace(/\//g, '∕');
    const shortHash = GitTextUtils.shortHash(commit.hash);
    // Path leaf is just `commit.magit`; the human label is composed by the
    // `magit` + `commit` authority `resourceLabelFormatters` entry from these
    // query keys. Full hash stays in the fragment for the rebuilder.
    return buildMagitUri(repository.uri, CommitDetailView.UriPath, {
      authority: CommitDetailView.UriAuthority,
      query: { summary, shortHash },
      fragment: commit.hash,
    });
  }

  static async rebuild(uri: MagitUri): Promise<CommitDetailView | undefined> {
    const repo = await MagitUtils.ensureRepoForMagitUri(uri);
    if (!repo) return undefined;
    const commitHash = uri.fragment;
    if (!commitHash) return undefined;

    const refs = repo.remotes.reduce(
      (prev, remote) => remote.branches.concat(prev),
      repo.branches.concat(repo.tags),
    );
    const { commit, changes, shortstat } = await getRef(repo, commitHash);
    const parents = await Promise.all(commit.parents.map(p => getCommit(repo.uri, p)));
    return new CommitDetailView(uri, commit, changes, parents, refs, shortstat);
  }
}