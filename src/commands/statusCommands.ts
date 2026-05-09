import { MagitChange } from '../models/magitChange';
import { workspace, window, Uri } from 'vscode';
import { magitRepositories, views } from '../extension';
import FilePathUtils from '../utils/filePathUtils';
import GitTextUtils from '../utils/gitTextUtils';
import MagitUtils from '../utils/magitUtils';
import MagitStatusView from '../views/magitStatusView';
import { Status, Commit, RefType, Repository, Change, Ref } from '../typings/git';
import { MagitBranch, MagitUpstreamRef } from '../models/magitBranch';
import { gitRun, gitRunInUri, LogLevel } from '../utils/gitRawRunner';
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
import {
  readPorcelainStatus,
  readRefs,
  readRemotes,
  readSubmodules,
  readLog,
  readConfig,
  readRebaseCommitHash,
  PorcelainHead,
} from '../utils/repoStatus';

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
      if (editor?.document.uri.toString() === uri.toString()) {
        return;
      }
      return workspace.openTextDocument(view.uri).then(doc => window.showTextDocument(doc, { viewColumn: ViewUtils.showDocumentColumn(), preview: false }));
    }

    repository = await internalMagitStatus(repository.uri, repository.gitRepository);
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

/**
 * Open a magit-status view for an arbitrary worktree path. Used by the
 * worktree list — the VSCode git extension does not enumerate sibling
 * worktrees, so we build the MagitRepository from direct git ourselves.
 */
export async function magitStatusForPath(workTreeUri: Uri): Promise<any> {

  let repository = magitRepositories.get(workTreeUri.fsPath);

  if (repository) {
    const uri = MagitStatusView.encodeLocation(repository);
    if (views.get(uri.toString())) {
      MagitUtils.magitStatusAndUpdate(repository);
      return workspace.openTextDocument(uri).then(doc => window.showTextDocument(doc, { viewColumn: ViewUtils.showDocumentColumn(), preview: false }));
    }
  } else {
    repository = await internalMagitStatus(workTreeUri);
    magitRepositories.set(repository.uri.fsPath, repository);
  }

  scheduleForgeStatusAsync(repository);
  const uri = MagitStatusView.encodeLocation(repository);
  return ViewUtils.showView(uri, ViewUtils.createOrUpdateView(repository, uri, () => new MagitStatusView(uri, repository!)));
}

export async function internalMagitStatus(rootUri: Uri, gitRepository?: Repository): Promise<MagitRepository> {

  const repo = { rootUri };
  const dotGitPath = rootUri + '/.git/';

  const porcelainTask = readPorcelainStatus(rootUri);
  const refsTask = readRefs(rootUri);
  const remotesTask = readRemotes(rootUri);
  const submodulesTask = readSubmodules(rootUri);
  const stashTask = getStashes(repo);
  const rebaseHashTask = readRebaseCommitHash(rootUri);

  const porcelain = await porcelainTask;
  const headRef = porcelainHeadAsRef(porcelain.HEAD);

  const logTask = readLog(rootUri, porcelain.HEAD.commit, 100);

  if (porcelain.HEAD.commit) {
    getCommit(rootUri, porcelain.HEAD.commit);
  }

  const untrackedFiles: MagitChange[] =
    porcelain.hasUntracked && headRef ?
      (await gitRunInUri(rootUri, ['ls-files', '--others', '--exclude-standard', '--directory', '--no-empty-directory'], {}, LogLevel.None))
        .stdout
        .replace(Constants.FinalLineBreakRegex, '')
        .split(Constants.LineSplitterRegex)
        .map(untrackedPath => {
          const uri = Uri.parse(rootUri.path + '/' + untrackedPath);
          return {
            originalUri: uri,
            renameUri: uri,
            uri: uri,
            status: Status.UNTRACKED,
            ref: headRef,
            relativePath: FilePathUtils.uriPathRelativeTo(uri, rootUri)
          };
        }) : [];

  const workingTreeChangesTasks = gitRunInUri(rootUri, ['diff']).then(res => {
    return diffToMagitChanges(res.stdout, rootUri, headRef);
  });

  const indexChangesTasks = gitRunInUri(rootUri, ['diff', '--staged']).then(res => {
    return diffToMagitChanges(res.stdout, rootUri, headRef);
  });

  const conflictsTask = gitRunInUri(rootUri, ['status', '--porcelain', '-z'], {}, LogLevel.None)
    .then(res => GitTextUtils.parseConflictStatuses(res.stdout), () => new Map<string, Status>());

  const sequencerTodoPath = Uri.parse(dotGitPath + 'sequencer/todo');
  const sequencerHeadPath = Uri.parse(dotGitPath + 'sequencer/head');

  const mergingStateTask = mergingStatus(repo, dotGitPath);
  const rebasingStateTask = rebasingStatus(repo, dotGitPath, logTask, rebaseHashTask);
  const cherryPickingStateTask = cherryPickingStatus(repo, dotGitPath, sequencerTodoPath, sequencerHeadPath, porcelain.HEAD.commit);
  const revertingStateTask = revertingStatus(repo, dotGitPath, sequencerTodoPath, sequencerHeadPath, porcelain.HEAD.commit);

  const HEAD: MagitBranch | undefined = porcelainHeadToMagitBranch(porcelain.HEAD);

  const { refs, remoteHeads } = await refsTask;

  if (HEAD?.commit) {
    HEAD.commitDetails = await getCommit(rootUri, HEAD.commit);

    HEAD.tag = refs.find(r => HEAD?.commit === r.commit && r.type === RefType.Tag);

    HEAD.pushRemote = await pushRemoteStatus(repo, HEAD);
  }

  const remoteBranches = refs.filter(ref => ref.type === RefType.RemoteHead);

  const remotes: MagitRemote[] = (await remotesTask).map(remote => ({
    ...remote,
    branches: remoteBranches.filter(remoteBranch =>
      remoteBranch.remote === remote.name &&
      remoteBranch.name !== remote.name + '/HEAD'), // filter out uninteresting remote/HEAD element
    defaultBranch: remoteHeads.get(remote.name),
  }));

  const forgeState = forgeStatusCached(remotes);

  const workingTreeChanges = await workingTreeChangesTasks;
  const indexChanges = await indexChangesTasks;
  reconcileConflicts(await conflictsTask, workingTreeChanges, indexChanges, rootUri, headRef);

  return {
    uri: rootUri,
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
    submodules: await submodulesTask,
    gitRepository,
    forgeState: forgeState,
  };
}

function porcelainHeadAsRef(head: PorcelainHead): Ref | undefined {
  if (head.commit === undefined && head.name === undefined) return undefined;
  return { type: RefType.Head, name: head.name, commit: head.commit };
}

function porcelainHeadToMagitBranch(head: PorcelainHead): MagitBranch | undefined {
  if (head.commit === undefined && head.name === undefined) return undefined;
  return ({
    type: RefType.Head,
    name: head.name,
    commit: head.commit,
    upstream: head.upstream,
    ahead: head.ahead,
    behind: head.behind,
  } as MagitBranch);
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

async function pushRemoteStatus(repo: { rootUri: Uri }, HEAD: MagitBranch): Promise<MagitUpstreamRef | undefined> {
  try {
    const pushRemote = await readConfig(repo.rootUri, `branch.${HEAD.name}.pushRemote`);

    if (HEAD.name && pushRemote) {

      const args = ['rev-list', '--left-right', `${HEAD.name}...${pushRemote}/${HEAD.name}`];
      const res = (await gitRun(repo, args, {}, LogLevel.None)).stdout;
      // Result currently unused (see comments below) but invoked for parity.
      GitTextUtils.parseRevListLeftRight(res);

      // FIXME: This can grind everything to a halt
      // If we want to do this we need to do one fetch, and then parse `git log Foo...Bar` output
      // const commitsAhead = await Promise.all(commitsAheadPushRemote.map(c => getCommit(repo.rootUri, c)));
      // const commitsBehind = await Promise.all(commitsBehindPushRemote.map(c => getCommit(repo.rootUri, c)));

      const { refs } = await readRefs(repo.rootUri);
      const pushRemoteCommit = refs.find(ref => ref.remote === pushRemote && ref.name === `${pushRemote}/${HEAD.name}`)?.commit;
      const pushRemoteCommitDetails = pushRemoteCommit ? getCommit(repo.rootUri, pushRemoteCommit) : Promise.resolve(undefined);

      return { remote: pushRemote, name: HEAD.name, commit: await pushRemoteCommitDetails };
    }
  } catch { }
}

async function mergingStatus(repo: { rootUri: Uri }, dotGitPath: string): Promise<MagitMergingState | undefined> {

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

        const mergeCommitsText = (await gitRun(repo, ['rev-list', `HEAD..${mergeHeadCommit}`], {}, LogLevel.None)).stdout;
        const mergeCommits = mergeCommitsText
          .replace(Constants.FinalLineBreakRegex, '')
          .split(Constants.LineSplitterRegex);

        return {
          mergingBranches,
          commits: await Promise.all(mergeCommits.map(c => getCommit(repo.rootUri, c)))
        };
      }
    }
  } catch { }
}

async function rebasingStatus(repo: { rootUri: Uri }, dotGitPath: string, logTask: Promise<Commit[]>, rebaseHashTask: Promise<string | undefined>): Promise<MagitRebasingState | undefined> {
  try {

    const rebaseHash = await rebaseHashTask;
    if (rebaseHash) {

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

      const ontoCommit = await getCommit(repo.rootUri, await rebaseOntoPathFileTask!);
      const rebaseCurrentCommit = await getCommit(repo.rootUri, rebaseHash);
      const { refs } = await readRefs(repo.rootUri);
      const ontoBranch = refs.find(ref => ref.commit === ontoCommit.hash && ref.type !== RefType.RemoteHead);

      const onto = {
        name: ontoBranch?.name ?? GitTextUtils.shortHash(ontoCommit.hash),
        commitDetails: ontoCommit
      };

      const doneCommits: Commit[] = (await logTask).slice(0, rebaseNextIndex - 1);
      const upcomingCommits: Commit[] = (await rebaseCommitListTask) ?? [];

      return {
        currentCommit: rebaseCurrentCommit,
        origBranchName: (await rebaseHeadNameFileTask!).split('/')[2],
        onto,
        doneCommits,
        upcomingCommits
      };
    }
  } catch { }
}


async function cherryPickingStatus(repo: { rootUri: Uri }, dotGitPath: string, sequencerTodoPath: Uri, sequencerHeadPath: Uri, currentHeadCommit: string | undefined): Promise<MagitRevertingState | undefined> {
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

      const currentCommitTask = getCommit(repo.rootUri, cherryPickHeadCommitHash);
      const originalHeadTask = head ? getCommit(repo.rootUri, head) : getCommit(repo.rootUri, currentHeadCommit!);

      return {
        originalHead: await originalHeadTask,
        currentCommit: await currentCommitTask,
        upcomingCommits: GitTextUtils.parseSequencerTodo(todo).slice(1).reverse()
      };
    }
  } catch { }
}

async function revertingStatus(repo: { rootUri: Uri }, dotGitPath: string, sequencerTodoPath: Uri, sequencerHeadPath: Uri, currentHeadCommit: string | undefined): Promise<MagitRevertingState | undefined> {
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

      const currentCommitTask = getCommit(repo.rootUri, revertHeadCommitHash);
      const originalHeadTask = head ? getCommit(repo.rootUri, head) : getCommit(repo.rootUri, currentHeadCommit!);

      return {
        originalHead: await originalHeadTask,
        currentCommit: await currentCommitTask,
        upcomingCommits: GitTextUtils.parseSequencerTodo(todo).slice(1).reverse()
      };
    }
  } catch { }
}

async function getStashes(repo: { rootUri: Uri }, n: number = 10): Promise<Stash[]> {

  let args = ['stash', 'list', '-n', n.toFixed(0)];

  try {
    let stashesList = await gitRun(repo, args, {}, LogLevel.None);
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