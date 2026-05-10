import { Help } from '../views/helpView';
import { MagitRepository } from '../models/magitRepository';
import ViewUtils from '../utils/viewUtils';

export async function magitHelp(repository: MagitRepository) {
  return openHelpView(repository);
}

export async function magitDispatch(repository: MagitRepository) {
  return openHelpView(repository);
}

async function openHelpView(repository: MagitRepository) {
  const view = await ViewUtils.buildOrUpdate(repository, Help);
  if (view) return ViewUtils.showView(view.uri, view);
}
