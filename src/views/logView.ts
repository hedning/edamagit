import formatDistanceToNowStrict from 'date-fns/formatDistanceToNowStrict';
import { Uri } from 'vscode';
import * as Constants from '../common/constants';
import { MagitLog } from '../models/magitLog';
import { MagitLogEntry } from '../models/magitLogCommit';
import { MagitRepository } from '../models/magitRepository';
import GitTextUtils from '../utils/gitTextUtils';
import { CommitItemView } from './commits/commitSectionView';
import { DocumentView } from './general/documentView';
import { TextView } from './general/textView';
import { Token } from './general/semanticTextView';
import { SemanticTokenTypes } from '../common/constants';
import { gitRun, LogLevel } from '../utils/gitRawRunner';


function parseLog(stdout: string): MagitLogEntry[] {
  const commits: MagitLogEntry[] = [];
  // Split stdout lines
  const lines = stdout.match(/[^\r\n]+/g);
  // regex to parse line
  const lineRe = new RegExp(
    '^([/|\\-_* .o]+)?' + // Graph
    '([a-f0-9]{40})' + // Sha
    '( \\(([^()]+)\\))?' + // Refs
    '( \\[([^\\[\\]]+)\\])' + // Author
    '( \\[([^\\[\\]]+)\\])' + // Time
    '(.*)$', // Message
    'g');
  // regex to match graph only line
  const graphRe = /^[/|\\-_* .o]+$/g;

  lines?.forEach(l => {
    if (l.match(graphRe)) { //graph only
      // Add to previous commits
      commits[commits.length - 1]?.graph?.push(l);
    } else {
      const matches = l.matchAll(lineRe).next().value;
      if (matches && matches.length > 0) {
        const graph = matches[1]; // undefined if graph doesn't exist
        const log = {
          graph: graph ? [graph] : undefined,
          refs: (matches[4] ?? '').split(', ').filter((m: string) => m),
          author: matches[6],
          time: new Date(Number(matches[8]) * 1000), // convert seconds to milliseconds
          commit: {
            hash: matches[2],
            message: matches[9],
            parents: [],
            authorEmail: undefined
          }
        };
        commits.push(log);
      }
    }
  });
  return commits;
}
export default class LogView extends DocumentView {

  static UriPath: string = 'log.magit';
  needsUpdate = true
  args: string[];
  revs: string[];
  paths: string[];

  constructor(uri: Uri, repository: MagitRepository, args: string[], revs: string[], paths: string[]) {
    super(uri);
    this.args = args;
    this.revs = revs;
    const revName = this.revs.join(' ');
    this.paths = paths;
    this.addSubview(new TextView(`Commits in ${revName}`));
    this.update(repository);
  }

  public async update(state: MagitRepository) {
    const repo = state.gitRepository;
    const output = await gitRun(repo, this.args.concat(this.revs, ['--'], this.paths), {}, LogLevel.Error);
    const logEntries = parseLog(output.stdout);
    const revName = this.revs.join(' ');

    this.subViews = [
      new TextView(`Commits in ${revName}`),
      ...logEntries.map(entry => new CommitLongFormItemView(entry)),
    ];
    // For some reason the fire event can get eaten if fired synchronously 
    const trigger = () => {
      if (!this.emitter) {
        setTimeout(trigger, 0);
      } else {
        setTimeout(this.triggerUpdate.bind(this), 0);
      }
    };
    trigger();
  }

  static index = 0;
  static encodeLocation(repository: MagitRepository): Uri {
    return Uri.parse(`${Constants.MagitUriScheme}:${LogView.UriPath}?${repository.uri.fsPath}#${LogView.index++}`);
  }
}

export class CommitLongFormItemView extends CommitItemView {

  constructor(public logEntry: MagitLogEntry) {
    super(logEntry.commit);

    const timeDistance = formatDistanceToNowStrict(logEntry.time);
    const hash = `${GitTextUtils.shortHash(logEntry.commit.hash)} `;
    const graph = logEntry.graph?.[0] ?? '';

    this.content = [];

    const msg = GitTextUtils.shortCommitMessage(logEntry.commit.message);
    this.content.push(`${hash}${graph}`);

    const refTokens: Token[] = logEntry.refs.map(ref => new Token(ref, SemanticTokenTypes.RefName));
    if (refTokens.length) {

      this.content.push(' (');
      refTokens.forEach(refToken => {
        this.content.push(refToken, ' ');
      });
      this.content.pop();

      this.content.push(') ');
    }

    const availableMsgWidth = 70 - this.content.reduce((prev, v) => prev + v.length, 0);
    let maxAuthorWidth =  17;
    // fixme: add setting toggle
    const shortenToInitials = true;
    if (shortenToInitials) {
      const initials = logEntry.author.split(/\s/).map(s => s.substring(0, 1)).join('');
      logEntry.author = initials;
      maxAuthorWidth = 4;
    }

    const truncatedAuthor = truncateText(logEntry.author, maxAuthorWidth, maxAuthorWidth + 1);
    const truncatedMsg = truncateText(msg, availableMsgWidth, availableMsgWidth + 1);
    this.content.push(`${truncatedMsg}${truncatedAuthor}${timeDistance}`);

    // Add the rest of the graph for this commit
    if (logEntry.graph) {
      for (let i = 1; i < logEntry.graph.length; i++) {
        const g = logEntry.graph[i];
        const emptyHashSpace = ' '.repeat(8);
        this.content.push(`\n${emptyHashSpace}${g}`);
      }
    }
  }
}

function truncateText(txt: string, limit: number, padEnd?: number) {
  let ret = (txt.length >= limit) ? txt.substr(0, limit - 1) + '…' : txt;
  if (padEnd) {
    ret = ret.padEnd(padEnd);
  }
  return ret;
}
