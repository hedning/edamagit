import { Process } from '../views/processView';
import { Range } from 'vscode';
import { MagitRepository } from '../models/magitRepository';
import ViewUtils from '../utils/viewUtils';

export async function processView(repository: MagitRepository) {
  const view = await ViewUtils.buildOrUpdate(repository, Process);
  if (view) return ViewUtils.showView(view.uri, view, { selection: new Range(100000, 0, 100000, 0) });
}
