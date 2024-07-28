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
import { Ref } from '../typings/git';
import ViewUtils from '../utils/viewUtils';
import assert = require('assert');

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

const ascii = {
  /**
   * defaults to ╰
   */
  l: '\\',

  /**
   * defaults to ╯
   */
  r: '/',
  up: '|',
  star: '*',
  pipe: '|',
  _: '_',
} as const;

function prettifyGraph(prev: string, current: string, next: string): string {
  // Consider using a string replace here
  let out: string = '';
  for (let i = 0; i < current.length; i++) {
    const c = current[i];
    const l = i - 1;
    const r = i + 1;
    switch (c) {
      case '*': {
        if (
          (prev[i] === ascii.pipe || prev[i] === ascii.star) &&
          (next[i] === ascii.pipe || next[i] === ascii.star)
        ) { out += '┿'; break; }
        if (
          prev[r] === ascii.r &&
          (next[i] === ascii.pipe || next[i] === ascii.star)
        ) { out += '┿'; break; }
        if (
          prev[r] === ascii.r &&
          next[i] !== ascii.pipe &&
          next[i] !== ascii.star
        ) { out += '┷'; break; }
        if (
          prev[i] === ascii.pipe || prev[i] === ascii.star
        ) { out += '┷'; break; }
        if (
          next[i] === ascii.pipe || next[i] === ascii.star
        ) { out += '┯'; break; }

        out += '━'; break;
      }
      case '|': {
        if ( // check if the / goes through us or not
          current[r] === ascii.r &&
          current[l] !== ascii._ &&
          next[l] !== ascii.r
        ) { out += '├'; break; }
        if (
          next[r] === ascii.l &&
          next[i] === ' '
        ) { out += '╰'; break; }
        if (
          next[l] === ascii.r &&
          next[i] === ' '
        ) { out += '╯'; break; }

        out += '│'; break;
      }
      case ascii.r: {
        if (
          prev[r] === ascii.r &&
          next[i] === ascii.pipe &&
          current[r] === ' '
        ) { out += '│'; break; }

        out += '╯'; break;
      }
      case ascii.l: {
        if (
          prev[l] === ascii.star &&
          prev[i] === ' ' &&
          next[r] === ascii.star
        ) { out += '│'; break; }

        if ( // in-out
          next[i] === ascii.r
        ) { out += '│'; break; }

        out += '╰'; break;
      }
      case ' ': {
        if (
          prev[i] === ascii.l &&
          current[r] === ascii.star &&
          next[i] === ascii.r
        ) { out += '├'; break; }
        if (
          next[i] === ascii.l &&
          current[l] === ascii.star
        ) { out += '╮'; break; }
        if (
          prev[i] === ascii.l &&
          current[r] === ascii.star
        ) { out += '╰'; break; }
        if (
          (current[i + 2] === ascii.r || current[i + 2] === ascii._) &&
          next[i] === ascii.r
        ) { out += '╭'; break; }

        if (
          current[l] === ascii.pipe &&
          next[i] === ascii.l &&
          next[l] === ' '
        ) { out += '╮'; break; }
        if (
          current[l] === ascii.l &&
          next[i] === ascii.pipe
          // next[l] === ' '
        ) { out += '╮'; break; }
        if (
          current[l] === ascii.l &&
          next[i] === ascii.l &&
          next[l] === ' '
        ) { out += '╮'; break; }

        if (
          current[r] === ascii.pipe &&
          next[i] === ascii.r &&
          next[r] === ' '
        ) { out += '╭'; break; }
        if (
          current[r] === ascii.r &&
          next[i] === ascii.r &&
          next[r] === ' '
        ) { out += '╭'; break; }
        if (
          current[r] === ascii.r &&
          next[i] === ascii.pipe &&
          next[r] === ' '
        ) { out += '╭'; break; }

        if (
          current[r] === ascii.star &&
          next[i] === ascii.r &&
          next[l] === ascii.pipe
        ) { out += '╭'; break; }
        if (
          current[r] === ascii.r &&
          next[i] === ascii.star
        ) { out += '╭'; break; }

        out += ' '; break;
      }
      case ascii._: { out += '─'; break; }
      default: { out += c; }
    }
  }
  return out;
}

enum ParseState {
  Graph,
  Commit,
  CommitGraph,
  Hash,
  MaybeRefs,
  Refs,
  Author,
  Time,
  Message,
}

const graphChars = [ascii.l, ascii.pipe, ascii.star, ascii.r, ascii._, ' '];

function parseLine(line: string | undefined): { graph: string } | { graph: string, refs: string, author: string, time: string, hash: string, message: string } {
  if (line === undefined) return { graph: '' };

  let state = ParseState.Graph; // just assume we're always using the graph option
  let graph = '';
  let refs = '';
  let author = '';
  let time = '';
  let hash = '';
  let message = '';

  let hasCommit = false;
  let i = 0;
  while (i < line.length) {
    const char = line[i];

    switch (state) {
      case ParseState.Graph: {
        if (char === '*') hasCommit = true;
        if (graphChars.includes(char)) {
          graph += char;
        } else {
          state = ParseState.Hash;
          continue;
        }
        break;
      }
      case ParseState.Hash: {
        state = ParseState.MaybeRefs;
        let stop = line.indexOf('\x1f', i);
        hash = line.slice(i, stop);
        i = stop;
        break;
      }
      case ParseState.MaybeRefs: {
        if (char !== '\x1f') state = ParseState.Refs;
        else state = ParseState.Author;
        break;
      }
      case ParseState.Refs: {
        if (char === '\x1f') state = ParseState.Author;
        refs += char;
        break;
      }
      case ParseState.Author: {
        if (char === '\x1f') state = ParseState.Time;
        else author += char;
        break;
      }
      case ParseState.Time: {
        if (char === '\x1f') state = ParseState.Message;
        else if (char !== ' ') time += char;
        break;
      }
      case ParseState.Message: {
        message = line.slice(i);
        i = line.length;
        break;
      }
    }

    i += 1;
  }

  if (hasCommit) {
    return {
      graph,
      refs,
      author,
      time,
      hash,
      message,
    };
  } else {
    return { graph };
  }
}

function parseLog(stdout: string): MagitLogEntry[] {
  const lines = stdout.match(/[^\r\n]+/g);
  if (!lines) return [];

  if (lines.length < 2) return [];

  let prev = { graph: '' };
  let i = 0;
  let current = parseLine(lines[i]);
  i += 1;
  let next = parseLine(lines[i]) ?? { graph: '' };
  const commits: MagitLogEntry[] = [];
  while (i <= lines.length) {
    const graph = prettifyGraph(prev.graph, current.graph, next.graph);

    if ('refs' in current) {
      const time = new Date(Number(current.time) * 1000);
      assert(!isNaN(Number(time))); // Make sure we're getting a valid date
      commits.push({
        graph: graph ? [graph] : undefined,
        refs: (current.refs ?? '').split(', ').filter((m: string) => m),
        author: current.author,
        time: time, // convert seconds to milliseconds
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
    next = parseLine(lines[i]);
  }

  return commits;
}
export default class LogView extends DocumentView {

  static UriPath: string = 'log.magit';
  needsUpdate = true
  isFoldable = true;
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
    const refs = state.remotes.reduce((prev, remote) => remote.branches.concat(prev), state.branches.concat(state.tags));


    let defaultBranches: { [remoteName: string]: string } = {};
    for await (const remote of state.remotes) {
      try {
        let defaultBranch = await gitRun(state.gitRepository, ['symbolic-ref', `refs/remotes/${remote.name}/HEAD`], undefined, LogLevel.Error);
        defaultBranches[remote.name] = defaultBranch.stdout.replace(`refs/remotes/${remote.name}/`, '').trimEnd();
      } catch { } // gitRun will throw an error if remote/HEAD doesn't exist - we do not need to do anything in this case
    }

    const logEntries = parseLog(output.stdout);
    const revName = this.revs.join(' ');

    this.subViews = [
      new TextView(`Commits in ${revName}`),
      // ...logEntries.map(entry => new CommitLongFormItemView(entry, refs)),
      ...logEntries.map(entry => new CommitLongFormItemView(entry, refs, state.HEAD?.name, defaultBranches)),
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

  constructor(public logEntry: MagitLogEntry, refs?: Ref[], headName?: string, defaultBranches?: { [remoteName: string]: string }) {
    super(logEntry.commit, undefined, refs);

    const timeDistance = formatDistanceToNowStrict(logEntry.time);
    const hash = `${GitTextUtils.shortHash(logEntry.commit.hash)} `;
    const graph = logEntry.graph?.[0] ?? '';

    this.content = [];

    const msg = GitTextUtils.shortCommitMessage(logEntry.commit.message);

    const availableMsgWidth = 120 - this.content.reduce((prev, v) => prev + v.length, 0);
    let maxAuthorWidth = 17;
    // fixme: add setting toggle
    const shortenToInitials = true;
    if (shortenToInitials) {
      const initials = logEntry.author.split(/\s/).map(s => s.substring(0, 1)).join('');
      logEntry.author = initials;
      maxAuthorWidth = 4;
    }
    const truncatedAuthor = truncateText(logEntry.author, maxAuthorWidth, maxAuthorWidth + 1);
    const truncatedTime = truncateText(timeDistance, 9, 9 + 1);
    const preamble = `${hash}${truncatedAuthor}${truncatedTime}`;
    this.content.push(`${preamble}${graph}`);
    if (logEntry.refs.length) {
      this.content.push(...ViewUtils.generateRefTokensLine(logEntry.commit.hash, refs, headName, defaultBranches));
    }

    const truncatedMsg = msg;
    // const truncatedMsg = truncateText(msg, availableMsgWidth, availableMsgWidth + 1);
    this.content.push(truncatedMsg);

    // Add the rest of the graph for this commit
    if (logEntry.graph) {
      for (let i = 1; i < logEntry.graph.length; i++) {
        const g = logEntry.graph[i];
        const emptyHashSpace = ' '.repeat(preamble.length);
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
