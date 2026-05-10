import { Uri, ViewColumn } from 'vscode';
import { MagitRepository } from '../models/magitRepository';
import { Blame } from '../views/blameView';
import ViewUtils from '../utils/viewUtils';

export async function blameFile(repository: MagitRepository, fileUri: Uri) {
  const view = await ViewUtils.buildOrUpdate(repository, Blame, fileUri);
  if (view) return ViewUtils.showView(view.uri, view, { viewColumn: ViewColumn.Active });
}
