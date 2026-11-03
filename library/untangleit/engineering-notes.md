# UntangleIt engineering notes

Michael Van Geertruy, with Claude. Project Revive Solutions, LLC.

What was built, what was tried, what failed, and why it is shaped this way. Companion to docs/build-status.md (where things stand) and docs/toolkit/ (the toolkit's common language, the inter-tool API, and this tool's spec).

## Where it came from

UntangleIt began as a branch inside DeepTest. DeepTest's "Hardest to test" row got a "Fix this" button on 2026-09-06 with two choices, test every way through the function or break it into smaller pieces, and the second choice was a refactoring brief handed to the assistant. Michael's review: that is an early version of a different tool, and by the toolkit's own rule (one verb per tool) it belongs in its own extension. The first field run settled it: against DeepTest's `visitStatement()` (48 ways through, limit 10), the assistant reduced the count by 10 instead of down to 10. A brief is not a loop. The code was pulled out here and fixed here, not patched in DeepTest.

What moved: the refactor brief (then `src/report/brief.ts`, rewritten to state the target three ways and to carry the pieces still over the limit into later rounds), the gates (checkpoint offer, then modal), and the hand-off. **All three were deleted in 1.0.21**; see "The governed layer, and what it replaced" below. What was written new: the loop with "Measure again", the before-and-after comparison, the run record, and the side panel.

What was copied, not shared: the tree-sitter structure parsers for TypeScript and Python (`src/languages/*/structure.ts`) are byte-for-byte DeepTest's, with the runtime, process, and tree-sitter helpers. The toolkit rule is no shared code between tools, so they are copies, and each tool updates its own. `src/engine/types.ts` came with them and still carries DeepTest's line-level types (depth, routes); UntangleIt uses only `FunctionComplexity`. Trimming that file means editing the parsers, which is deferred until the parsers diverge for a real reason.

## The loop is enforced, not described

The lesson from the field run is the design. UntangleIt does not ask the assistant to tell it what happened; it measures. "Measure again" runs the project's tests through the project's own runner, parses the file again, and compares with a snapshot taken when the untangling was sent. The comparison (`src/engine/tangle.ts`, `compare`) treats as pieces: the original method by name, every method that did not exist at the snapshot, and every existing method whose ways through changed. Unrelated neighbours that did not move are left out so they are neither credited nor blamed. Every piece is reported with its count; the run is done only when the sum over the limit is zero and no test fails.

Rounds: the snapshot from before round 1 is kept across rounds, so a piece created in round 1 is still a piece in round 3. The round brief lists the pieces still over. `untangleit.rounds` (default 3) bounds it; when the bound is hit the run is marked stopped and the person gets the numbers.

## What "gone" means

If the original method's name disappears and no new methods appear in its file, the comparison has nothing to report. That happens when the assistant renamed the method or moved it to another file. UntangleIt says so and asks the person to open that file and measure it there, rather than guessing. A cross-file follow would need the assistant's cooperation, which the tool does not rely on.

## Verification without tests

A project with no tests folder can still be measured, and the setup screen says plainly that without tests UntangleIt cannot verify that an untangling kept the behaviour. "Measure again" then reports the numbers with no test sentence. Generating characterization tests before an untangling is an open question in the spec.

## Sibling tools

KeepSafe is called through its public command only, from `src/keepsafe.ts`, the one file that names it. DeepTest is named in `src/deeptest.ts` only; UntangleIt never calls it, and after a successful untangling it tells the person to press "Check my code again" in DeepTest when DeepTest is installed. DeepTest's own "Break it into smaller pieces" door calls `untangleit.method` with `{ path, startLine }`; that command measures first if nothing has been measured yet, then runs the loop.

The silent command `untangleit.api.measure` returns the toolkit envelope (`protocol`, `tool`, `version`, `ok`, `result` or `error`). Errors are complete sentences a caller may show as they are.

## Words

Every sentence lives in `src/ui/words.ts`. "Ways through" is the term for cyclomatic complexity; "limit" never appears as "threshold"; every instruction names a control by its label ("Untangle it", "Measure again", "Send another round", "Stop here"). Unit tests pin the exact strings.

## Versions

Every build increments the version and the build stamps it into the panel header (`esbuild.mjs`), for the same reason DeepTest does: two builds under one number once cost an hour.

## The integration harness and the person's answer

**Historical, and the modal it describes is gone.** Until 1.0.21 the gate in front of a hand-off was a modal dialog, the suite could not press its button, and the harness set `UNTANGLEIT_TEST_HOST=1` in the extension host's environment so the gate treated that as "Yes, send it". It was read from the process environment, never from a setting.

1.0.21 deleted the modal. The authorization question is now asked through the governed layer, one yes authorizes one attempt, and the same environment-variable rule still governs how a harness may stand in for the person's answer: through a process-environment variable set by the harness, never through a setting.

## The governed layer, and what it replaced

The clipboard hand-off and the brief builder are **deleted rather than wrapped**. `src/copilot.ts` and `src/report/brief.ts` are gone, and `src/agent/` carries what replaced them: the registered interactions, the chat participant `prs.untangleit.governed`, the availability check, the kill-switch reader, the pre-fill, the pending authorized attempt and the read-only diff.

The reason for deleting rather than wrapping is the same one that moved this tool out of DeepTest in the first place. A wrapper leaves two paths to a model, and the second one is the one nobody checks. A structural test now asserts zero, not a list of known locations.

What UntangleIt owns and what it does not: it owns the refactor workflow and reads the recordings. Witness owns instrumentation delivery, behaviour recording, and from 1.0.21 the governed interaction machinery, the registry, the validators and the governance store. This tool supplies the directory the record is written into and nothing else about how it is written.

## Known gaps

- Only the AI engine transforms; the mechanical engine (extract method, guard clauses, dispatch table from the syntax tree) is the next piece of the spec. Measuring is mechanical already.
- Proposal delivery is diff-only: a validated proposal is rendered and the person applies it. That is an implementation decision with evidence behind it, recorded in the Governed Copilot Contract, and the first one to revisit when a stable review-and-apply API exists.
- `analyze*Tree` returns DeepTest's full structure; only `.functions` is used. Cost is a little wasted parsing per file.
- No report panel or Markdown export yet; the run record is the report.

## 0.1.1: the judging button that vanished

First field run, on DeepTest's `visitStatement()` (38 ways through at the
time). The assistant did the work well, seventeen pieces, every one claimed
at 5 or below. Then the person pressed "Find the tangled methods again",
`visitStatement()` fell out of the tangled list because it was now at 4,
and with it went the card that carried "Measure again". The command behind
that button is hidden from the palette because it takes arguments, so
there was no way to get the verdict. The tool judged nothing.

Fix: open untanglings are their own section, "Waiting on your assistance.",
listed from the run record rather than from the tangled list, so the
button to judge the work exists for as long as the work is unjudged. The
lesson is general for the toolkit: the control that judges an AI's result
must be keyed to the record of the hand-off, never to the condition the
hand-off was meant to remove.

## 0.1.2: the name, and the header that lagged a build

The product is spelled UntangleIt, one word, like its folder and its id;
every "UntangleIt" is gone.

The panel header showed the previous build's number after installing a new
VSIX and pressing "Restart Extensions". That button restarts the extension
host only. The header is the view container's title, a static contribution
the workbench reads from the manifest when the window loads, so it keeps
the old title until "Developer: Reload Window". The footer line inside the
panel is rendered by the running extension and is always right. The
instructions now say reload the window, and the same correction applies to
DeepTest's docs.

## Measure on demand for a sibling's call (0.1.8)

`untangleit.method` looked the method up in the last workspace measure and
refused when it was missing, which is every call that arrives from
DeepTest's "Break it into smaller pieces" on a fresh editor. Now, when the
method is not in the state, the file is measured on demand with
`measureFile` and the method found by its start line; the person is only
sent to "Find the tangled methods" when no method starts on that line.
The limit and the gates are unchanged; the only difference is that the
door from DeepTest opens without a prior run here.

## Tangle drives the tool (0.1.11)

Until now UntangleIt ranked and judged by ways through (cyclomatic), the
same number DeepTest uses for its test bar, with a limit of 5. The first
field runs showed the flaw: the top of the list was three flat message
switches at 28, 28, and 23 ways through, none of them hard to follow, and
the brief would have sent an assistant to split them into a method per
case. That move changes the depth of nothing: a class of 100 disconnected
methods has 100 paths through it and a depth of 1. It is the exact
outcome the toolkit exists to prevent.

The number that answers UntangleIt's question ("can a person follow this?")
is tangle, and specifically MikeVan's Better Cognitive Complexity (MBCC):
Campbell's Cognitive Complexity with one change, applied in two places.
Where order carries meaning the reader pays per step: a boolean run whose
operands depend on each other or make calls costs one per operand, and an
if / elif / else chain whose branches test different facts costs k for the
k-th branch. A chain on one value against constants is a switch in
disguise and costs one, as Campbell charges a switch. Both changes, the
reasoning, and what still needs validating are in the paper "MikeVan's
Better Cognitive Complexity: why it exists and what it is for" (in the
toolkit docs); the counting rules with worked cases are in the shared
library's docs/measures.md.

What changed here:

- The two structure parsers are now the same files DeepTest uses
  (src/languages/python/structure.ts, src/languages/typescript/structure.ts)
  and take all three numbers per function from
  `@projectrevivesolutions/complexity` (a `file:../complexity` link, so the
  library must be built before this tree is, and packaging must use
  `--no-dependencies` for the same reason DeepTest does). The old
  cyclomatic-only `complexityOf` walkers are gone; UntangleIt no longer
  owns a counter of its own.
- `rankTangled` filters and sorts on `mbcc`; `over` is mbcc minus the
  limit. `snapshot` and `compare` carry all three numbers and judge every
  piece by mbcc; `moved` and `before` are tangle. A flat switch with 29
  ways through and a tangle of 1 is never on the list, at any limit, and
  the test says so.
- The limit is a tangle limit, default 15 (SonarSource's published default
  for cognitive complexity per method). It was 5 ways through.
- Words: "big() has a tangle of 14. Your limit is 15." Behind the switch:
  "(MBCC 14, Campbell 12, 99 ways through; 9 over)". The card's meaning
  sentence says what tangle is and that ways through is DeepTest's number
  and does not change here.
- The brief targets tangle, explains how MBCC counts in five lines, and
  has a new section, "What lowers tangle, and what does not": pull nested
  blocks up, replace nested ifs with guard clauses, name an ordered
  condition; never split a flat switch or a flat chain into a method per
  case, never extract a flat run of statements. The done list and the
  judge sentence are unchanged in shape.
- `untangleit.api.measure` returns `cyclomatic`, `campbell`, and `mbcc` per
  method (and keeps `waysThrough` as an alias of `cyclomatic` so a caller
  written against 0.1.x still reads), with `over` computed on mbcc.

Fixture arithmetic, checked against the library: `classify` in both
fixtures is 5 ways through, Campbell 5, MBCC 6 (a two-branch chain on
different facts, 1 + 2, a nested if at 2, one independent `&&` run at 1);
`describeNumber` / `describe_number` is 8 on all three. At the old limit of
5 that ranks describeNumber (3 over) then classify (1 over); at the default
15 nothing is tangled, which is right for a fixture that small.

Verification on Michael's machine still owed: `npm install` (for the
link), `npm test`, build, install, then "Find the tangled methods" on
HelloWorld; `pick_greeting()` should top the list with its tangle, and the
brief it produces should carry the "What lowers tangle" section.

## The record says which number it holds (0.1.11)

A run record's `before` was ways through under 0.1.x and is tangle from
0.1.11, and the panel's "was N" badge had no way to tell them apart: a
HelloWorld record from 2026-09-11 read "was a tangle of 15" for a method
that had 15 ways through. New records carry `measure: "mbcc"`; a record
without the field is read as ways through and worded "was 15 ways
through". The runs file stays at version 1, because the shape only grew,
which is the rule in toolkit-api.md for public records. Pinned in
test/tangle.test.ts (`wasBefore`).

## Single-file components (1.0.3)

`.vue` and `.svelte` files are walked and measured. The structure source
hands the file to the library's `extractScript`, which returns the whole
file with everything outside the `<script>` blocks blanked and every
newline kept, so a method's start and end lines are the editor's lines
and the loop reads and rewrites exactly the lines it would in a `.ts`
file. The grammar follows the blocks' `lang` attributes. The template is
not parsed; its decisions wait for a later slot. Fixture test/fixtures/sfc
(a Vue, a Svelte, and a template-only component): `classify` measures
5/5/7 at line 4 in the .vue and line 2 in the .svelte; the template-only
file yields no methods. The extraction and its tests live in the library
(src/sfc.ts, test/sfc.test.ts) so DeepTest and UntangleIt read a component
the same way. DeepTest's engineering notes, "Single-file components are
parsed (1.0.3)", has the reasoning.

## Angular through the builder (1.0.4)

An Angular project whose angular.json test target is
`@angular/build:unit-test` without `"runner": "karma"` is run with
`ng test --watch=false` through the project's own @angular/cli, never
the vitest binary, because the tests need the Angular compiler and
TestBed that only the builder provides. The setup screen calls it "ng
test with Vitest". The summary is Vitest's, parsed the same way. Karma
under the builder is 1.0.5. Verified on HelloWorlds' angular-vitest: 11
passed through the loop's runner.

## Angular with Karma (1.0.5)

A Karma project under the unit-test builder runs with `ng test
--watch=false --browsers ChromeHeadless`, so the loop's test gate never
opens a browser window; the summary is Karma's last "Executed N of M"
line, parsed by `parseKarmaSummary`. The `--browsers` flag replaces the
project's own browser list for the run, so a custom launcher in the
project's karma.conf.js is not used here; DeepTest's driver keeps it.
Verified on HelloWorlds' angular-karma: 11 passed.


## Mocha and Playwright component tests in the test gate (1.0.8)

The loop's test gate runs Mocha (`mocha/bin/mocha.js`, the tests folder as
a glob when one is set) and Playwright component tests (the component
package's own `cli.js` with `-c playwright-ct.config.*` named, because
Playwright looks for `playwright.config.*` on its own and then complains
that component testing needs `defineConfig`). Detection follows
DeepTest's order: Playwright component tests first, then Vitest, Jest,
and Mocha, with the test script settling a tie. Summaries parsed the same
way as DeepTest's. Verified on HelloWorlds' node-mocha (10 passing) and
react-playwright-ct (10 passed) through the runner. One new test; 16.

## The integration suite meets the governed layer (1.0.21)

The release qualification of 2026-09-25 stopped at UntangleIt's `test:vscode`, the first time a release ever ran it. Three things in the suite were stale, and one was hiding behind the other two.

**The tangled set.** The suite expected one tangled method in the fixture, `describeNumber`. complexity 0.1.1 (`8019a06`, 2026-09-11) charges the k-th branch of an if / else-if chain k plus nesting, which moved `classify` from MBCC 5 to 6, one point over the fixture's limit of 5. The expectation predates the rule. Michael ruled the expectation wrong, not the fixture, so the suite now expects both methods and asserts each by name, MBCC, and ways through. It used to print ways through, which does not decide membership, and that is why the first failure looked like an off-by-one when it was not. The run record's `before` is now checked against MBCC, because the old check passed only because both numbers happen to be 8 for `describeNumber`.

**The hand-off.** The suite read the clipboard. Production stopped writing the clipboard when the governed participant replaced that hand-off, so there was nothing to read. A participant cannot be invoked from code and the editor cannot read the chat input back, so the governed hand-off could not be seen from the suite at all. Three options were weighed: a read-only observation in production, a test-only branch, and asserting the refusal only. The test-only branch would prove a path no customer runs, and asserting only the refusal leaves the pre-fill unproven, which is the thing that went stale. The observation won. `peekPendingAttempt()` reads the waiting attempt without taking it and returns its two identifiers only. `prefillChat` remembers the invocation once the editor accepts it. The activation API gains `waitingAttempt()` beside `state` and `run`, not added to the public contract. It was first named `handOff()`, and the release governance gate (row A) refused it, because Phase 5 deleted a local function by that name, the old ungoverned hand-off, and the gate keeps it from returning. The gate judges by identity, not intent, and it was right to: a reader seeing `handOff` in `extension.ts` would assume the deleted path was back. The observer was renamed and the gate was left alone. The suite now asserts the exact invocation, the run it belongs to, and that the attempt is still waiting, which proves nothing was sent, because the participant takes the attempt on send. A unit test pins that the look never spends the attempt and the take still does.

**The gate.** With those two fixed, the suite timed out waiting for a run record. Phase 8's gate refuses every propose action when the editor has no model, and the test editor has no signed-in assistant. The gate was right. The suite was written before it existed and never ran in the release path afterwards.

Experiment E7 (2026-11-02, VS Code 1.144.1, kept at the toolkit root in `_stubmodel-experiments`) measured whether a test-only extension can give the test editor a model. It can. A provider registered through `vscode.lm.registerLanguageModelChatProvider` and contributed under `languageModelChatProviders` was returned by `selectChatModels()` on the first call, under the suite's own `--disable-extensions` launch. Without it the same call returned no models for 15 seconds. Asking for the list called the provider three times, silently, and never called its response handler.

So the suite now runs in two launches. The governed launch loads a stub model from `test/integration/stub-model` beside UntangleIt and walks the whole loop. At the end it checks that the stub's response handler was called zero times; the handler throws if anything ever sends to it. The no-model launch loads UntangleIt alone and checks that the measurement still works and that "Untangle it" writes no run record, puts nothing on disk, and leaves nothing waiting, authorized, or pre-filled. That is the first time the Phase 8 gate has been proven in a real editor. Each launch checks which extensions are actually loaded, so a harness mistake cannot make one launch quietly test the other's case. Production code runs its real gate in both. The stub is never packaged, because `.vscodeignore` excludes `test/**`.
