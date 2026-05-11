Create a thorough testing plan, there's already some tests in the repo, but consider this greenfield.

The extension sits between vscode as the final render interaction layer, and git.

Trying to mock these layers fully is difficult to get consistently right.

One of the main things I want is making the tests readable, and it's OK creating some dedicated
test only parsers/renderers to get us there

Edamagit is text based interface for git.

Eg. here's how the MagitStatusView might look like for instance:
```status
Head:     switch-to-fs-provider ...
Push:     origin/switch-to-fs-provider (claude) constants: split MagitLanguageId from MagitUriScheme

Unstaged changes (1)
modified   src/commands/copyBufferRevisionCommands.ts
@@ -14,7 +14,7 @@ export async function copyBufferRevisionCommands(repository: MagitRepository, cu
        sectionValue = currentView.commit?.hash;
    }

-    if (sectionValue) {
+    if (sectionValue) { // some change
        await env.clipboard.writeText(sectionValue);
        window.setStatusBarMessage(sectionValue, Constants.StatusMessageDisplayTimeout);
    }

Recent commits
319198b switch-to-fs-provider ...
d59ec88 start on a better test plan
```

# Layers and the test pyramid

Three layers feed into rendered text and react to interactions:

1. **git** — invoked through `gitRunInUri` / `gitRun`, output parsed by `repoStatusParsers`,
   `diffParser`, `worktreeParsers`, `gitTextUtils`.
2. **edamagit core** — `MagitRepository` model, `View` tree, `magitFileSystemProvider`,
   `magitViewBuilders`, command handlers in `src/commands/*`.
3. **vscode** — `Uri`, `TextEditor`, `window.showTextDocument`, `commands.executeCommand`,
   `FileSystemProvider`, document semantic-tokens API.

We split tests by which layers are real:

| Tier | Real | Stubbed | What it covers |
|---|---|---|---|
| **parser** | nothing external | — | Pure functions over git stdout. Already in place (`repoStatus.test.ts`, `diffParser.test.ts`, etc.). Cheapest, most numerous. |
| **view** | edamagit view tree | vscode-mock for `Uri`/`Range`/`Position` | `provideContent` → text. Already in place via `views.test.ts`. Extend to interactions (`click`, fold, semantic tokens, symbols). |
| **command** | edamagit + parsers + view tree, **real git** in a temp repo | vscode-mock + a thin host recorder for `window`/`commands` | `magit.status`, `magit.visit-at-point`, `magit.stage` etc. — the layer most likely to silently regress today. |
| **smoke** | everything, real Extension Development Host | — | A handful of tests that prove the extension activates and a happy-path command works. The existing `src/test/suite/extension.test.ts`. |

The bulk of new test mass goes into the **view** and **command** tiers. Smoke stays small —
it's expensive and flaky, and most regressions can be caught one tier down.

# Git backend (command tier)

For git we'd like to either write tests against our own repository, that's kinda neat and simple. But we'd also like to create tests of certain situations (merges/deletes etc.) so we can make
sure we don't mess up.

Ie. having little dsl like framework, where we can specify a commit and the worktree
it should describe, optionally being able to specify patches instead of full content:

We'd use a leading space to markup file content (ala. diffs):
```
commit: foo
> filename.py
 import os
 
 if __name__ == "main": ...
```

The framework should then build the repo in eg. /tmp and then we can run tests on top it.

## DSL grammar

A test fixture is a sequence of directives. Each directive starts in column 0; file content
is indented with one leading space (so we can mix in unified-diff-style `+`/`-` lines later
without ambiguity).

```
# comment, ignored
config: <key> <value>            # git config <key> <value> at repo init
branch: <name> [from <ref>]      # create + switch
checkout: <name>                 # switch only
commit: <subject>                # commits whatever's staged after the file directives below
                                   it (auto-staged) with the given subject
  author: <name> <email>
  date: <iso8601>                # both author and committer
> path/to/file                   # full file body, leading-space stripped
+ path/to/file                   # apply unified diff (file must already exist)
x path/to/file                   # delete
> path/to/file (mode 100755)     # full file body with explicit mode
tag: <name> [<ref>]              # lightweight tag (or annotated with body block)
merge: <ref> [--no-ff] [-m msg]  # commits a merge; conflicts left in worktree if any
worktree-add: <path> <ref>
remote: <name> <url>             # `git remote add` (url can point to another fixture repo)
push: <remote> <ref>
stash: <message>                 # stash save with current worktree state
state:                           # leave the worktree dirty after the fixture is built —
                                 # subsequent file directives are NOT committed
```

Authoring example covering a non-trivial state:

```
config: user.name Alice
config: user.email alice@example.com

> README.md
 # Demo

commit: initial

branch: feature
> src/foo.ts
 export function foo() { return 1 }

commit: add foo

checkout: main
> README.md
 # Demo
 (updated on main)

commit: tweak readme

merge: feature -m "merge feature"

state:
> src/foo.ts
 export function foo() { return 2 }   # unstaged edit visible in status
> tmp.log
 untracked
```

## Harness API

A single TypeScript helper exposes the DSL and returns a working repo:

```ts
interface RepoFixture {
  uri: vscode.Uri;          // file:// URI of the worktree
  rootPath: string;         // absolute path
  git(args: string[]): Promise<{ stdout: string; stderr: string }>;
  cleanup(): Promise<void>;
}

export async function buildRepo(dsl: string, opts?: {
  defaultBranch?: string;   // default: 'main'
  baseDate?: string;        // deterministic commit dates, default: 2025-01-01T00:00:00Z
  authorName?: string;      // default: 'Alice'
  authorEmail?: string;     // default: 'alice@example.com'
  keep?: boolean;           // skip cleanup() for inspection on failure
}): Promise<RepoFixture>;
```

Implementation notes:

- Builds in `$TMPDIR/edamagit-tests/<random>` (not `/tmp` — sandbox-friendly).
- Determinism: every commit gets monotonically advancing `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE`
  derived from `baseDate + N seconds`. Commit hashes still vary by message/tree but are
  stable across runs given identical DSL — important for snapshot tests that include short
  hashes.
- `cleanup()` runs in mocha's `afterEach`. With `keep: true` the path is logged so a failing
  test leaves a repo on disk for `git status` inspection.
- When a test only needs a parser-level fixture (e.g. specific `git status --porcelain=v2`
  output), prefer `parsePorcelainStatus(string)` directly with an inline literal — don't
  build a real repo for that.

## Tests against this repo

For the rare check that wants real-world shape (long log, real merges, lots of refs), point
the harness at the edamagit checkout:

```ts
const repo = await openRepo(__dirname + '/../../../');   // read-only
```

`openRepo` returns the same `RepoFixture` shape but disables mutating helpers. Use sparingly
— the working tree changes day-to-day, so any assertion needs to be tolerant (regex match,
"contains", count > 0) rather than equality.

# Frontend (view tier)

The plain rendering part should be pretty easy, since it's just text. But we also
want to test interactions like `magitVisitAtPoint`, staging/unstaging hunks from a view etc.

A possible way is rust-analyzer style tests where we simply write out the interface inline,
and include a simple markup language to place the cursor, eg.:
```
 Head:     switch-to-fs-provider (claude) gitHistory: encode repo path in URI, drop spawn-from-file's-dir
 Push:     origin/switch-to-fs-provider (claude) constants: split MagitLanguageId from MagitUriScheme
 
 Unstaged changes (1)
 modified   src/commands/copyBufferRevisionCommands.ts
 @@ -9,7 +9,7 @@ export async function copyBufferRevisionCommands(repository: MagitRepository, cu
  
      let sectionValue: string | undefined;
      if (currentView instanceof MagitStatusView) {
 -        sectionValue = currentView.HEAD?.commit;
>                            ^cursor
 +        sectionValue = currentView.HEAD?.commit; aeu
      } else if (currentView instanceof CommitDetailView) {
          sectionValue = currentView.commit?.hash;
      }
```

A potential problem with the above is the interface not being fully parsable, we go from some git state -> internal view state -> text, we're not able to go the other way around.

Though, if we include an inline snapshotting library, having it update the interface might
make it approachable.

## Markup language

Lines beginning with `>` in column 0 are **annotations**, not part of the rendered view.
Annotations attach to the previous content line (the one above them). Two forms:

```
# point at a column with a single caret
>          ^cursor
>          ^selection-start
>             ^selection-end

# point at a span with caret + tilde-fill, optional label after the caret
>          ^~~~~~ branch-token
```

Multiple annotations can stack on a single line by chaining `>` lines. The parser walks
top-to-bottom; the most recent content line is the anchor.

Cursor placement is what `View.click(position)` consumes — every interaction test starts by
asserting which sub-view the cursor resolved to. `selection-start` / `selection-end`
together produce a `Selection` for hunk-region tests.

## Test shape

Three test idioms cover the view tier:

**1. Render snapshot.** Pure `view → text`. Already done in `views.test.ts`. Continue to
prefer real `MagitChange`/`MagitBranch` builders (`fixtures.ts`) over hand-rolled JSON.

**2. Interaction.** The DSL above + a known click position drive a command harness. Example:

```ts
test('visit-at-point on a hunk opens the worktree file', async () => {
  const repo = await buildRepo(dsl);
  const { view, host } = await openMagitStatus(repo);

  await host.placeCursor(view, `
    Head: ...
    Unstaged changes (1)
    modified   src/foo.ts
    @@ -1,1 +1,1 @@
    -old
    >^cursor
    +new
  `);

  await magitVisitAtPoint(repo, view);
  assert.deepStrictEqual(host.opens, [{ uri: '/repo/src/foo.ts', selection: { line: 0 } }]);
});
```

`host` is the new piece — see the harness section.

**3. Inline snapshot, round-trippable.** For full-status renders we adopt
`mocha-snapshots` (or a tiny in-tree equivalent — single file, ~80 LOC) so an env var like
`UPDATE_SNAPSHOTS=1 npm run test:unit` rewrites the expected text inline. The snapshot lives
in the test source as a tagged template literal. When the user said "having it update the
interface might make it approachable" — this is what closes that loop.

The annotation lines (`>          ^cursor`) are never written by the snapshot updater; they
only appear in tests that exercise interaction, and the test author maintains them by hand.
The updater preserves any line starting with `>` verbatim.

## Command harness

Many commands touch `window`, `commands`, `env.clipboard`, `workspace.fs`. We give them a
recorder rather than full mocks:

```ts
interface VsCodeHost {
  // recorded side-effects
  opens: Array<{ uri: string; selection?: { line: number; character: number } }>;
  status: string[];
  clipboard: string[];
  executed: Array<{ command: string; args: unknown[] }>;
  errors: string[];

  // controllable inputs
  activeEditor: { document: { uri: vscode.Uri }; selection: vscode.Selection } | undefined;
  inputResponses: string[];      // queue for showInputBox
  pickResponses: unknown[];      // queue for showQuickPick

  placeCursor(view: View, annotatedText: string): Promise<void>;
}
```

`vscode-mock.ts` already covers `Uri`, `Position`, `Range`, `Selection`, `Disposable`,
`EventEmitter`, `FileType`. Extend it with `window`, `commands`, `workspace.fs`, and
`env.clipboard` backed by the recorder above. Pattern follows what's there: minimum needed,
add when a test forces it.

The recorder wires into the existing `module._resolveFilename` shim (`setup.ts`) so no test
imports `vscode` differently. Tests get a fresh host per `beforeEach`.

# Other providers

We also have symbol and highlighting providers. Here again we should consider
adding a markup language on top of the text interface to test the highlighter:
```log.magit
 0aa5e3a THB  56 minut… ┯ switch-to-fs-provider (claude) gitHistory: encode repo path in URI, drop spawn-from-file's-dir
                          ^  branch-type      ^
 c253084 THB  1 hour    ┿ (claude) package: restore magit-history label formatter
 d5d2f9f THB  1 hour    ┿ (claude) views: Blame becomes rebuildable
```

## Token markup

Same `>` annotation rule as the cursor markup, but with a token-type label:

```
 0aa5e3a THB  56 minut… ┯ switch-to-fs-provider (claude) gitHistory: ...
> ^~~~~~~ hash             ^~~~~~~~~~~~~~~~~~~~~ branch
                                                  ^~~~~~~ remote-author
```

Labels match the enum values in `common/constants.SemanticTokenTypes`. The harness:

1. Renders the view to text.
2. Strips annotations and runs `SemanticTokensProvider.provideDocumentSemanticTokens`
   against a fake document built from the rendered text + the live view tree.
3. Reconstructs annotation lines from the produced tokens.
4. Diffs reconstruction against the test's expected annotations.

Because step 3 produces exactly the same shape as the input, this is also round-trippable
under `UPDATE_SNAPSHOTS=1`.

Same machinery serves the `symbolProvider` (assertion: each annotation line names a
`DocumentSymbol` whose range covers the underlined span), and `HighlightProvider` (the
single-line click-and-highlight case can be expressed as cursor + caret on the highlighted
range).

# Layout and running

Proposed folder layout (extends what exists):

```
src/test/
  unit/                      # parser + view + command tiers, no Extension Host
    setup.ts                 # vscode-mock shim (existing)
    vscode-mock.ts
    extension-mock.ts
    harness/
      buildRepo.ts           # git DSL → temp repo
      vsCodeHost.ts          # recorder + cursor placement
      annotations.ts         # `>          ^cursor` parser/renderer
      snapshot.ts            # inline-snapshot writer (UPDATE_SNAPSHOTS=1)
    parsers/
      diffParser.test.ts
      repoStatus.test.ts
      worktreeParsers.test.ts
      gitTextUtils.test.ts
    views/
      fixtures.ts
      magitStatusView.test.ts
      logView.test.ts
      commitDetailView.test.ts
      ...
    commands/
      visitAtPointCommands.test.ts
      stagingCommands.test.ts
      ...
    providers/
      semanticTokens.test.ts
      symbol.test.ts
      highlight.test.ts
  suite/                     # smoke-only Extension Host tests
    extension.test.ts        # existing — extension activates, status opens
    visit.smoke.test.ts      # one happy-path interactive flow
```

Scripts already in `package.json`:

- `npm run test:unit` — runs the entire unit pyramid (parsers, views, commands, providers).
  This is the "always run before commit" target; should stay under ~10s.
- `npm test` — runs the smoke suite via `vscode-test` (downloads VSCode, slow).
- `npm run test:gen-fixtures` — re-records the deterministic git-log fixture used by
  `repoStatus.test.ts`.

New: `UPDATE_SNAPSHOTS=1 npm run test:unit` rewrites inline snapshots for any failing
view/provider test.

# What not to test (yet)

- Forge integration (`src/forge/*`): network-bound, deferred per `plan.md`'s "PR/Issue stay
  as outliers" decision. Mock at the boundary if a specific bug warrants it.
- Concrete VSCode rendering: we don't try to assert pixel positions or theme colors. The
  semantic-tokens output is the contract.
- Specific git binary versions: the DSL uses only stable plumbing/porcelain. CI pins one
  git version (mise.toml); local runs use whatever the dev has.

# Migration from current state

The existing tests already line up with this plan — nothing thrown out:

- `parsers/*.test.ts` — keep as-is.
- `views/views.test.ts` — keep, split per-view as it grows. The `fixtures.ts` builders are
  the contract for view-tier inputs.
- `suite/extension.test.ts` — leave the commented-out body removed once the equivalent
  view-tier test lands; keep a single activation smoke test.

Order to build out:

1. Annotation parser + inline-snapshot writer (no new test mass yet, just plumbing).
2. Command harness (`vsCodeHost`) and `buildRepo` DSL.
3. Port one interaction test end-to-end (suggest: `magitVisitAtPoint` on a hunk) to flush
   out the harness.
4. Fan out: one test file per command and per provider, using the harness.
5. Trim the smoke suite to a single activation test once command-tier coverage is solid.
