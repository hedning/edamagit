import { workspace } from 'vscode';
import { HelpView } from '../views/helpView';
import { MagitRepository } from '../models/magitRepository';
import * as path from 'path';
import * as JSONC from 'jsonc-parser';
import ViewUtils from '../utils/viewUtils';
import { logPath } from '../extension';

export async function magitHelp(repository: Thenable<MagitRepository | undefined>) {
  return openHelpView(repository);
}

export async function magitDispatch(repository: Thenable<MagitRepository | undefined>) {
  return openHelpView(repository);
}

async function openHelpView(repository: Thenable<MagitRepository | undefined>) {
  let keybindingsPath = path.join(logPath, '..', '..', '..', '..', 'User', 'keybindings.json');
  let userKeyBindings = [];

  try {
    const userKeyBindingsDoc = await workspace.openTextDocument(keybindingsPath);
    const userKeyBindingsText = userKeyBindingsDoc.getText().replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    userKeyBindings = JSONC.parse(userKeyBindingsText);
  } catch (e) { console.error(e); }
  const repo = await repository;
  if (!repo) return;

  const uri = HelpView.encodeLocation(repo);
  return ViewUtils.showView(uri, new HelpView(uri, userKeyBindings));
}