import { suite, test } from 'mocha';
import { Uri } from 'vscode';

import { Status, RefType } from '../../../typings/git';
import { Section } from '../../../views/general/sectionHeader';
import { BranchHeaderSectionView } from '../../../views/branches/branchHeaderSectionView';
import { ChangeSectionView } from '../../../views/changes/changesSectionView';
import { ChangeView } from '../../../views/changes/changeView';
import { CommitSectionView } from '../../../views/commits/commitSectionView';
import { UnsourcedCommitSectionView } from '../../../views/commits/unsourcedCommitsSectionView';
import { StashSectionView } from '../../../views/stashes/stashSectionView';
import { WorktreeSectionView } from '../../../views/worktrees/worktreeSectionView';
import { ErrorMessageView } from '../../../views/errorMessageView';
import MagitStatusView, { MagitStatus } from '../../../views/magitStatusView';

import {
  REPO_URI,
  assertView,
  makeBranch,
  makeChange,
  makeCommit,
  makeHunk,
  makeRef,
  makeRepository,
  makeStash,
  makeUpstream,
} from './fixtures';

suite('views (text snapshot)', () => {

  suite('BranchHeaderSectionView', () => {
    test('empty repo (no HEAD commitDetails)', () => {
      const view = new BranchHeaderSectionView(REPO_URI, []);
      assertView(view, 'In the beginning there was darkness');
    });

    test('HEAD on main worktree renders repo basename and branch', () => {
      const HEAD = makeBranch({ name: 'main', commit: 'aaaaaaa', message: 'Tip' });
      const view = new BranchHeaderSectionView(REPO_URI, [], HEAD);
      assertView(view, 'HEAD: repo main');
    });

    test('HEAD with log renders commits beneath the header line', () => {
      const HEAD = makeBranch({ name: 'main', commit: 'aaaaaaa', message: 'Tip' });
      const refs = [makeRef({ name: 'main', commit: 'aaaaaaa' })];
      const log = [
        makeCommit({ hash: 'aaaaaaa', message: 'Tip' }),
        makeCommit({ hash: 'bbbbbbb', message: 'Earlier' }),
      ];
      const view = new BranchHeaderSectionView(REPO_URI, [], HEAD, log, refs);
      assertView(view, `
HEAD: repo main
aaaaaaa main Tip
bbbbbbb Earlier
`);
    });

    test('linked worktree adds <repo>/<worktree-basename> to the header', () => {
      const HEAD = makeBranch({ name: 'feature', commit: 'aaaaaaa', message: 'Tip' });
      const mainWorktree = { path: REPO_URI, head: 'aaaaaaa', branch: 'main', bare: false, detached: false };
      const linkedUri = Uri.parse('file:///repo/wt/feature');
      const linked = { path: linkedUri, head: 'aaaaaaa', branch: 'feature', bare: false, detached: false };
      const view = new BranchHeaderSectionView(linkedUri, [mainWorktree, linked], HEAD);
      assertView(view, 'HEAD: repo/feature feature');
    });

    test('upstream renders Merge: label and one-line ref summary', () => {
      const HEAD = makeBranch({
        name: 'main',
        commit: 'aaaaaaa',
        message: 'Initial commit',
        upstreamRemote: makeUpstream({ remote: 'origin', name: 'main', commitMessage: 'Upstream tip' }),
      });
      const refs = [
        makeRef({ name: 'origin/main', commit: 'aaaaaaa', type: RefType.RemoteHead, remote: 'origin' }),
        makeRef({ name: 'main', commit: 'aaaaaaa' }),
      ];
      const view = new BranchHeaderSectionView(
        REPO_URI,
        [],
        HEAD,
        [makeCommit({ hash: 'aaaaaaa', message: 'Initial commit' })],
        refs,
      );

      assertView(view, `
HEAD: repo main
aaaaaaa origin/main Initial commit
Merge:
origin/main Upstream tip
`);
    });
  });

  suite('ChangeSectionView', () => {
    test('unstaged modified file with hunks', () => {
      const change = makeChange({
        path: 'src/foo.ts',
        status: Status.MODIFIED,
        hunks: [makeHunk('@@ -1,2 +1,2 @@\n line one\n-old\n+new')],
      });
      const view = new ChangeSectionView(Section.Unstaged, [change]);
      assertView(view, `
Unstaged changes (1)
modified   src/foo.ts
@@ -1,2 +1,2 @@
line one
old
new
`);
    });

    test('untracked files render path only', () => {
      const view = new ChangeSectionView(Section.Untracked, [
        makeChange({ path: 'a.txt', status: Status.UNTRACKED }),
        makeChange({ path: 'b.txt', status: Status.UNTRACKED }),
      ]);
      assertView(view, `
Untracked files (2)
a.txt
b.txt
`);
    });

    test('staged changes mix new file and modified', () => {
      const view = new ChangeSectionView(Section.Staged, [
        makeChange({ path: 'added.ts', status: Status.INDEX_ADDED }),
        makeChange({ path: 'changed.ts', status: Status.INDEX_MODIFIED }),
        makeChange({ path: 'gone.ts', status: Status.INDEX_DELETED }),
      ]);
      assertView(view, `
Staged changes (3)
new file   added.ts
modified   changed.ts
deleted    gone.ts
`);
    });

    test('merging conflict adds parenthetical label', () => {
      const view = new ChangeSectionView(Section.Unstaged, [
        makeChange({ path: 'conflict.ts', status: Status.BOTH_MODIFIED }),
      ]);
      assertView(view, `
Unstaged changes (1)
unmerged   conflict.ts (both modified)
`);
    });
  });

  suite('ChangeView (single file, unfolded)', () => {
    test('renders header followed by full hunk text', () => {
      const change = makeChange({
        path: 'src/foo.ts',
        status: Status.MODIFIED,
        hunks: [
          makeHunk('@@ -1,1 +1,1 @@\n-old\n+new'),
          makeHunk('@@ -10,1 +10,1 @@\n-also old\n+also new'),
        ],
      });
      const view = new ChangeView(Section.Unstaged, change);
      assertView(view, `
modified   src/foo.ts
@@ -1,1 +1,1 @@
old
new
@@ -10,1 +10,1 @@
also old
also new
`);
    });
  });

  suite('CommitSectionView', () => {
    test('recent commits include short hash and subject', () => {
      const head = makeRef({ name: 'main', commit: 'aaaaaaa1234' });
      const view = new CommitSectionView(
        Section.RecentCommits,
        [
          makeCommit({ hash: 'aaaaaaa1234', message: 'Most recent\nbody discarded' }),
          makeCommit({ hash: 'bbbbbbb5678', message: 'Older commit' }),
        ],
        [head],
      );
      assertView(view, `
Recent commits
aaaaaaa main Most recent
bbbbbbb Older commit

`);
    });

    test('Recent commits decorated with local branch, tracking remote, and tag', () => {
      // Order mirrors MagitStatusView: remote branches first, then local
      // branches, then tags. With this order, a local branch already covered
      // by its tracking remote is folded into the remote token.
      const refs = [
        makeRef({ name: 'origin/main', commit: 'aaaaaaa1234', type: RefType.RemoteHead, remote: 'origin' }),
        makeRef({ name: 'main', commit: 'aaaaaaa1234' }),
        makeRef({ name: 'feature', commit: 'ccccccc9abc' }),
        makeRef({ name: 'v1.0', commit: 'bbbbbbb5678', type: RefType.Tag }),
      ];
      const view = new CommitSectionView(
        Section.RecentCommits,
        [
          makeCommit({ hash: 'aaaaaaa1234', message: 'Tip with tracking remote' }),
          makeCommit({ hash: 'bbbbbbb5678', message: 'Tagged release' }),
          makeCommit({ hash: 'ccccccc9abc', message: 'On a side branch' }),
          makeCommit({ hash: 'ddddddd0000', message: 'Plain commit, no decorations' }),
        ],
        refs,
      );
      assertView(view, `
Recent commits
aaaaaaa origin/main Tip with tracking remote
bbbbbbb v1.0 Tagged release
ccccccc feature On a side branch
ddddddd Plain commit, no decorations

`);
    });
  });

  suite('UnsourcedCommitSectionView', () => {
    test('unpushed commits include remote in section header', () => {
      const upstream = makeUpstream({ remote: 'origin', name: 'main' });
      const view = new UnsourcedCommitSectionView(
        Section.UnpushedTo,
        upstream,
        [makeCommit({ hash: 'aaaaaaa', message: 'Pending push' })],
        [],
      );
      assertView(view, `
Unpushed to origin/main (1)
aaaaaaa Pending push

`);
    });
  });

  suite('StashSectionView', () => {
    test('lists each stash with its index', () => {
      const view = new StashSectionView([
        makeStash(0, 'WIP on main: aaa quick fix'),
        makeStash(1, 'On feature: experimental work'),
      ]);
      assertView(view, `
Stashes (2)
stash@{0} WIP on main: aaa quick fix
stash@{1} On feature: experimental work
`);
    });
  });

  suite('WorktreeSectionView', () => {
    test('marks the current worktree and lines up branch and hash columns', () => {
      const main = Uri.file('/repo/main');
      const view = new WorktreeSectionView(
        [
          { path: main, head: 'aaaaaaaaaa', branch: 'main', bare: false, detached: false },
          { path: Uri.file('/repo/feat'), head: 'bbbbbbbbbb', branch: 'feature/x', bare: false, detached: false, locked: '' },
          { path: Uri.file('/repo/dt'), head: 'cccccccccc', bare: false, detached: true },
        ],
        main,
      );
      assertView(view, `
Worktrees (3)
* main        aaaaaaa  /repo/main
  feature/x   bbbbbbb  /repo/feat  locked
  (detached)  ccccccc  /repo/dt
`);
    });
  });

  suite('ErrorMessageView', () => {
    test('truncates and prefixes git errors', () => {
      const view = new ErrorMessageView('fatal: something\nmore lines\n');
      assertView(view, 'GitError! fatal: something [ $ for detailed log ]');
    });
  });

  suite('MagitStatusView', () => {
    test('clean repo with HEAD shows just the HEAD: header line', () => {
      const HEAD = makeBranch({ name: 'main', commit: 'abc123def', message: 'Initial commit' });
      const repo = makeRepository({ HEAD });
      const view = new MagitStatusView(MagitStatus.buildUri(repo));
      view.update(repo);

      assertView(view, `
HEAD: repo main

`);
    });

    test('comprehensive repo: changes, stashes, untracked, and inline log under HEAD:', () => {
      const HEAD = makeBranch({ name: 'main', commit: 'aaaaaaa', message: 'Initial commit' });
      const headRef = makeRef({ name: 'main', commit: 'aaaaaaa' });

      const repo = makeRepository({
        HEAD,
        branches: [headRef],
        workingTreeChanges: [
          makeChange({ path: 'src/foo.ts', status: Status.MODIFIED }),
        ],
        indexChanges: [
          makeChange({ path: 'src/added.ts', status: Status.INDEX_ADDED }),
        ],
        stashes: [makeStash(0, 'WIP on main: tinkering')],
        untrackedFiles: [
          makeChange({ path: 'tmp.log', status: Status.UNTRACKED }),
        ],
        log: [
          makeCommit({ hash: 'aaaaaaa', message: 'Initial commit' }),
          makeCommit({ hash: 'bbbbbbb', message: 'Earlier work' }),
        ],
      });

      const view = new MagitStatusView(MagitStatus.buildUri(repo));
      view.update(repo);

      assertView(view, `
HEAD: repo main
aaaaaaa main Initial commit
bbbbbbb Earlier work

Unstaged changes (1)
modified   src/foo.ts

Staged changes (1)
new file   src/added.ts

Stashes (1)
stash@{0} WIP on main: tinkering

Untracked files (1)
tmp.log

`);
    });

    test('upstream ahead/behind fold into the combined log under HEAD:', () => {
      const HEAD = makeBranch({
        name: 'feature',
        commit: 'aaaaaaa',
        message: 'Local tip',
        upstreamRemote: makeUpstream({
          remote: 'origin',
          name: 'feature',
          commitMessage: 'Upstream tip',
          commitsAhead: [makeCommit({ hash: 'ccccccc', message: 'Local-only commit' })],
          commitsBehind: [makeCommit({ hash: 'ddddddd', message: 'Remote-only commit' })],
        }),
      });
      const repo = makeRepository({
        HEAD,
        log: [
          makeCommit({ hash: 'ccccccc', message: 'Local-only commit' }),
          makeCommit({ hash: 'aaaaaaa', message: 'Local tip' }),
        ],
      });
      const view = new MagitStatusView(MagitStatus.buildUri(repo));
      view.update(repo);

      assertView(view, `
HEAD: repo feature
ddddddd Remote-only commit
ccccccc Local-only commit
aaaaaaa Local tip
Merge:
origin/feature Upstream tip

`);
    });

  });
});
