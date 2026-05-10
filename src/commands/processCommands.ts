import ProcessView, { Process } from '../views/processView';
import { Range } from 'vscode';
import { MagitRepository } from '../models/magitRepository';
import ViewUtils from '../utils/viewUtils';

export async function processView(repository: MagitRepository) {

  const uri = Process.buildUri(repository);
  let processView = ViewUtils.createOrUpdateView(repository, uri, () => new ProcessView(uri));

  return ViewUtils.showView(uri, processView, { selection: new Range(100000, 0, 100000, 0) });
}
