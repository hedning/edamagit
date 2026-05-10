import { Uri, ViewColumn, workspace } from 'vscode';
import { MagitRepository } from '../models/magitRepository';
import { gitRun, gitRunInUri } from '../utils/gitRawRunner';
import { BlameView } from '../views/blameView';
import ViewUtils from '../utils/viewUtils';

export async function blameFile(repository: MagitRepository, fileUri: Uri) {

  const blameResult = await gitRunInUri(repository.uri, ['blame', fileUri.fsPath]);

  const uri = BlameView.buildUri(repository, fileUri);
  return ViewUtils.showView(uri, new BlameView(uri, blameResult.stdout), { viewColumn: ViewColumn.Active });
}