import { MagitFileSystemProvider } from './magitFileSystemProvider';
import MagitStatusView from '../views/magitStatusView';
import LogView from '../views/logView';
import { CommitDetailView } from '../views/commitDetailView';
import { HelpView } from '../views/helpView';
import ShowRefsView from '../views/showRefsView';
import SubmoduleListView from '../views/submoduleListView';

export function registerMagitViewBuilders(provider: MagitFileSystemProvider): void {
  provider.register(MagitStatusView);
  provider.register(LogView);
  provider.register(CommitDetailView);
  provider.register(HelpView);
  provider.register(ShowRefsView);
  provider.register(SubmoduleListView);
}
