/**
 * Rows M to P, and the not-run report (J.5).
 *
 * **Windows-authoritative.** The PowerShell parser is a .NET type, so where no
 * host exists these rows cannot run. They report as skipped, never as passed,
 * and `verify-phase9.ps1` turns that skip into a failure on Windows, by exact
 * identity and status, the same mechanism Phases 7 and 8 use: a green Vitest
 * exit code is not proof if the Windows-only AST rows skipped.
 *
 * **Two questions, deliberately kept apart.** This file previously asked one:
 * `runnable = host !== undefined && fs.existsSync(script)`. That conflated
 * "this machine cannot perform the proof" with "the artifact being proved is
 * missing", and the second one was true the whole time — the path was built as
 * `<root>/release.ps1` while the script has always lived at
 * `<root>/MADTPackage/scripts/release.ps1`. So these rows had never run
 * anywhere. In the container the missing PowerShell host explained the skip
 * completely and plausibly, and the real defect hid behind it until Windows
 * removed the cover.
 *
 * So the two conditions are now separate tests with separate consequences.
 * A missing PowerShell host is an environment limitation and skips, saying so
 * in words. A missing `release.ps1` is not an environment limitation: it means
 * the tree is not a releasable toolkit, and it fails loudly in every
 * environment, naming the path it looked at.
 *
 * **And the script is located from this package, not from the governance
 * root.** `toolkitRoot()` deliberately changes meaning when
 * `POLYGLOT_GOVERNANCE_ROOT` names a governance fixture, because that is what
 * redirects the *source tree the invariants read*. The release script is not
 * part of that source tree; it is the product artifact these rows prove, and
 * its identity does not change with the fixture. Asking `toolkitRoot()` for it
 * coupled two different concepts, and the visible symptom was a red fixture
 * root growing a second failure that had nothing to do with its planted
 * violation. This file sits in `MADTPackage/test` and the script sits in
 * `MADTPackage/scripts`, so it is resolved from here, one level up and over.
 * A fixture run therefore needs no rows M to P exception: "a fixture run" was
 * never a reason these rows cannot be evaluated.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe as describeScript, isDependencyPreflight, isGovernanceGate, landmarkIndices, powershellHost, releaseScriptFindings } from './invariants/releaseScript';
import type { CommandInfo, ScriptDescription } from './invariants/releaseScript';

/**
 * The release script, resolved from this package rather than from the
 * governance root, and so invariant under `POLYGLOT_GOVERNANCE_ROOT`.
 *
 * `__dirname` is `MADTPackage/test` in the environment this actually runs in:
 * the package sets `noEmit`, declares no `outDir`, and Vitest transforms in
 * memory, so there is no compiled test location and no second path to be
 * right about. `test/program.ts` resolves the governance root the same way
 * from the same directory.
 */
const script = path.resolve(__dirname, '..', 'scripts', 'release.ps1');
const host = powershellHost();

describe('rows M to P: release.ps1 cannot reach Phase 0 before a green gate', () => {
  /**
   * Not skippable, by design. No environment is missing a release script
   * because of what it is; a tree without one is a tree that cannot qualify
   * for release, and that is a failure wherever it is noticed.
   */
  it('the release script this proof is about exists', () => {
    expect(
      fs.existsSync(script),
      `No release script at ${script}. The toolkit cannot qualify for release without the script rows M to P are supposed to prove. This is not an environment limitation and does not skip.`,
    ).toBe(true);
  });

  it('the six landmarks are in order, and the shape is one this proof models', (ctx) => {
    if (host === undefined) {
      // The one legitimate reason these rows do not run. The parser is a .NET
      // type, so a machine without PowerShell cannot perform the proof at
      // all. The note and the warning both say which reason this is, so a
      // skip is never mistaken for the other condition again.
      const why = 'No supported PowerShell host (pwsh or powershell) was found, so the release script cannot be parsed here. Rows M to P are Windows-authoritative and report not-run. On Windows this skip is a verification failure.';
      console.warn(`rows M to P: SKIPPED. ${why}`);
      ctx.skip(why);
      return;
    }
    expect(releaseScriptFindings(describeScript(script, host)).map((f) => `[${f.invariant}] ${f.detail}`)).toEqual([]);
  });
});

/**
 * The gate landmark's identity, proved without a PowerShell host.
 *
 * **This is the third recognizer in this family to go stale, and the reason
 * is always the same shape.** A landmark that is a *command* was being
 * recognized by matching the statement's source text, so
 * `npm --prefix "<path>" run test:governance` stopped being the gate the
 * moment a flag appeared between `npm` and `run` — a change that is
 * semantically identical and structurally valid. The identity now comes from
 * the command the PowerShell parser resolved, so a flag cannot hide it and a
 * reworded label cannot break it.
 *
 * These run everywhere, because they are about the identification, not about
 * parsing: they feed `CommandInfo` values of the shape the describer emits.
 */
const cmd = (name: string, ...args: string[]): CommandInfo => ({ name, args });

describe('the governance gate is identified by command, not by source text', () => {
  it('npm run test:governance is the gate', () => {
    expect(isGovernanceGate(cmd('npm', 'run', 'test:governance'))).toBe(true);
  });

  it('npm --prefix "<path>" run test:governance is the same gate', () => {
    // The exact shape the live script uses. A flag between the command and
    // the script changes nothing about which command this is.
    expect(isGovernanceGate(cmd('npm', '--prefix', 'C:\\workspace\\Toolkit\\MADTPackage', 'run', 'test:governance'))).toBe(true);
  });

  it('several flags, in any position, still leave it the same gate', () => {
    expect(isGovernanceGate(cmd('npm', '--silent', '--prefix', '/somewhere', 'run', 'test:governance'))).toBe(true);
  });

  it('an unrelated npm command is not the gate', () => {
    expect(isGovernanceGate(cmd('npm', 'run', 'build'))).toBe(false);
    expect(isGovernanceGate(cmd('npm', 'test'))).toBe(false);
    expect(isGovernanceGate(cmd('npm', 'ci'))).toBe(false);
  });

  it('the script must be what run is running, not merely present', () => {
    // `npm run build test:governance` runs build. Naming the governance
    // script later on the line does not make it this gate.
    expect(isGovernanceGate(cmd('npm', 'run', 'build', 'test:governance'))).toBe(false);
  });

  it('another program running the same script is not the gate', () => {
    expect(isGovernanceGate(cmd('pnpm', 'run', 'test:governance'))).toBe(false);
    expect(isGovernanceGate(cmd('yarn', 'run', 'test:governance'))).toBe(false);
  });

  it('the landmark is located in the statement list by that identity', () => {
    // Both spellings must land on the same statement index, from a
    // description shaped exactly as the describer emits one.
    const at = (gate: CommandInfo): number =>
      landmarkIndices({
        statements: [
          { kind: 'IfStatementAst', text: 'if ($x) { throw "no" }', commands: [] },
          { kind: 'PipelineAst', text: "Step 'preflight' { }", commands: [cmd('Step', 'preflight'), cmd('npm', 'ci')] },
          { kind: 'PipelineAst', text: 'Step { }', commands: [cmd('Step', 'gate'), gate] },
          { kind: 'IfStatementAst', text: 'if ($GovernanceOnly) { exit 0 }', commands: [] },
          { kind: 'ForEachStatementAst', text: 'foreach ($m in $mirrors) { }', commands: [] },
        ],
        parameters: ['GovernanceOnly', 'GovernanceFixtureRoot'],
        guardsThrowOnly: true,
      } as ScriptDescription).gate;

    expect(at(cmd('npm', 'run', 'test:governance'))).toBe(2);
    expect(at(cmd('npm', '--prefix', 'C:\\x\\MADTPackage', 'run', 'test:governance'))).toBe(2);
    expect(at(cmd('npm', 'run', 'build'))).toBe(-1);
  });
});

/**
 * The preflight landmark's identity, proved without a PowerShell host.
 *
 * Same family as the gate, caught before it failed rather than after. The
 * preflight was recognized by prose inside its display label, so rewording
 * that label would have broken the proof and an unrelated Step saying
 * "dependency" would have satisfied it. It is now recognized by the
 * dependency test it actually performs.
 */
const step = (label: string, ...rest: CommandInfo[]): CommandInfo[] => [cmd('Step', label), ...rest];

describe('the dependency preflight is identified by behaviour, not by its label', () => {
  /** The live shape: a Step that tests for installed governance dependencies. */
  const live = {
    commands: step(
      'MADTPackage: governance dependency preflight',
      cmd('Test-Path', '"$gateRoot\\node_modules\\typescript"'),
      cmd('Test-Path', '"$gateRoot\\node_modules\\@projectrevivesolutions\\witness"'),
    ),
  };

  it('the current preflight structure qualifies', () => {
    expect(isDependencyPreflight(live)).toBe(true);
  });

  it('the same structure under a completely different label still qualifies', () => {
    const relabelled = {
      commands: step(
        'MADTPackage: check the toolchain is ready',
        cmd('Test-Path', '"$gateRoot\\node_modules\\typescript"'),
      ),
    };
    expect(isDependencyPreflight(relabelled)).toBe(true);
  });

  it('a Step carrying the old label but the wrong behaviour does not qualify', () => {
    // The label says preflight. It installs instead of checking, which is the
    // one thing the preflight exists not to do.
    const impostor = { commands: step('MADTPackage: governance dependency preflight', cmd('npm', 'ci')) };
    expect(isDependencyPreflight(impostor)).toBe(false);
  });

  it('an unrelated Step whose label merely says dependency does not qualify', () => {
    const unrelated = { commands: step('resolve a dependency conflict', cmd('git', 'status')) };
    expect(isDependencyPreflight(unrelated)).toBe(false);
  });

  it('a path test that is not about installed packages does not qualify', () => {
    // The script tests plenty of other paths: the library folder, a body
    // file, a package.json, a lock file. None of those is this landmark.
    const other = { commands: step('mirror check', cmd('Test-Path', "(Join-Path $root 'MADTPackage\\library')")) };
    expect(isDependencyPreflight(other)).toBe(false);
  });

  it('a bare dependency test outside a Step does not qualify', () => {
    const loose = { commands: [cmd('Test-Path', '"$gateRoot\\node_modules\\typescript"')] };
    expect(isDependencyPreflight(loose)).toBe(false);
  });

  it('the landmark is located in the statement list by that identity, whatever the label', () => {
    const at = (label: string): number =>
      landmarkIndices({
        statements: [
          { kind: 'IfStatementAst', text: 'if ($x) { throw "no" }', commands: [] },
          { kind: 'PipelineAst', text: 'Step { }', commands: step(label, cmd('Test-Path', '"$gateRoot\\node_modules\\typescript"')) },
          { kind: 'PipelineAst', text: 'Step { }', commands: step('gate', cmd('npm', '--prefix', '/x', 'run', 'test:governance')) },
          { kind: 'IfStatementAst', text: 'if ($GovernanceOnly) { exit 0 }', commands: [] },
          { kind: 'ForEachStatementAst', text: 'foreach ($m in $mirrors) { }', commands: [] },
        ],
        parameters: ['GovernanceOnly', 'GovernanceFixtureRoot'],
        guardsThrowOnly: true,
      } as ScriptDescription).preflight;

    expect(at('MADTPackage: governance dependency preflight')).toBe(1);
    expect(at('anything at all')).toBe(1);
  });

  it('and it still sits before the gate in the ordering proof', () => {
    const index = landmarkIndices({
      statements: [
        { kind: 'IfStatementAst', text: 'if ($x) { throw "no" }', commands: [] },
        { kind: 'PipelineAst', text: 'Step { }', commands: step('whatever', cmd('Test-Path', '"$r\\node_modules\\typescript"')) },
        { kind: 'PipelineAst', text: 'Step { }', commands: step('whatever else', cmd('npm', 'run', 'test:governance')) },
        { kind: 'IfStatementAst', text: 'if ($GovernanceOnly) { exit 0 }', commands: [] },
        { kind: 'ForEachStatementAst', text: 'foreach ($m in $mirrors) { }', commands: [] },
      ],
      parameters: ['GovernanceOnly', 'GovernanceFixtureRoot'],
      guardsThrowOnly: true,
    } as ScriptDescription);
    expect(index.guards).toBeLessThan(index.preflight);
    expect(index.preflight).toBeLessThan(index.gate);
    expect(index.gate).toBeLessThan(index['governance-only-exit']);
    expect(index['governance-only-exit']).toBeLessThan(index['mirror-loop']);
  });
});
