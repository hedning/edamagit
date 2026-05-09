import { Uri } from 'vscode';
import {
  Commit,
  Ref,
  RefType,
  Status,
} from '../../../typings/git';
import { MagitChange } from '../../../models/magitChange';
import { MagitChangeHunk } from '../../../models/magitChangeHunk';
import { MagitBranch, MagitUpstreamRef } from '../../../models/magitBranch';
import { MagitRepository } from '../../../models/magitRepository';
import { Stash } from '../../../models/stash';
import { View } from '../../../views/general/view';

export const REPO_URI = Uri.parse('file:///repo');

export function fileUri(relPath: string): Uri {
  return Uri.parse(`file:///repo/${relPath}`);
}

export function makeCommit(overrides: Partial<Commit> & { hash: string; message: string }): Commit {
  return {
    parents: [],
    authorDate: undefined,
    authorName: undefined,
    authorEmail: undefined,
    commitDate: undefined,
    ...overrides,
  } as Commit;
}

export function makeChange(opts: {
  path: string;
  status: Status;
  hunks?: MagitChangeHunk[];
}): MagitChange {
  const uri = fileUri(opts.path);
  return {
    uri,
    originalUri: uri,
    renameUri: undefined,
    status: opts.status,
    relativePath: opts.path,
    hunks: opts.hunks,
  };
}

export function makeHunk(diff: string, diffHeader = ''): MagitChangeHunk {
  return { diff, diffHeader, uri: REPO_URI };
}

export function makeStash(index: number, description: string): Stash {
  return { index, description };
}

export function makeBranch(opts: {
  name: string;
  commit: string;
  message: string;
  upstreamRemote?: MagitUpstreamRef;
  pushRemote?: MagitUpstreamRef;
}): MagitBranch {
  return {
    type: RefType.Head,
    name: opts.name,
    commit: opts.commit,
    commitDetails: makeCommit({ hash: opts.commit, message: opts.message }),
    upstreamRemote: opts.upstreamRemote,
    pushRemote: opts.pushRemote,
  };
}

export function makeUpstream(opts: {
  remote: string;
  name: string;
  commitMessage?: string;
  commitsAhead?: Commit[];
  commitsBehind?: Commit[];
  rebase?: boolean;
}): MagitUpstreamRef {
  return {
    remote: opts.remote,
    name: opts.name,
    commit: opts.commitMessage
      ? makeCommit({ hash: 'upstream0', message: opts.commitMessage })
      : undefined,
    commitsAhead: opts.commitsAhead,
    commitsBehind: opts.commitsBehind,
    rebase: opts.rebase,
  };
}

export function makeRef(opts: { name: string; commit: string; type?: RefType; remote?: string }): Ref {
  return {
    type: opts.type ?? RefType.Head,
    name: opts.name,
    commit: opts.commit,
    remote: opts.remote,
  };
}

export function makeRepository(overrides: Partial<MagitRepository> = {}): MagitRepository {
  return {
    uri: REPO_URI,
    HEAD: undefined,
    workingTreeChanges: [],
    indexChanges: [],
    untrackedFiles: [],
    stashes: [],
    log: [],
    branches: [],
    remotes: [],
    tags: [],
    refs: [],
    submodules: [],
    worktrees: [],
    ...overrides,
  };
}

/**
 * Render a view tree into a single newline-joined string suitable for
 * inline-snapshot comparison.
 */
export function renderView(view: View): string {
  return view.render(0).join('\n');
}
