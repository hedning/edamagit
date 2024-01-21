import ProcessView from '../views/processView';
import { Range } from 'vscode';
import { MagitRepository } from '../models/magitRepository';
import ViewUtils from '../utils/viewUtils';

export async function processView(repository: Thenable<MagitRepository | undefined>) {
  const repo = await repository;
  if (!repo) return;

  const uri = ProcessView.encodeLocation(repo);
  let processView = ViewUtils.createOrUpdateView(repo, uri, () => new ProcessView(uri));

  return ViewUtils.showView(uri, processView, { selection: new Range(100000, 0, 100000, 0) });
}
