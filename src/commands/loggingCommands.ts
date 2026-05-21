import { Uri, window } from 'vscode';
import { StatusMessageDisplayTimeout } from '../common/constants';
import { MenuState, MenuUtil, Switch, Option } from '../menu/menu';
import { MagitBranch } from '../models/magitBranch';
import { MagitLogEntry } from '../models/magitLogCommit';
import { MagitRepository } from '../models/magitRepository';
import { gitRun, LogLevel } from '../utils/gitRawRunner';
import MagitUtils from '../utils/magitUtils';
import ViewUtils from '../utils/viewUtils';
import { Log } from '../views/logView';
import { LogP } from '../views/logPView';

const loggingMenu = {
  title: 'Logging',
  commands: [
    { label: 'l', description: 'Log current', action: wrap(logCurrent) },
    { label: 'o', description: 'Log other', action: wrap(logOther) },
    { label: 'h', description: 'Log HEAD', action: wrap(logHead) },
    { label: 'L', description: 'Log local branches', action: wrap(logLocalBranches) },
    { label: 'b', description: 'Log branches', action: wrap(logBranches) },
    { label: 'a', description: 'Log references', action: wrap(logReferences) },
  ]
};

const switches: Switch[] = [
  { key: '-D', name: '--simplify-by-decoration', description: 'Simplify by decoration' },
  { key: '-g', name: '--graph', description: 'Show graph', activated: true },
  { key: '-d', name: '--decorate', description: 'Show refnames', activated: true },
  { key: '-p', name: '--patch', description: 'Show patches' }
];

const options: Option[] = [
  { key: '=n', name: '-n', description: 'Limit number of commits', value: '50', activated: true },
];

export async function logging(repository: MagitRepository) {
  return MenuUtil.showMenu(loggingMenu, { repository, switches, options });
}

// A function wrapper to avoid duplicate checking code
function wrap(action: (repository: MagitRepository, head: MagitBranch, switches: Switch[], options: Option[]) => Promise<any>) {
  return async ({ repository, switches, options }: MenuState) => {
    if (repository.HEAD && switches && options) {
      return action(repository, repository.HEAD, switches, options);
    }
  };
}

async function logCurrent(repository: MagitRepository, head: MagitBranch, switches: Switch[], options: Option[]) {
  const args = createLogArgs(switches, options);
  let revs = head.name ? [head.name] : await getRevs(repository);
  if (revs) {
    await log(repository, args, revs);
  }
}

async function logOther(repository: MagitRepository, head: MagitBranch, switches: Switch[], options: Option[]) {
  const args = createLogArgs(switches, options);
  const revs = await getRevs(repository);
  if (revs) {
    await log(repository, args, revs);
  }
}

async function logHead(repository: MagitRepository, head: MagitBranch, switches: Switch[], options: Option[]) {
  const args = createLogArgs(switches, options);
  await log(repository, args, ['HEAD']);
}

async function logLocalBranches(repository: MagitRepository, head: MagitBranch, switches: Switch[], options: Option[]) {
  const args = createLogArgs(switches, options);
  const revs = [head.name ?? 'HEAD', '--branches'];
  await log(repository, args, revs);
}

async function logBranches(repository: MagitRepository, head: MagitBranch, switches: Switch[], options: Option[]) {
  const args = createLogArgs(switches, options);
  const revs = [head.name ?? 'HEAD', '--branches', '--remotes'];
  await log(repository, args, revs);
}

async function logReferences(repository: MagitRepository, head: MagitBranch, switches: Switch[], options: Option[]) {
  const args = createLogArgs(switches, options);
  const revs = [head.name ?? 'HEAD', '--all'];
  await log(repository, args, revs);
}

export async function logFile(repository: MagitRepository, fileUri: Uri) {
  const incompatible_switch_keys = ['-g'];
  const compatible_switches = switches.map(x => (
    incompatible_switch_keys.includes(x.key) ? { ...x, activated: false } : { ...x }
  ));
  let args = createLogArgs(compatible_switches, options);
  args.push('--follow');
  await log(repository, args, ['HEAD'], [fileUri.fsPath]);
}

async function log(repository: MagitRepository, args: string[], revs: string[], paths: string[] = []) {
  const isPatch = args.includes('--patch') || args.includes('-p');
  const kind = isPatch ? LogP : Log;
  const view = await ViewUtils.buildOrUpdate(repository, kind, revs, args, paths);
  if (view) return ViewUtils.showView(view.uri, view);
}

async function getRevs(repository: MagitRepository) {
  const input = await MagitUtils.chooseRef(repository, 'Log rev,s:', false, false, true);
  if (input && input.length > 0) {
    // split space or commas
    return input.split(/[, ]/g).filter(r => r.length > 0);
  }

  window.setStatusBarMessage('Nothing selected', StatusMessageDisplayTimeout);
}

function createLogArgs(switches: Switch[], options: Option[]) {
  const switchMap = switches.reduce((prev, current) => {
    prev[current.key] = current;
    return prev;
  }, {} as Record<string, Switch>);

  const isPatch = switchMap['-p'].activated;
  // The LogP parser brackets each commit with `%x00` and splits the diff out
  // by NUL — graph rails would be interleaved into the patch lines and
  // break that split, so they're disabled when `--patch` is on.
  const formatArg = isPatch
    ? `--format=%x00%H\x1f%an\x1f%at\x1f%s%n%b%x00`
    : `--format=%H\x1f${switchMap['-d'].activated ? '%d' : ''}\x1f%an\x1f%at\x1f%s`;
  const args = ['log', formatArg, '--use-mailmap', ...MenuUtil.optionsToArgs(options)];
  if (switchMap['-D'].activated) {
    args.push(switchMap['-D'].name);
  }
  if (switchMap['-g'].activated && !isPatch) {
    args.push(switchMap['-g'].name);
  }
  if (isPatch) {
    args.push('--patch');
  }
  return args;
}
