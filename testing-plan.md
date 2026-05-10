Create a thorough testing plan.

The extension sits between vscode as the final render interaction layer, and git.

Trying to mock these layers fully is difficult to get consistently right.

One of the main things I want is making the tests readable, and it's OK creating some dedicated
test only parsers/renderers to get us there

# git backend

For git we'd like to either write tests against our own repository, that's kinda neat and simple. But we'd also like to create tests of certain situations (merges/deletes etc.) so we can make
sure we don't mess up.

Ie. having little dsl like framework, where we can specify a commit and the worktree
it should describe, optionally being able to specify patches instead of full content:

```
commit: foo
> filename.py
 import os
 
 if __name__ == "main": ...
```

The framework should then build the repo in eg. /tmp and then we can run tests on top it.


# frontend 
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


# other providers

We also have symbol and highlighting providers. Here again we should consider
adding a markup language on top of the text interface:
```
 0aa5e3a THB  56 minut… ┯ switch-to-fs-provider (claude) gitHistory: encode repo path in URI, drop spawn-from-file's-dir
                          ^  highlight-type   ^
 c253084 THB  1 hour    ┿ (claude) package: restore magit-history label formatter
 d5d2f9f THB  1 hour    ┿ (claude) views: Blame becomes rebuildable
```