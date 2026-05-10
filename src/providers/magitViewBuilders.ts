import { MagitFileSystemProvider } from './magitFileSystemProvider';
import MagitStatusView from '../views/magitStatusView';
import LogView from '../views/logView';
import { CommitDetailView } from '../views/commitDetailView';
import { HelpView } from '../views/helpView';
import ShowRefsView from '../views/showRefsView';
import SubmoduleListView from '../views/submoduleListView';
import ProcessView from '../views/processView';
import SectionDiffView from '../views/sectionDiffView';

// Views registered here can be restored from URI alone after a window
// reload (each implements `static rebuild`). Views that don't appear here
// (DiffView, StashDetailView, BlameView, PullRequestView, IssueView) hold
// transient state not encoded in the URI — their tabs are dropped on reload.
export function registerMagitViewBuilders(provider: MagitFileSystemProvider): void {
  provider.register(MagitStatusView);
  provider.register(LogView);
  provider.register(CommitDetailView);
  provider.register(HelpView);
  provider.register(ShowRefsView);
  provider.register(SubmoduleListView);
  provider.register(ProcessView);
  provider.register(SectionDiffView);
}
