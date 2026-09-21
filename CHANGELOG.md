# Changelog

## 1.0.13

The library documents record a hole in the ordered-operand rule and where the
check for it lives.

mbcc-why-and-how.md section 5 promised that splitting which removes no nesting
earns no credit. Measuring the complexity library's own 1.0.9 refactor showed
that is not quite true: a boolean run moved into a named helper lowers the
caller's number without lowering anyone's reading. The document now says so,
names the measured case, and says why the fix belongs in UntangleIt's loop
rather than in the scorer. measures.md carries the same note in the
ordered-operand section. untangle-it-spec.md step 5 now requires the total
alongside the per-piece report.

release.ps1 clears a stale .git\index.lock in every tree before the first git
write, and stops on one that is not stale. An empty lock is left behind
whenever a repository is read over a file bridge, because git writes the lock
to refresh its index even for a read and the bridge refuses the delete. The
next real git write then dies on it, after Phase 1 has already set every
version number, which is how the 1.0.13 release failed on its first attempt. A
lock with bytes in it belongs to a live operation and stops the release
instead of being removed.

## 1.0.10

The 1.x series is named Polyglot and the pack carries it: the Marketplace title
reads `MikeVan's AI Development Toolkit - Polyglot`. The roadmap now names both
series and says why 1.x has this one, since the only thing that moves the minor
number is a new language. The release script loses the UntangleIt title regex,
which the build has done for several versions and which the rename would have
broken silently.

## 1.0.9

Witness is its own library, `@projectrevivesolutions/witness`, the second the toolkit shares beside `@projectrevivesolutions/complexity`, and the fifth tree the release script aligns. DeepTest bundles it; UntangleIt declares it for the behaviour gate to come. Every toolkit document lives in `library\` with the byline naming Claude, and the release script mirrors and verifies the copies. The trees now live under `C:\workspace\MikeVan's AI Development Toolkit\`.

## 1.0.8

The 1.0 slot of the Language Expansion series, the JavaScript frameworks, is done across the toolkit: React, Vue, and Svelte on Jest or Vitest with single-file components parsed on their real lines; Angular through `ng test` with Vitest or Karma; Mocha and Playwright component tests through Witness, DeepTest's own instrumentation, which instruments in memory and writes nothing into a project; a Playwright project adds no line to any spec. Nothing from the series is on the Marketplace until the series ends. 1.1, Java, is next.

## 1.0.0

The core is done: KeepSafe, DeepTest 1.0, and UntangleIt 1.0 in one install. From here each language the toolkit learns moves the minor number of every extension together: Java 1.1, C# 1.2, C++ 1.3, then Go or PHP 1.4. See ROADMAP.md.


## 0.1.0

First pack: KeepSafe, DeepTest, and UntangleIt in one install.
