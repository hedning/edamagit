// Minimal stub of the `vscode` module for use in pure-Node mocha runs.
// Only includes APIs touched by code under unit test. Add more as tests grow.

export class Uri {
  scheme: string;
  authority: string;
  path: string;
  query: string;
  fragment: string;

  constructor(scheme: string, authority: string, path: string, query: string, fragment: string) {
    this.scheme = scheme;
    this.authority = authority;
    this.path = path;
    this.query = query;
    this.fragment = fragment;
  }

  static parse(value: string): Uri {
    // Tolerant parser sufficient for file:// URIs used by tests.
    const m = /^([a-zA-Z][a-zA-Z0-9+.\-]*):(?:\/\/([^\/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(value);
    if (!m) {
      return new Uri('', '', value, '', '');
    }
    return new Uri(m[1] ?? '', m[2] ?? '', m[3] ?? '', m[4] ?? '', m[5] ?? '');
  }

  static file(p: string): Uri {
    return new Uri('file', '', p.startsWith('/') ? p : '/' + p, '', '');
  }

  static from(components: { scheme: string; authority?: string; path?: string; query?: string; fragment?: string }): Uri {
    return new Uri(
      components.scheme,
      components.authority ?? '',
      components.path ?? '',
      components.query ?? '',
      components.fragment ?? '',
    );
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    const joined = [base.path.replace(/\/+$/, ''), ...segments.map(s => s.replace(/^\/+/, ''))]
      .filter(p => p.length > 0)
      .join('/');
    return new Uri(base.scheme, base.authority, joined, base.query, base.fragment);
  }

  with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): Uri {
    return new Uri(
      change.scheme ?? this.scheme,
      change.authority ?? this.authority,
      change.path ?? this.path,
      change.query ?? this.query,
      change.fragment ?? this.fragment,
    );
  }

  toString(): string {
    let s = `${this.scheme}://${this.authority}${this.path}`;
    if (this.query) { s += `?${this.query}`; }
    if (this.fragment) { s += `#${this.fragment}`; }
    return s;
  }

  get fsPath(): string {
    return this.path;
  }
}

export class Position {
  constructor(public line: number, public character: number) {}
  isBefore(other: Position): boolean {
    return this.line < other.line || (this.line === other.line && this.character < other.character);
  }
  translate(lineDelta = 0, characterDelta = 0): Position {
    return new Position(this.line + lineDelta, this.character + characterDelta);
  }
  with(line?: number, character?: number): Position {
    return new Position(line ?? this.line, character ?? this.character);
  }
}

export class Range {
  start: Position;
  end: Position;
  constructor(startLine: number | Position, startCharOrEnd: number | Position, endLine?: number, endChar?: number) {
    if (startLine instanceof Position && startCharOrEnd instanceof Position) {
      this.start = startLine;
      this.end = startCharOrEnd;
    } else {
      this.start = new Position(startLine as number, startCharOrEnd as number);
      this.end = new Position(endLine ?? 0, endChar ?? 0);
    }
  }
  with(start?: Position, end?: Position): Range {
    return new Range(start ?? this.start, end ?? this.end);
  }
  intersection(other: Range): Range | undefined {
    return undefined;
  }
  get isEmpty(): boolean {
    return this.start.line === this.end.line && this.start.character === this.end.character;
  }
}

export class Selection extends Range {
  anchor: Position;
  active: Position;
  constructor(anchor: Position, active: Position) {
    super(anchor, active);
    this.anchor = anchor;
    this.active = active;
  }
}

export class Disposable {
  constructor(private readonly fn: () => void) {}
  dispose(): void { this.fn(); }
}

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];
  event = (listener: (e: T) => void): Disposable => {
    this.listeners.push(listener);
    return new Disposable(() => {
      this.listeners = this.listeners.filter(l => l !== listener);
    });
  };
  fire(data: T): void {
    for (const l of this.listeners) { l(data); }
  }
  dispose(): void { this.listeners = []; }
}

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}

export enum FileChangeType {
  Changed = 1,
  Created = 2,
  Deleted = 3,
}

export class FileSystemError extends Error {
  constructor(message?: string) { super(message); this.name = 'FileSystemError'; }
  static FileNotFound(messageOrUri?: unknown): FileSystemError { return new FileSystemError(String(messageOrUri ?? 'FileNotFound')); }
  static FileExists(messageOrUri?: unknown): FileSystemError { return new FileSystemError(String(messageOrUri ?? 'FileExists')); }
  static FileNotADirectory(messageOrUri?: unknown): FileSystemError { return new FileSystemError(String(messageOrUri ?? 'FileNotADirectory')); }
  static FileIsADirectory(messageOrUri?: unknown): FileSystemError { return new FileSystemError(String(messageOrUri ?? 'FileIsADirectory')); }
  static NoPermissions(messageOrUri?: unknown): FileSystemError { return new FileSystemError(String(messageOrUri ?? 'NoPermissions')); }
  static Unavailable(messageOrUri?: unknown): FileSystemError { return new FileSystemError(String(messageOrUri ?? 'Unavailable')); }
}
