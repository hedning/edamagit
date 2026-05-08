import { MagitChange } from '../models/magitChange';
import { workspace, window, Uri } from 'vscode';
import { magitRepositories, views } from '../extension';
import FilePathUtils from '../utils/filePathUtils';
import GitTextUtils from '../utils/gitTextUtils';
import MagitUtils from '../utils/magitUtils';
import MagitStatusView from '../views/magitStatusView';
import { Status, Commit, RefType, Repository, Change, Ref } from '../typings/git';
import { MagitBranch, MagitUpstreamRef } from '../models/magitBranch';
import { gitRun, LogLevel } from '../utils/gitRawRunner';
import * as Constants from '../common/constants';
import { getCommit } from '../utils/commitCache';
import { MagitRemote } from '../models/magitRemote';
import { MagitRebasingState } from '../models/magitRebasingState';
import { MagitMergingState } from '../models/magitMergingState';
import { MagitRevertingState } from '../models/magitRevertingState';
import { Stash } from '../models/stash';
import { MagitRepository } from '../models/magitRepository';
import ViewUtils from '../utils/viewUtils';
import { scheduleForgeStatusAsync, forgeStatusCached } from '../forge';
import { diffToMagitChanges } from '../utils/diffParser';

export async function magitRefresh() { }

export async function magitStatus(): Promise<any> {

  const editor = window.activeTextEditor;

  let repository = MagitUtils.getCurrentMagitRepoNO_STATUS(editor?.document.uri);

  // TODO: NB: There is special handling of repo and view here for reasons:
  //        1. The speed cheat in MagitUtils->getCurrentMagitRepo
  //        2. window->showTextDocument of the current view resulting in duplication of the view

  if (repository) {

    const uri = MagitStatusView.encodeLocation(repository);

    // Checks for existing Magit status view
    let view = views.get(uri.toString());
    if (view) {
      /** Just fire off the update in the background, it can take while, so we want to show what we already
       * have immediately
       */
      MagitUtils.magitStatusAndUpdate(repository);
      if (editor?.document.uri.path === MagitStatusView.UriPath) {
        return;
      }
      return workspace.openTextDocument(view.uri).then(doc => window.showTextDocument(doc, { viewColumn: ViewUtils.showDocumentColumn(), preview: false }));
    }

    repository = await internalMagitStatus(repository.gitRepository);
    magitRepositories.set(repository.uri.fsPath, repository);

  } else {
    // TODO: Maybe call new func MagitUtils.discoverRepo_Status instead to avoid double tapping "getCurrentMagitRepoNO_STATUS"
    repository = await MagitUtils.getCurrentMagitRepo(editor?.document.uri);
  }

  if (repository) {
    scheduleForgeStatusAsync(repository);
    const uri = MagitStatusView.encodeLocation(repository);
    return ViewUtils.showView(uri, ViewUtils.createOrUpdateView(repository, uri, () => new MagitStatusView(uri, repository!)));
  }
}

export async function internalMagitStatus(repository: Repository): Promise<MagitRepository> {

  await repository.status();

  const dotGitPath = repository.rootUri + '/.git/';

  const stashTask = getStashes(repository);

  const logTask = repository.state.HEAD?.commit ? repository.log({ maxEntries: 100 }) : Promise.resolve([]);
  const headRef = repository.state.HEAD;

  if (repository.state.HEAD?.commit) {
    getCommit(repository.rootUri, repository.state.HEAD?.commit);
  }

  /*  This is slow and needs to be replaced with someting like one call to git log + parsing the output into commits */
  // let commitsAheadUpstream: string[] = [], commitsBehindUpstream: string[] = [];
  // if (repository.state.HEAD?.ahead || repository.state.HEAD?.behind) {
  //   const ref = repository.state.HEAD.name;
  //   const args = ['rev-list', '--left-right', `${ref}...${ref}@{u}`];
  //   const res = (await gitRun(repository, args, {}, LogLevel.None)).stdout;
  //   [commitsAheadUpstream, commitsBehindUpstream] = GitTextUtils.parseRevListLeftRight(res);
  //   commitsAheadUpstream.map(c => getCommit(repository, c));
  //   commitsBehindUpstream.map(c => getCommit(repository, c));
  // }

  const workingTreeChanges_NoUntracked = repository.state.workingTreeChanges
    .filter(c => (c.status !== Status.UNTRACKED));

  const untrackedFiles: MagitChange[] =
    (repository.state.workingTreeChanges.length > workingTreeChanges_NoUntracked.length) && headRef ?
      (await gitRun(repository, ['ls-files', '--others', '--exclude-standard', '--directory', '--no-empty-directory'], {}, LogLevel.None))
        .stdout
        .replace(Constants.FinalLineBreakRegex, '')
        .split(Constants.LineSplitterRegex)
        .map(untrackedPath => {
          const uri = Uri.parse(repository.rootUri.path + '/' + untrackedPath);
          return {
            originalUri: uri,
            renameUri: uri,
            uri: uri,
            status: Status.UNTRACKED,
            ref: headRef,
            relativePath: FilePathUtils.uriPathRelativeTo(uri, repository.rootUri)
          };
        }) : [];

  const workingTreeChangesTasks = gitRun(repository, ['diff']).then(res => {
    return diffToMagitChanges(res.stdout, repository.rootUri, headRef);
  });

  const indexChangesTasks = gitRun(repository, ['diff', '--staged']).then(res => {
    return diffToMagitChanges(res.stdout, repository.rootUri, headRef);
  });

  const conflictsTask = gitRun(repository, ['status', '--porcelain', '-z'], {}, LogLevel.None)
    .then(res => GitTextUtils.parseConflictStatuses(res.stdout), () => new Map<string, Status>());

  const sequencerTodoPath = Uri.parse(dotGitPath + 'sequencer/todo');
  const sequencerHeadPath = Uri.parse(dotGitPath + 'sequencer/head');

  const mergingStateTask = mergingStatus(repository, dotGitPath);
  const rebasingStateTask = rebasingStatus(repository, dotGitPath, logTask);
  const cherryPickingStateTask = cherryPickingStatus(repository, dotGitPath, sequencerTodoPath, sequencerHeadPath);
  const revertingStateTask = revertingStatus(repository, dotGitPath, sequencerTodoPath, sequencerHeadPath);

  const HEAD = repository.state.HEAD as MagitBranch | undefined;

  const refs = await getRefs(repository);

  if (HEAD?.commit) {
    HEAD.commitDetails = await getCommit(repository.rootUri, HEAD.commit);

    HEAD.tag = refs.find(r => HEAD?.commit === r.commit && r.type === RefType.Tag);

    try {
      // if (HEAD.upstream?.remote) {
      //   const upstreamRemote = HEAD.upstream.remote;

      //   const upstreamRemoteCommit = refs.find(ref => ref.remote === upstreamRemote && ref.name === `${upstreamRemote}/${HEAD.upstream?.name}`)?.commit;
      //   const upstreamRemoteCommitDetails = upstreamRemoteCommit ? getCommit(repository, upstreamRemoteCommit) : undefined;

      //   const isRebaseUpstream = repository.getConfig(`branch.${HEAD.upstream.name}.rebase`);

      //   HEAD.upstreamRemote = HEAD.upstream;
      //   HEAD.upstreamRemote.commit = await upstreamRemoteCommitDetails;
      //   HEAD.upstreamRemote.commitsAhead = await Promise.all(commitsAheadUpstream.map(hash => getCommit(repository, hash)));
      //   HEAD.upstreamRemote.commitsBehind = await Promise.all(commitsBehindUpstream.map(hash => getCommit(repository, hash)));
      //   HEAD.upstreamRemote.rebase = (await isRebaseUpstream) === 'true';
      // }
    } catch { }

    HEAD.pushRemote = await pushRemoteStatus(repository);
  }

  const remoteBranches = refs.filter(ref => ref.type === RefType.RemoteHead);

  const remotes: MagitRemote[] = repository.state.remotes.map(remote => ({
    ...remote,
    branches: remoteBranches.filter(remoteBranch =>
      remoteBranch.remote === remote.name &&
      remoteBranch.name !== remote.name + '/HEAD') // filter out uninteresting remote/HEAD element
  }));

  const forgeState = forgeStatusCached(remotes);

  const workingTreeChanges = await workingTreeChangesTasks;
  const indexChanges = await indexChangesTasks;
  reconcileConflicts(await conflictsTask, workingTreeChanges, indexChanges, repository.rootUri, headRef);

  return {
    uri: repository.rootUri,
    HEAD,
    stashes: await stashTask,
    log: await logTask,
    workingTreeChanges,
    indexChanges,
    untrackedFiles,
    rebasingState: await rebasingStateTask,
    mergingState: await mergingStateTask,
    cherryPickingState: await cherryPickingStateTask,
    revertingState: await revertingStateTask,
    branches: refs.filter(ref => ref.type === RefType.Head),
    remotes,
    tags: refs.filter(ref => ref.type === RefType.Tag),
    refs,
    submodules: repository.state.submodules,
    gitRepository: repository,
    forgeState: forgeState,
  };
}

export function toMagitChange(repository: Repository, change: Change, ref?: Ref, diff?: string): MagitChange {
  // Ugh, `...change` is not typesafe, and fails to give `uri`, but typescript thinks it's fine...
  const magitChange: MagitChange = change as MagitChange;
  magitChange.ref = ref;
  magitChange.relativePath = FilePathUtils.uriPathRelativeTo(change.uri, repository.rootUri);
  magitChange.diff = diff;
  magitChange.hunks = diff ? GitTextUtils.diffToHunks(diff, change.uri) : undefined;
  return magitChange;
}

async function pushRemoteStatus(repository: Repository): Promise<MagitUpstreamRef | undefined> {
  try {
    const HEAD = repository.state.HEAD;
    const pushRemote = await repository.getConfig(`branch.${HEAD!.name}.pushRemote`);

    if (HEAD?.name && pushRemote) {

      const args = ['rev-list', '--left-right', `${HEAD.name}...${pushRemote}/${HEAD.name}`];
      const res = (await gitRun(repository, args, {}, LogLevel.None)).stdout;
      const [commitsAheadPushRemote, commitsBehindPushRemote] = GitTextUtils.parseRevListLeftRight(res);

      // FIXME: This can grind everything to a halt
      // If we want to do this we need to do one fetch, and then parse `git log Foo...Bar` output
      // const commitsAhead = await Promise.all(commitsAheadPushRemote.map(c => getCommit(repository, c)));
      // const commitsBehind = await Promise.all(commitsBehindPushRemote.map(c => getCommit(repository, c)));

      const refs = await getRefs(repository);
      const pushRemoteCommit = refs.find(ref => ref.remote === pushRemote && ref.name === `${pushRemote}/${HEAD.name}`)?.commit;
      const pushRemoteCommitDetails = pushRemoteCommit ? getCommit(repository.rootUri, pushRemoteCommit) : Promise.resolve(undefined);

      return { remote: pushRemote, name: HEAD.name, commit: await pushRemoteCommitDetails };
    }
  } catch { }
}

async function mergingStatus(repository: Repository, dotGitPath: string): Promise<MagitMergingState | undefined> {

  const mergeHeadPath = Uri.parse(dotGitPath + 'MERGE_HEAD');
  const mergeMsgPath = Uri.parse(dotGitPath + 'MERGE_MSG');

  const mergeHeadFileTask = workspace.fs.readFile(mergeHeadPath).then(f => f.toString(), err => undefined);
  const mergeMsgFileTask = workspace.fs.readFile(mergeMsgPath).then(f => f.toString(), err => undefined);

  try {
    const mergeHeadText = await mergeHeadFileTask;
    const mergeMsgText = await mergeMsgFileTask;
    if (mergeHeadText && mergeMsgText) {
      const parsedMergeState = GitTextUtils.parseMergeStatus(mergeHeadText, mergeMsgText);

      if (parsedMergeState) {
        const [mergeHeadCommit, mergingBranches] = parsedMergeState;

        const mergeCommitsText = (await gitRun(repository, ['rev-list', `HEAD..${mergeHeadCommit}`], {}, LogLevel.None)).stdout;
        const mergeCommits = mergeCommitsText
          .replace(Constants.FinalLineBreakRegex, '')
          .split(Constants.LineSplitterRegex);

        return {
          mergingBranches,
          commits: await Promise.all(mergeCommits.map(c => getCommit(repository.rootUri, c)))
        };
      }
    }
  } catch { }
}

async function rebasingStatus(repository: Repository, dotGitPath: string, logTask: Promise<Commit[]>): Promise<MagitRebasingState | undefined> {
  try {

    if (repository.state.rebaseCommit) {

      let activeRebasingDirectory: Uri;
      let interactive = false;
      const rebasingDirectory = Uri.parse(dotGitPath + 'rebase-apply/');
      const interactiveRebasingDirectory = Uri.parse(dotGitPath + 'rebase-merge/');

      if (await workspace.fs.readDirectory(rebasingDirectory).then(res => res.length, err => undefined)) {
        activeRebasingDirectory = rebasingDirectory;
      } else {
        interactive = true;
        activeRebasingDirectory = interactiveRebasingDirectory;
      }

      const rebaseHeadNamePath = Uri.parse(activeRebasingDirectory + 'head-name');
      const rebaseOntoPath = Uri.parse(activeRebasingDirectory + 'onto');

      const rebaseHeadNameFileTask = workspace.fs.readFile(rebaseHeadNamePath).then(f => f.toString().replace(Constants.FinalLineBreakRegex, ''));
      const rebaseOntoPathFileTask = workspace.fs.readFile(rebaseOntoPath).then(f => f.toString().replace(Constants.FinalLineBreakRegex, ''));

      let rebaseNextIndex: number;
      let rebaseCommitListTask: Thenable<Commit[]>;

      if (interactive) {

        rebaseNextIndex = await workspace.fs.readFile(Uri.parse(dotGitPath + 'rebase-merge/msgnum'))
          .then(f => f.toString().replace(Constants.FinalLineBreakRegex, '')).then(Number.parseInt);

        rebaseCommitListTask = workspace.fs.readFile(Uri.parse(dotGitPath + 'rebase-merge/git-rebase-todo'))
          .then(f => f.toString().replace(Constants.FinalLineBreakRegex, ''), err => undefined)
          .then(GitTextUtils.parseSequencerTodo).then(commits => commits.reverse());

      } else {

        const rebaseLastIndexTask = workspace.fs.readFile(Uri.parse(dotGitPath + 'rebase-apply/last')).then(f => f.toString().replace(Constants.FinalLineBreakRegex, '')).then(Number.parseInt);
        rebaseNextIndex = await workspace.fs.readFile(Uri.parse(dotGitPath + 'rebase-apply/next')).then(f => f.toString().replace(Constants.FinalLineBreakRegex, '')).then(Number.parseInt);

        const indices: number[] = [];

        for (let i = await rebaseLastIndexTask; i > rebaseNextIndex; i--) {
          indices.push(i);
        }

        rebaseCommitListTask =
          Promise.all(
            indices.map(
              index => workspace.fs.readFile(Uri.parse(dotGitPath + 'rebase-apply/' + index.toString().padStart(4, '0'))).then(f => f.toString().replace(Constants.FinalLineBreakRegex, ''))
                .then(GitTextUtils.commitDetailTextToCommit)
            ));
      }

      let ontoCommit = await getCommit(repository.rootUri, await rebaseOntoPathFileTask!);
      const refs = await getRefs(repository);
      let ontoBranch = refs.find(ref => ref.commit === ontoCommit.hash && ref.type !== RefType.RemoteHead);

      let onto = {
        name: ontoBranch?.name ?? GitTextUtils.shortHash(ontoCommit.hash),
        commitDetails: ontoCommit
      };

      const doneCommits: Commit[] = (await logTask).slice(0, rebaseNextIndex - 1);
      const upcomingCommits: Commit[] = (await rebaseCommitListTask) ?? [];

      return {
        currentCommit: repository.state.rebaseCommit,
        origBranchName: (await rebaseHeadNameFileTask!).split('/')[2],
        onto,
        doneCommits,
        upcomingCommits
      };
    }
  } catch { }
}


async function cherryPickingStatus(repository: Repository, dotGitPath: string, sequencerTodoPath: Uri, sequencerHeadPath: Uri): Promise<MagitRevertingState | undefined> {
  try {

    const cherryPickHeadPath = Uri.parse(dotGitPath + 'CHERRY_PICK_HEAD');
    const cherryPickHeadCommitHash = await workspace.fs.readFile(cherryPickHeadPath).then(f => f.toString().replace(Constants.FinalLineBreakRegex, ''), err => undefined);

    if (cherryPickHeadCommitHash) {

      const sequencerTodoPathFileTask = workspace.fs.readFile(sequencerTodoPath)
        .then(f => f.toString().replace(Constants.FinalLineBreakRegex, ''), err => undefined);
      const sequencerHeadPathFileTask = workspace.fs.readFile(sequencerHeadPath)
        .then(f => f.toString().replace(Constants.FinalLineBreakRegex, ''), err => undefined);

      const todo = await sequencerTodoPathFileTask;
      const head = await sequencerHeadPathFileTask;

      const currentCommitTask = getCommit(repository.rootUri, cherryPickHeadCommitHash);
      const originalHeadTask = head ? getCommit(repository.rootUri, head) : getCommit(repository.rootUri, repository.state.HEAD!.commit!);

      return {
        originalHead: await originalHeadTask,
        currentCommit: await currentCommitTask,
        upcomingCommits: GitTextUtils.parseSequencerTodo(todo).slice(1).reverse()
      };
    }
  } catch { }
}

async function revertingStatus(repository: Repository, dotGitPath: string, sequencerTodoPath: Uri, sequencerHeadPath: Uri): Promise<MagitRevertingState | undefined> {
  try {

    const revertHeadPath = Uri.parse(dotGitPath + 'REVERT_HEAD');
    const revertHeadCommitHash = await workspace.fs.readFile(revertHeadPath).then(f => f.toString().replace(Constants.FinalLineBreakRegex, ''), err => undefined);

    if (revertHeadCommitHash) {
      const sequencerTodoPathFileTask = workspace.fs.readFile(sequencerTodoPath)
        .then(f => f.toString().replace(Constants.FinalLineBreakRegex, ''), err => undefined);
      const sequencerHeadPathFileTask = workspace.fs.readFile(sequencerHeadPath)
        .then(f => f.toString().replace(Constants.FinalLineBreakRegex, ''), err => undefined);

      const todo = await sequencerTodoPathFileTask;
      const head = await sequencerHeadPathFileTask;

      const currentCommitTask = getCommit(repository.rootUri, revertHeadCommitHash);
      const originalHeadTask = head ? getCommit(repository.rootUri, head) : getCommit(repository.rootUri, repository.state.HEAD!.commit!);

      return {
        originalHead: await originalHeadTask,
        currentCommit: await currentCommitTask,
        upcomingCommits: GitTextUtils.parseSequencerTodo(todo).slice(1).reverse()
      };
    }
  } catch { }
}

async function getStashes(repository: Repository, n: number = 10): Promise<Stash[]> {

  let args = ['stash', 'list', '-n', n.toFixed(0)];

  try {
    let stashesList = await gitRun(repository, args, {}, LogLevel.None);
    let stashOut = stashesList.stdout;

    if (stashOut.length === 0) {
      return [];
    }

    return stashOut
      .replace(Constants.FinalLineBreakRegex, '')
      .split(Constants.LineSplitterRegex)
      .map((stashLine, index) => ({ index, description: stashLine.replace(/stash@{\d+}: /g, '') }));

  } catch {
    return [];
  }
}

async function getRefs(repository: Repository): Promise<Ref[]> {
  // `repository.getRefs` is not available on older versions and we should
  // just use `repository.state.refs` on those versions.
  if (typeof repository.getRefs !== 'function') {
    return repository.state.refs;
  }

  return await repository.getRefs({});
}

/**
 * Ensure every unmerged path appears in the change lists with the precise
 * conflict status from `git status --porcelain`. `git diff` only emits real
 * blocks for `BOTH_MODIFIED`; the rest (DU/UD/AU/UA/DD/AA) collapse to
 * `* Unmerged path X` lines that the diff parser drops, so we synthesize
 * stub entries for those and correct the status on existing ones.
 */
function reconcileConflicts(
  conflicts: Map<string, Status>,
  workingTreeChanges: MagitChange[],
  indexChanges: MagitChange[],
  rootUri: Uri,
  headRef: Ref | undefined,
): void {
  if (conflicts.size === 0) return;

  for (const list of [workingTreeChanges, indexChanges]) {
    for (const change of list) {
      if (change.relativePath !== undefined) {
        const status = conflicts.get(change.relativePath);
        if (status !== undefined) {
          (change as { status: Status }).status = status;
        }
      }
    }
  }

  const known = new Set<string>();
  for (const c of workingTreeChanges) if (c.relativePath) known.add(c.relativePath);
  for (const c of indexChanges) if (c.relativePath) known.add(c.relativePath);

  for (const [path, status] of conflicts) {
    if (known.has(path)) continue;
    const uri = Uri.joinPath(rootUri, path);
    workingTreeChanges.push({
      status,
      uri,
      originalUri: uri,
      renameUri: undefined,
      relativePath: path,
      diff: undefined,
      hunks: undefined,
      ref: headRef,
    });
  }
}