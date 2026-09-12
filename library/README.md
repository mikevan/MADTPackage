# The library

Michael Van Geertruy, with Claude. Project Revive Solutions, LLC.

Every document written for MikeVan's AI Development Toolkit lives here, and this file is the catalogue. The documents are written by Michael Van Geertruy working with Claude, Anthropic's AI model, and every one of them says so in its byline. That is not a disclosure buried in a footer. It is how the toolkit is built: one engineer and one AI, with the engineer's name on the failures and the successes, and the AI's help named in the open.

This folder is the one source. The copies under `DeepTest\docs`, `UntangleIt\docs`, and `complexity\docs` are mirrors that `scripts\release.ps1` refreshes on every release, so a document is edited here and nowhere else. `ROADMAP.md` at the root of this repository is a mirror of `toolkit\toolkit-roadmap.md` for the same reason.

Each entry gives the file, what it is for, and when to read it. Drafts are numbered inside the document itself, with the date of each draft, so the catalogue does not repeat them.

## Toolkit

The documents that hold for every tool.

| File | What it is | Read it when |
|---|---|---|
| `toolkit\toolkit-architecture.md` | The common design and architecture language: the words, the principles, the shape of a tool, and the rules between tools. | You are naming or describing anything in the toolkit, or adding a tool. |
| `toolkit\toolkit-api.md` | The contract between the tools: every command, every payload, every file one tool leaves for another. Anything not written here is private to a tool. | One tool needs something from another. |
| `toolkit\toolkit-roadmap.md` | The road to 1.0 and past it: the language expansion series, one minor number per language across the whole toolkit, and what each language must have before it ships. | You are planning a slot or asking what comes next. |
| `toolkit\plan-1.0-javascript-frameworks.md` | The plan for the 1.0 slot, the JavaScript frameworks: the survey's findings, the phase order, and what each phase had to prove. Done. | You want to see how a slot is planned before planning the next. |
| `toolkit\mbcc-why-and-how.md` | MikeVan's Better Cognitive Complexity: why the number exists, what it serves, and the rules that make it. | You are working on the measure, or explaining it to someone. |
| `toolkit\untangle-it-spec.md` | The UntangleIt spec, written before any code so the shape could be argued with. | You are changing what UntangleIt does. |
| `toolkit\witness.md` | Witness, DeepTest's own instrumentation: why it exists, the instrumenter, the runtime, the loaders, the Vite plugin, the Playwright worker hook, what proves it, and where it lives. | You are touching how a JavaScript test run is measured. |

## DeepTest

| File | What it is | Read it when |
|---|---|---|
| `deeptest\build-status.md` | Where DeepTest stands, build by build, with what to verify on each. | You are picking up the tree, or checking what a build was meant to do. |
| `deeptest\engineering-notes.md` | What was tried, what failed, and why the code looks the way it does, delivery by delivery. | Before changing anything that looks odd. It is odd for a reason written here. |
| `deeptest\uat.md` | The user acceptance test, run as Jeff would run it: what to press, what to read, and what you should see. | Before a release, and after any change to the screens. |

## UntangleIt

| File | What it is | Read it when |
|---|---|---|
| `untangleit\build-status.md` | Where UntangleIt stands, build by build. | You are picking up the tree. |
| `untangleit\engineering-notes.md` | What was built, what was tried, what failed, and why it is shaped this way. | Before changing anything that looks odd. |
| `untangleit\uat.md` | The user acceptance test, as Jeff would run it. | Before a release, and after any change to the screens. |

## The complexity library

| File | What it is | Read it when |
|---|---|---|
| `complexity\measures.md` | The three measures the library computes and the rules behind each, version by version. | You are changing a measure, or checking what a number means. |

## Articles and posts

Pieces written to be read outside the toolkit: LinkedIn, the website, and wherever else they are useful.

| File | What it is | Where it goes |
|---|---|---|
| `articles\witness-one-instrument-every-framework.md` | One instrument, every framework: how DeepTest reads tests line by line under every JavaScript runner, where it is the only tool that does, and why it is built that way. With sources. | The website, and a long-form post. |
| `articles\linkedin-deeptest-playwright.md` | DeepTest and Playwright: what happens when you stop asking the framework for permission. | LinkedIn. |

## Adding a document

Put it in the folder it belongs to, give it the byline on its third line (`Michael Van Geertruy, with Claude. Project Revive Solutions, LLC.`), add a row here, and if a tool should carry a copy, add the mirror to `scripts\release.ps1`. A document is edited here and nowhere else; a mirror that differs from the library is a bug in the release script, and the script checks for it.
