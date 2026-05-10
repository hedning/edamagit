# DocumentView: URI-only construction

The factory pattern landed (`xxxKind` objects, `RebuildableViewKind`,
`buildOrUpdate`). What's still messy: each view's constructor takes a
different shape of args (commit/changes/parents/refs for CommitDetail,
revs/args/paths for Log, section for SectionDiff, ...), and live callers
construct directly with pre-fetched data while `Kind.build` derives the
same data from the URI. Two paths, same view.

This plan collapses them: every view's constructor becomes
`constructor(uri: MagitUri)` — nothing else. Anything else comes from the
URI, derived inside the view (typically in `update(state)`).

## Decisions made up front

- **PR/Issue stay as outliers.** Refetching from forge would be a network
  call per reload that fails offline. They keep their non-rebuildable
  shape with extra constructor args. Revisit when forge gets a refetch
  story.
- **CommitDetail accepts the extra `getRef` call.** Live caller has the
  commit in hand from the click, but going through `Kind.build` means
  `build` re-runs `getRef`. One extra git call; the cache will warm. The
  simplification is worth it.
- **Class visibility: postpone.** Keep classes exported for now; tighten
  in a follow-up if it pays off.

## Per-view impact

| View | Today's extra ctor args | After |
|---|---|---|
| `MagitStatus`, `ShowRefs`, `SubmoduleList`, `Process` | `repo` | `update(repo)` already does the work — drop the ctor arg |
| `Help` | `userKeyBindings` | `Kind.build` loads them; ctor takes uri only |
| `SectionDiff` | `section` | Parse from URI fragment in ctor |
| `Log` | `args, revs, paths` | All in URI query; parse in ctor; `update(repo)` runs git log |
| `CommitDetail` | `commit, changes, parents, refs, shortstat` | All derived from URI fragment + repo in `update` |
| `Diff` | `MagitChange[]` from a specific `git diff` | **Encode diff args in URI → becomes rebuildable** |
| `StashDetail` | `unstaged, staged, untracked` | Re-run `git stash show` from URI fragment in `update` |
| `Blame` | blame string | Re-run `git blame` from URI fragment in `update` |
| `PullRequest`, `Issue` | forge data | **Unchanged** — outliers, deferred |

## Goal shape

`DocumentView` base:

```ts
abstract class DocumentView extends View {
  constructor(public uri: MagitUri) { super(); }
  abstract update(state: MagitRepository): void | Promise<void>;
  // ...
}
```

Each subclass:

```ts
class MagitStatusView extends DocumentView {
  // No special ctor — inherits the URI-only one.
  update(state) { this.provideContent(state); this.triggerUpdate(); }
}

export const MagitStatus: RebuildableViewKind<[]> = {
  authority: 'status',
  buildUri: (repo) => buildMagitUri(repo.uri, 'status', { authority: MagitStatus.authority }),
  build: async (uri) => {
    const repo = await MagitUtils.ensureRepoForMagitUri(uri);
    if (!repo) return undefined;
    const view = new MagitStatusView(uri);
    await view.update(repo);
    return view;
  },
};
```

`Kind.build` becomes a small, uniform pattern: ensure repo, new the view,
await initial `update`, return.

## Plan (each step independently mergeable)

### 1. Loosen the `update` signature
`abstract update(state): void` → `void | Promise<void>`. LogView already
does `Promise<void>` and works by subtype variance; just make it explicit.
`magitStatusAndUpdate` calls `view.update(...)` without awaiting (refresh
is fire-and-forget); that stays unchanged. `Kind.build` will await.

### 2. Trivial ones first
`MagitStatus`, `ShowRefs`, `SubmoduleList`, `Process` — drop the second
ctor arg, move population to `update(repo)`. `Kind.build` does
`new + await update`. Verifies the pattern with the simplest cases.

### 3. `Help`
`HelpView`'s userKeyBindings load lives in the kind's `build` already.
Constructor still takes the bindings; either:
- Keep that (Help is a degenerate case — no repo refresh) and accept the
  small inconsistency, or
- Make `update` the bindings loader and have the constructor be uri-only.

Probably (a) for now; `Help` has no `update` semantics anyway.

### 4. `SectionDiff`
Move `section` from constructor arg to URI fragment parse in constructor.
Already half done — the fragment carries 'staged'/'unstaged'.

### 5. `Log`
Constructor parses `args/revs/paths` from URI query (same code that
`Log.build` runs today). `update(repo)` runs git log. `Log.build` does
`new + await update`.

### 6. `CommitDetail`
Constructor takes only URI; `update(repo)` does the full pipeline:
- Read commit hash from `uri.fragment`.
- `getRef(repo, hash)` → commit, changes, shortstat.
- Resolve parents via `getCommit`.
- Build refs from repo.
- `provideContent(commit, changes, parents, refs, shortstat)`.

`CommitDetail.build` becomes the same `new + await update` pattern.
Eliminates the last "live pre-fetches, rebuild refetches" dual path.

### 7. `Diff` becomes rebuildable
See the **Diff URI encoding** appendix below for the detailed design.
Encode the diff invocation as a tagged variant in the URI query;
constructor parses, `update` runs the right `git diff`, `Diff.build`
returns a fully rebuildable view. Register `Diff` in
`magitViewBuilders`.

### 8. `StashDetail` becomes rebuildable
Stash index is already in URI fragment. Constructor parses; `update`
re-runs `git stash show` and the parent-walking the live caller does
today. Register.

### 9. `Blame` becomes rebuildable
File path is already in URI fragment. Constructor parses; `update` runs
`git blame`. Register.

### 10. Drop ad-hoc construction at call sites
Every `new XxxView(uri, ...)` in commands disappears, replaced by
`ViewUtils.buildOrUpdate(repo, Kind, ...args)`. Only PR/Issue (outliers)
keep direct construction.

## Risks / things to watch

- **Async `update` not awaited on refresh.** Today `magitStatusAndUpdate`
  fire-and-forgets. With async update, content lands a tick later than
  before. `triggerUpdate()` already fires `onDidChangeFile`, so the editor
  re-renders when ready. Acceptable, but watch for races on rapid
  successive refreshes — could need a "current update token" pattern in
  `LogView`-style async views.

- **Refresh now refetches expensive state for some views.** CommitDetail
  on refresh will run `getRef` again. Today its `update` is a no-op
  (`needsUpdate = false`), so refresh skips it entirely. Keep
  `needsUpdate = false` for CommitDetail/Diff/StashDetail/Blame — initial
  `update` (called once by `build`) populates; subsequent refreshes are
  skipped. `MagitStatus`, `ShowRefs`, `SubmoduleList`, `Log` keep
  `needsUpdate = true` and refresh on file changes as today.

- **`new XxxView()` in `instanceof` users.** `copyBufferRevisionCommands`
  uses `instanceof MagitStatusView`/`CommitDetailView`. Class still
  exported, instanceof still works — no change.

## File-by-file deltas

- `src/views/general/documentView.ts` — `update` returns
  `void | Promise<void>`.
- Each `src/views/*View.ts` — drop the extra ctor args, move to URI parse
  + `update`.
- `src/views/diffView.ts`, `stashDetailView.ts`, `blameView.ts` — gain
  `Kind.build` and a real `update`; URI gets enough info to rebuild.
- `src/providers/magitViewBuilders.ts` — register `Diff`, `StashDetail`,
  `Blame` (PR/Issue still excluded).
- Each `src/commands/*Commands.ts` — `new XxxView(uri, ...)` →
  `ViewUtils.buildOrUpdate(repo, Kind, ...args)`.
- `src/utils/viewUtils.ts` — already has `buildOrUpdate`; no changes
  expected.

## Suggested commit shape

One commit per step (1 → 10). Each leaves the tree green; tests pass at
every step. Step 6 is the keystone — once CommitDetail is URI-only, the
"two paths to the same view" problem is gone.

---

## Appendix: Diff URI encoding (detail for Step 7)

### Today's call sites

```
diffRange       → git diff <range>                  (range is user input or HEAD)
diffWorktree    → git diff HEAD                     (a fixed range case)
diffPaths       → git diff --no-index <fileA> <fileB>
diffFile (un)   → git diff <path>
diffFile (st)   → git diff --cached <path>
```

`diffFile` already has a latent bug: it puts only `fileUri.path` in the
URI fragment, dropping the `--cached` flag — staged and unstaged file
diffs collide on the same URI. URI-only construction forces a fix.

### Three semantic variants

The five entry points reduce to three:

```ts
type DiffSpec =
  | { kind: 'range'; rev: string }                    // git diff <rev>
  | { kind: 'paths'; a: string; b: string }            // git diff --no-index <a> <b>
  | { kind: 'file';  path: string; cached: boolean };  // git diff [--cached] <path>
```

`worktree` collapses into `range` with `rev: 'HEAD'`. The semantic
difference (label says "worktree" vs "HEAD") is purely cosmetic and lives
in the tab label, not the underlying git command.

### URI shape

```
magit://diff/<repoPath>/<leaf>.magit?<query>
```

`<leaf>` is purely display; pick something readable per variant
(`diff.magit` is fine as a fallback). All routing data lives in the
query, JSON-stringified so spaces/special chars in paths and refs are
safe:

```json
{ "kind": "range", "rev": "HEAD~3..main" }
{ "kind": "paths", "a": "/abs/old.txt", "b": "/abs/new.txt" }
{ "kind": "file",  "path": "/abs/src/foo.ts", "cached": true }
```

Plus a `label` query key precomputed by `buildUri` for the tab title
formatter (see below).

### Identity / cache behavior

Two opens of the same diff hit the same URI and reuse the tab:
- `git diff HEAD` twice → same URI ✓
- `git diff src/foo.ts` and `git diff --cached src/foo.ts` → distinct
  (different `cached`) ✓
- `git diff origin/main` and `git diff main` → distinct (different
  `rev`) ✓ (matches user intent; they're different diffs)

### `Diff.buildUri` and `Diff.build`

```ts
export const Diff: RebuildableViewKind<[DiffSpec]> = {
  authority: 'diff',
  buildUri: (repo, spec) => buildMagitUri(repo.uri, leafFor(spec), {
    authority: Diff.authority,
    query: { ...spec, label: labelFor(spec) },
  }),
  build: async (uri) => {
    const repo = await MagitUtils.ensureRepoForMagitUri(uri);
    if (!repo) return undefined;
    const view = new DiffView(uri);
    await view.update(repo);
    return view;
  },
};
```

`DiffView.update(repo)` reads `JSON.parse(this.uri.query)` as `DiffSpec`,
maps to git args, runs `gitRunInUri(repo.uri, ['diff', ...args])`, parses
into `MagitChange[]`, replaces subviews. Same `git diff` invocations as
today, just driven by URI instead of a constructor parameter.

### Helpers

```ts
function gitArgsFor(spec: DiffSpec): string[] {
  switch (spec.kind) {
    case 'range': return [spec.rev];
    case 'paths': return ['--no-index', spec.a, spec.b];
    case 'file':  return spec.cached ? ['--cached', spec.path] : [spec.path];
  }
}

function leafFor(spec: DiffSpec): string {
  switch (spec.kind) {
    case 'range': return 'diff';
    case 'paths': return 'diff';
    case 'file':  return 'diff';  // basename in the label, not the leaf
  }
}

function labelFor(spec: DiffSpec): string {
  switch (spec.kind) {
    case 'range': return spec.rev.replace(/\//g, '∕');
    case 'paths': {
      const a = basename(spec.a), b = basename(spec.b);
      return `${a} ↔ ${b}`;
    }
    case 'file': {
      const name = basename(spec.path);
      return spec.cached ? `${name} (staged)` : name;
    }
  }
}
```

The U+2215 substitution on `rev` mirrors the trick used by Log /
CommitDetail — VS Code's `getUriBasenameLabel` runs `basename` on the
formatted label with `/` as separator and would chop `Diff: ` off rev
specs like `origin/main..HEAD`.

### Tab label formatter

In `package.json`, add a per-authority entry:

```json
{
  "scheme": "magit",
  "authority": "diff",
  "formatting": {
    "label": "Diff: ${query.label}",
    "separator": "/",
    "workspaceSuffix": "magit"
  }
}
```

Tabs become:
- `Diff: HEAD` for `git diff HEAD`
- `Diff: HEAD~3..main` for a range
- `Diff: foo.ts (staged)` for a staged file diff
- `Diff: foo.ts` for an unstaged file diff
- `Diff: old.txt ↔ new.txt` for `--no-index`

All readable, all distinct.

### Live call-site shape

After Step 7, `diffingCommands.ts`:

```ts
async function diffRange({ repository }: MenuState) {
  const range = (await window.showInputBox({ ... })) ?? repository.HEAD?.name;
  if (!range) return;
  return openDiff(repository, { kind: 'range', rev: range });
}

async function diffWorktree({ repository }: MenuState) {
  return openDiff(repository, { kind: 'range', rev: 'HEAD' });
}

async function diffPaths({ repository }: MenuState) {
  const a = await window.showInputBox({ prompt: 'First file', value: repository.uri.fsPath });
  if (!a) return;
  const b = await window.showInputBox({ prompt: 'Second file', value: repository.uri.fsPath });
  if (!b) return;
  return openDiff(repository, { kind: 'paths', a, b });
}

export async function diffFile(repository: MagitRepository, fileUri: Uri, index = false) {
  return openDiff(repository, { kind: 'file', path: fileUri.path, cached: index });
}

async function openDiff(repository: MagitRepository, spec: DiffSpec) {
  const view = await ViewUtils.buildOrUpdate(repository, Diff, spec);
  if (view) return ViewUtils.showView(view.uri, view);
}
```

`new DiffView(uri, magitChanges)` and the manual `gitRunInUri` calls
disappear from this file — they live inside `DiffView.update` /
`Diff.build`.

### Open questions

- **`diffPaths` with absolute fs paths in URI**: the JSON query includes
  full filesystem paths. Long URIs and a tiny privacy concern (paths in
  persisted editor state). Acceptable since these are local file paths
  the user just typed, but worth noting.
- **`needsUpdate` for `DiffView`**: today it's `false` (no auto-refresh
  on file changes). Keep it that way — the file-watcher refresh shouldn't
  re-run `git diff` on every save. The user gets a fresh diff by
  re-invoking the command.
- **Resource label and worktree wording**: the original `diffWorktree`
  showed "worktree" in some place; if any UI relies on that string, the
  new label `Diff: HEAD` may surprise. Probably fine, but worth a quick
  scan.
