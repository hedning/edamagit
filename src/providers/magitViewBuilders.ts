import { MagitFileSystemProvider } from './magitFileSystemProvider';
import { MagitStatus } from '../views/magitStatusView';
import { Log } from '../views/logView';
import { CommitDetail } from '../views/commitDetailView';
import { Help } from '../views/helpView';
import { ShowRefs } from '../views/showRefsView';
import { SubmoduleList } from '../views/submoduleListView';
import { Process } from '../views/processView';
import { SectionDiff } from '../views/sectionDiffView';

// Kinds registered here can be restored from URI alone after a window
// reload (each implements `build`). Kinds that don't appear here (Diff,
// StashDetail, Blame, PullRequest, Issue) hold transient state not encoded
// in the URI — their tabs are dropped on reload.
export function registerMagitViewBuilders(provider: MagitFileSystemProvider): void {
  provider.register(MagitStatus);
  provider.register(Log);
  provider.register(CommitDetail);
  provider.register(Help);
  provider.register(ShowRefs);
  provider.register(SubmoduleList);
  provider.register(Process);
  provider.register(SectionDiff);
}
