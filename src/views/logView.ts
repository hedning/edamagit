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

// regex to parse log lines
const lineRe = new RegExp(
  '^([/|\\-_* .o]+)?' + // Graph
  '([a-f0-9]{40})' + // Sha
  '( \\(([^()]+)\\))?' + // Refs
  '( \\[([^\\[\\]]+)\\])' + // Author
  '( \\[([^\\[\\]]+)\\])' + // Time
  '(.*)$', // Message
  'g');
const graphRe = /^[/|\\-_* .o]+$/g;


` box  drawing
  	0 	1 	2 	3 	4 	5 	6 	7 	8 	9 	A 	B 	C 	D 	E 	F
U+250x 	─ 	━ 	│ 	┃ 	┄ 	┅ 	┆ 	┇ 	┈ 	┉ 	┊ 	┋ 	┌ 	┍ 	┎ 	┏
U+251x 	┐ 	┑ 	┒ 	┓ 	└ 	┕ 	┖ 	┗ 	┘ 	┙ 	┚ 	┛ 	├ 	┝ 	┞ 	┟
U+252x 	┠ 	┡ 	┢ 	┣ 	┤ 	┥ 	┦ 	┧ 	┨ 	┩ 	┪ 	┫ 	┬ 	┭ 	┮ 	┯
U+253x 	┰ 	┱ 	┲ 	┳ 	┴ 	┵ 	┶ 	┷ 	┸ 	┹ 	┺ 	┻ 	┼ 	┽ 	┾ 	┿
U+254x 	╀ 	╁ 	╂ 	╃ 	╄ 	╅ 	╆ 	╇ 	╈ 	╉ 	╊ 	╋ 	╌ 	╍ 	╎ 	╏
U+255x 	═ 	║ 	╒ 	╓ 	╔ 	╕ 	╖ 	╗ 	╘ 	╙ 	╚ 	╛ 	╜ 	╝ 	╞ 	╟
U+256x 	╠ 	╡ 	╢ 	╣ 	╤ 	╥ 	╦ 	╧ 	╨ 	╩ 	╪ 	╫ 	╬ 	╭ 	╮ 	╯
U+257x 	╰ 	╱ 	╲ 	╳ 	╴ 	╵ 	╶ 	╷ 	╸ 	╹ 	╺ 	╻ 	╼ 	╽ 	╾ 	╿

│
`;

`
 │╱│
 ┿ │
 │╲ ╲

 ├╯│
 ┿ │
 ├╮╰╮

Crossings might be hard, do it correctly we'd have to know if we're going under or connecting.
Think we use the above rules to figure if we're going from or to an edge

We need the next line though to figure out the _spaces_ -> ╭ rule
 │ ┿
 │ │╲
 │ │╱
 │╱│
 ┿ │

 # I fairly certain something like this should be possible
 │ ┿
 │ ├╮
 │╭│╯
 ├╯│
 ┿ │


* | | | | |
|\ \ \ \ \ \
| |_|_|/ / /
|/| | | | |
| * | | | |
| | |/ / /

* │ │ │ │ │
│╮ ╮ ╮ ╮ ╮ ╮
│ │_│_│╯ ╯ ╯
│╯│ │ │ │ │
│ * │ │ │ │
│ │ │╯ ╯ ╯

`;

const ascii = {
  l: '\\',
  r: '/',
  up: '|',
  star: '*',
} as const;

function prettifyGraph(graph: string, last: string): string {
  // Consider using a string replace here
  // Could also write a help command line tool, we're already relying
  // on git as a «lib» here.


  let out: string = '';
  for (let i = 0; i < graph.length; i++) {
    const c = graph[i]!;
    switch (c) {
      case '*': {
        if (
          last[i] === '|' ||
          last[i] === '*' ||
          last[i - 1] === '\\' ||
          last[i + 1] === '/'
        ) {
          out += '┿';
          break;
        }
        out += '┯';
        break;
      }
      case '|': {
        const l = graph[i - 1];
        const r = graph[i + 1];
        const lastLeft = last[i - 1];
        const lastRight = last[i + 1];

        // Need to figure out if any we're connected with the left or right edge.
        // │ ┿
        // │ │╲
        // │ │╱
        // │╱│

        // simple cases, we have a direct parent above
        if (last[i] === ascii.star) {
          if (l === ascii.r && r === ascii.l) { out += '┼'; break; }
          if (r === ascii.l) { out += '├'; break; }
          if (l === ascii.r) { out += '┤'; break; }
          out += '│'; break;
        }

        //
        if (last[i] !== ascii.star) {
          out += '│'; break;
        }
        if (l === ascii.r) { out += '├'; break; }

        out += '│'; break;
      }
      case ' ': { // need this for
        out += ' '; break;
      }
      case '/': { out += '╯'; break; }
      case '\\': { out += '╮'; break; }
      case '_': { out += '─'; break; }
      default: { out += c; }
    }
  }
  return out;
}



function parseLog(stdout: string): MagitLogEntry[] {
  const lines = stdout.match(/[^\r\n]+/g);
  if (!lines) return [];

  const commits: MagitLogEntry[] = [];
  let lastGraph = '';
  for (const line of lines) {
    if (line.match(graphRe)) { // graph only, ie. the whole line is just graph stuff
      commits[commits.length - 1]?.graph?.push(prettifyGraph(line, lastGraph));
      lastGraph = line;
      continue;
    }

    const matches = line.matchAll(lineRe).next().value;
    if (!matches || matches.length === 0) continue;

    const graph = matches[1]; // undefined if graph doesn't exist
    commits.push({
      graph: graph ? [prettifyGraph(graph, lastGraph)] : undefined,
      refs: (matches[4] ?? '').split(', ').filter((m: string) => m),
      author: matches[6],
      time: new Date(Number(matches[8]) * 1000), // convert seconds to milliseconds
      commit: {
        hash: matches[2],
        message: matches[9],
        parents: [],
        authorEmail: undefined
      }
    });
    if (graph) lastGraph = graph;
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
