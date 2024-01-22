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

/** Box drawing chars
    0 	1 	2 	3 	4 	5 	6 	7 	8 	9 	A 	B 	C 	D 	E 	F
U+250x 	─ 	━ 	│ 	┃ 	┄ 	┅ 	┆ 	┇ 	┈ 	┉ 	┊ 	┋ 	┌ 	┍ 	┎ 	┏
U+251x 	┐ 	┑ 	┒ 	┓ 	└ 	┕ 	┖ 	┗ 	┘ 	┙ 	┚ 	┛ 	├ 	┝ 	┞ 	┟
U+252x 	┠ 	┡ 	┢ 	┣ 	┤ 	┥ 	┦ 	┧ 	┨ 	┩ 	┪ 	┫ 	┬ 	┭ 	┮ 	┯
U+253x 	┰ 	┱ 	┲ 	┳ 	┴ 	┵ 	┶ 	┷ 	┸ 	┹ 	┺ 	┻ 	┼ 	┽ 	┾ 	┿
U+254x 	╀ 	╁ 	╂ 	╃ 	╄ 	╅ 	╆ 	╇ 	╈ 	╉ 	╊ 	╋ 	╌ 	╍ 	╎ 	╏
U+255x 	═ 	║ 	╒ 	╓ 	╔ 	╕ 	╖ 	╗ 	╘ 	╙ 	╚ 	╛ 	╜ 	╝ 	╞ 	╟
U+256x 	╠ 	╡ 	╢ 	╣ 	╤ 	╥ 	╦ 	╧ 	╨ 	╩ 	╪ 	╫ 	╬ 	╭ 	╮ 	╯
U+257x 	╰ 	╱ 	╲ 	╳ 	╴ 	╵ 	╶ 	╷ 	╸ 	╹ 	╺ 	╻ 	╼ 	╽ 	╾ 	╿
*/


function prettifyGraph(prev: string, current: string, next: string): string {
  // Consider using a string replace here
  let out: string = '';
  for (let i = 0; i < current.length; i++) {
    const c = current[i];
    const l = i - 1;
    const r = i + 1;
    switch (c) {
      case '*': { out += '┿'; break; }
      case '|': { out += '│'; break; }
      case '/': { out += '╱'; break; }
      case '\\': { out += '╲'; break; }
      default: { out += c; }
    }
  }
  return out;
}

// regex to parse log lines
const lineRe = new RegExp(
  '^([/|\\\\-_* .o]+)?' + // Graph
  '([a-f0-9]{40})' + // Sha
  '( \\(([^()]+)\\))?' + // Refs
  '( \\[([^\\[\\]]+)\\])' + // Author
  '( \\[([^\\[\\]]+)\\])' + // Time
  '(.*)$', // Message
  'g');
const graphRe = /^[/|\\\\-_* .o]+$/g;
function reParse(line: string): { graph: string } | { graph: string, refs: string, author: string, time: string, hash: string, message: string } {
  if (!line) return { graph: '' };

  if (line.match(graphRe)) return { graph: line };

  const matches: string[] = line.matchAll(lineRe).next().value;
  if (!matches) return { graph: '' };
  return {
    graph: matches[1]!,
    refs: matches[4]!,
    author: matches[6]!,
    time: matches[8]!, // convert seconds to milliseconds
    hash: matches[2]!,
    message: matches[9]!,
  };
}

function parseLog(stdout: string): MagitLogEntry[] {
  const lines = stdout.match(/[^\r\n]+/g);
  if (!lines) return [];

  if (lines.length < 2) return [];

  let prev = { graph: '' };
  let i = 0;
  let current = reParse(lines[i]);
  i += 1;
  let next = reParse(lines[i]) ?? { graph: '' };
  const commits: MagitLogEntry[] = [];
  while (i <= lines.length) {
    const graph = prettifyGraph(prev.graph, current.graph, next.graph);

    if ('refs' in current) {
      commits.push({
        graph: graph ? [graph] : undefined,
        refs: (current.refs ?? '').split(', ').filter((m: string) => m),
        author: current.author,
        time: new Date(Number(current.time) * 1000), // convert seconds to milliseconds
        commit: {
          hash: current.hash,
          message: current.message,
          parents: [],
          authorEmail: undefined
        }
      });
    } else {
      commits[commits.length - 1]?.graph?.push(graph);
    }

    i += 1;
    prev = current;
    current = next;
    next = reParse(lines[i]);
  }

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
    this.addSubview(new TextView(`Loading commits in ${revName}`));
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

  static encodeLocation(repository: MagitRepository, revs: string[]): Uri {
    return Uri.parse(`${Constants.MagitUriScheme}:${LogView.UriPath}?${repository.uri.fsPath}#${revs.join(':')}`);
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
    let maxAuthorWidth = 17;
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
