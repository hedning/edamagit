import { Uri, workspace } from 'vscode';
import * as path from 'path';
import * as JSONC from 'jsonc-parser';

import { MagitFileSystemProvider } from './magitFileSystemProvider';
import MagitStatusView from '../views/magitStatusView';
import LogView from '../views/logView';
import { CommitDetailView } from '../views/commitDetailView';
import { HelpView } from '../views/helpView';
import ShowRefsView from '../views/showRefsView';
import SubmoduleListView from '../views/submoduleListView';
import { internalMagitStatus } from '../commands/statusCommands';
import { getRef } from '../commands/visitAtPointCommands';
import { getCommit } from '../utils/commitCache';
import { logPath, magitRepositories } from '../extension';
import { MagitRepository } from '../models/magitRepository';
import { leafFromMagitUri, repoUriFromMagitUri } from '../common/magitUri';

async function ensureRepo(uri: Uri): Promise<MagitRepository | undefined> {
  const repoUri = repoUriFromMagitUri(uri);
  const fsPath = repoUri.fsPath;
  if (!fsPath) return undefined;
  let repo = magitRepositories.get(fsPath);
  if (!repo) {
    repo = await internalMagitStatus(repoUri);
    magitRepositories.set(fsPath, repo);
  }
  return repo;
}

export function registerMagitViewBuilders(provider: MagitFileSystemProvider): void {

  provider.registerRebuilder(
    uri => leafFromMagitUri(uri) === MagitStatusView.UriPath,
    async uri => {
      const repo = await ensureRepo(uri);
      return repo ? new MagitStatusView(uri, repo) : undefined;
    },
  );

  provider.registerRebuilder(
    uri => leafFromMagitUri(uri).startsWith('Log: '),
    async uri => {
      const repo = await ensureRepo(uri);
      if (!repo) return undefined;
      const leaf = leafFromMagitUri(uri);
      const revs = leaf.slice('Log: '.length).split(' ').filter(r => r.length > 0);
      const args = uri.fragment ? uri.fragment.split('&') : [];
      const view = new LogView(uri, repo, args, revs, []);
      await view.initialUpdate;
      return view;
    },
  );

  provider.registerRebuilder(
    uri => leafFromMagitUri(uri) === CommitDetailView.UriPath,
    async uri => {
      const repo = await ensureRepo(uri);
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
    },
  );

  provider.registerRebuilder(
    uri => leafFromMagitUri(uri) === HelpView.UriPath,
    async uri => {
      const keybindingsPath = path.join(logPath, '..', '..', '..', '..', 'User', 'keybindings.json');
      let userKeyBindings: any = [];
      try {
        const doc = await workspace.openTextDocument(keybindingsPath);
        const text = doc.getText().replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
        userKeyBindings = JSONC.parse(text);
      } catch { }
      return new HelpView(uri, userKeyBindings);
    },
  );

  provider.registerRebuilder(
    uri => leafFromMagitUri(uri) === ShowRefsView.UriPath,
    async uri => {
      const repo = await ensureRepo(uri);
      return repo ? new ShowRefsView(uri, repo) : undefined;
    },
  );

  provider.registerRebuilder(
    uri => leafFromMagitUri(uri) === SubmoduleListView.UriPath,
    async uri => {
      const repo = await ensureRepo(uri);
      return repo ? new SubmoduleListView(uri, repo) : undefined;
    },
  );
}
