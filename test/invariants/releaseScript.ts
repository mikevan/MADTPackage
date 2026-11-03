/**
 * Rows M to P: the bounded structural proof over `release.ps1` (J.4).
 *
 * **Option B, stated honestly.** `Parser::ParseFile` yields an AST; it does
 * not by itself prove arbitrary control-flow dominance. So the live script is
 * pinned to a restricted top-level form — which is what it already is — and
 * ordering is proved over that form. A general PowerShell path analysis is
 * not claimed, because nobody is implementing one.
 *
 * **Fail closed on anything else.** A `try`/`catch` wrapping the gate, a loop
 * containing it, a `switch`, a nested function, an `&`-invoked script block,
 * a `trap` around the boundary: the analysis does not recognize these, so the
 * gate fails and somebody decides. An unrecognized shape is never assumed
 * safe.
 *
 * **The division of labour.** PowerShell parses and describes; this module
 * decides. Everything the description contains is a typed node kind and a
 * position, so a comment, a string literal, whitespace or a renamed local
 * cannot satisfy or break any of it.
 *
 * **Windows-authoritative (J.5).** The parser is a .NET type. Where no
 * PowerShell host exists, these rows report **not-run**, never passed, and
 * `verify-phase9.ps1` qualifies them on Windows by exact identity and status.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Finding } from './ptp';

/** The six landmarks, in the order a release must take them. */
export const LANDMARKS = ['param', 'guards', 'preflight', 'gate', 'governance-only-exit', 'mirror-loop'] as const;
export type Landmark = (typeof LANDMARKS)[number];

/** Control-flow forms that must not enclose the preflight or the gate. */
const UNRECOGNIZED = ['TryStatementAst', 'SwitchStatementAst', 'ForEachStatementAst', 'WhileStatementAst', 'ForStatementAst', 'DoWhileStatementAst', 'TrapStatementAst', 'FunctionDefinitionAst'];

/**
 * One command, as the PowerShell parser resolved it: the command's own name
 * and its arguments, in order, with the command name itself dropped.
 *
 * This exists because a landmark that is a *command* cannot be recognized by
 * its source text without going stale. `npm run test:governance` and
 * `npm --prefix "$root\\MADTPackage" run test:governance` are the same
 * command; only the second has a flag between the name and the script. A
 * regex over the statement text cannot see that and a `CommandAst` can.
 */
export interface CommandInfo {
  readonly name: string;
  readonly args: readonly string[];
}

export interface ScriptDescription {
  /** Every top-level statement, in order, by AST type name. */
  readonly statements: readonly { readonly kind: string; readonly text: string; readonly commands: readonly CommandInfo[] }[];
  /** The parameter block's parameter names. */
  readonly parameters: readonly string[];
  /** Whether the guard block's statements are all throwing ifs. */
  readonly guardsThrowOnly: boolean;
}

/** A PowerShell host, or undefined when this environment has none. */
export function powershellHost(): string | undefined {
  for (const candidate of ['pwsh', 'powershell']) {
    const probe = spawnSync(candidate, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' });
    if (probe.status === 0) {
      return candidate;
    }
  }
  return undefined;
}

/** The describer. It parses and reports; it decides nothing. */
const DESCRIBER = `
param([Parameter(Mandatory=$true)][string]$Script)
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($Script, [ref]$tokens, [ref]$errors)
if ($errors -and $errors.Count -gt 0) { throw "release.ps1 does not parse: $($errors[0].Message)" }
$top = $ast.EndBlock.Statements
function Get-CommandInfo($node) {
  # Every command this statement contains, including ones inside a script
  # block argument: the governance gate is an npm command inside a Step's
  # script block, and that is where its identity lives.
  $found = $node.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] }, $true)
  $out = @()
  foreach ($c in $found) {
    $argv = @()
    $skip = $true
    foreach ($e in $c.CommandElements) {
      if ($skip) { $skip = $false; continue }
      if ($e -is [System.Management.Automation.Language.StringConstantExpressionAst]) { $argv += $e.Value }
      else { $argv += $e.Extent.Text }
    }
    $out += [pscustomobject]@{ name = $c.GetCommandName(); args = @($argv) }
  }
  return ,@($out)
}
$statements = @()
foreach ($s in $top) {
  $statements += [pscustomobject]@{ kind = $s.GetType().Name; text = $s.Extent.Text; commands = (Get-CommandInfo $s) }
}
$parameters = @()
if ($ast.ParamBlock) { foreach ($p in $ast.ParamBlock.Parameters) { $parameters += $p.Name.VariablePath.UserPath } }
$guardsThrowOnly = $true
foreach ($s in $top) {
  if ($s.GetType().Name -ne 'IfStatementAst') { continue }
  $isGuard = $s.Extent.Text -match 'throw'
  if (-not $isGuard) { continue }
  foreach ($clause in $s.Clauses) {
    foreach ($inner in $clause.Item2.Statements) {
      if ($inner.GetType().Name -ne 'ThrowStatementAst') { $guardsThrowOnly = $false }
    }
  }
}
[pscustomobject]@{ statements = $statements; parameters = $parameters; guardsThrowOnly = $guardsThrowOnly } | ConvertTo-Json -Depth 10 -Compress
`;

/** Describes `release.ps1`, or throws when no host can. */
export function describe(scriptPath: string, host = powershellHost()): ScriptDescription {
  if (!host) {
    throw new Error('No PowerShell host is available, so release.ps1 cannot be parsed here. These rows are Windows-authoritative and report not-run.');
  }
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gov-ps-')), 'describe.ps1');
  fs.writeFileSync(file, DESCRIBER, 'utf8');
  const run = spawnSync(host, ['-NoProfile', '-NonInteractive', '-File', file, '-Script', scriptPath], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (run.status !== 0) {
    throw new Error(`release.ps1 could not be described: ${(run.stderr || run.stdout || '').trim()}`);
  }
  return normalize(JSON.parse(run.stdout));
}

/** An array, whatever a one-element PowerShell array serialized itself as. */
function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  return value === undefined || value === null ? [] : [value as T];
}

/**
 * Regularizes the describer's JSON.
 *
 * `ConvertTo-Json` renders a one-element array as a bare object, and the
 * commands and argument lists are routinely one element long. Normalizing
 * here means nothing downstream has to know that.
 */
function normalize(raw: Record<string, unknown>): ScriptDescription {
  return {
    statements: asArray<Record<string, unknown>>(raw.statements).map((s) => ({
      kind: String(s.kind ?? ''),
      text: String(s.text ?? ''),
      commands: asArray<Record<string, unknown>>(s.commands).map((c) => ({
        name: String(c.name ?? ''),
        args: asArray<unknown>(c.args).map((a) => String(a ?? '')),
      })),
    })),
    parameters: asArray<unknown>(raw.parameters).map((p) => String(p ?? '')),
    guardsThrowOnly: raw.guardsThrowOnly === true,
  };
}

/** The npm script the release governance gate runs. */
const GOVERNANCE_SCRIPT = 'test:governance';

/** The helper both landmarks are written as. */
const STEP = 'step';

/**
 * npm's own installed-package directory. This is a filesystem contract, not
 * a phrase somebody chose: a dependency preflight establishes that packages
 * are installed, and `node_modules` is where npm installs them.
 */
const INSTALL_DIR = 'node_modules';

/**
 * Whether a resolved command IS the governance gate.
 *
 * The semantic identity of `npm run <script>` is three facts: the command is
 * npm, it is running a script, and the script is this one. Flags may sit
 * anywhere among the arguments without changing any of them, which is
 * exactly what `--prefix` does and exactly what a text match could not see.
 *
 * It stays strict about the part that matters: the script must be the
 * argument immediately after `run`, so `npm run build` is not this gate
 * merely because `test:governance` appears somewhere later on the line.
 */
export function isGovernanceGate(command: CommandInfo): boolean {
  if (command.name.trim().toLowerCase() !== 'npm') {
    return false;
  }
  const args = command.args.map((a) => a.trim());
  const run = args.indexOf('run');
  return run >= 0 && args[run + 1] === GOVERNANCE_SCRIPT;
}

/**
 * Whether a statement IS the governance dependency preflight.
 *
 * **Identified by what it does, never by what it is called.** This landmark
 * was previously found with `/Step\b[^\n]*(preflight|dependenc)/i`, which
 * matched prose inside the Step's display label. Rewording that label to
 * "governance prerequisites" would have broken the proof while changing
 * nothing about the script, and an unrelated Step whose label happened to
 * say "dependency" would have satisfied it. That is the same defect the gate
 * landmark had, and the same one it had for the same reason.
 *
 * The structural identity is already in the script and needed no inventing:
 * **the preflight is the Step that tests whether the governance
 * dependencies are installed**, which it does with `Test-Path` against paths
 * under `node_modules`. In the live script it is the only top-level
 * statement that does so — every other `Test-Path` targets the library
 * folder, a body file, a `package.json` or a lock file — and it is the only
 * Step that invokes no external program at all.
 *
 * So a relabelled preflight still qualifies, a Step labelled "preflight"
 * that installs or builds something does not, and the thing being recognized
 * is the behaviour the landmark exists to place in the order.
 */
export function isDependencyPreflight(statement: { readonly commands: readonly CommandInfo[] }): boolean {
  const isStep = statement.commands.some((c) => c.name.trim().toLowerCase() === STEP);
  const testsInstalledDependencies = statement.commands.some(
    (c) => c.name.trim().toLowerCase() === 'test-path' && c.args.some((a) => a.toLowerCase().includes(INSTALL_DIR)),
  );
  return isStep && testsInstalledDependencies;
}

/** Where each landmark sits in the top-level statement list, or -1. */
export function landmarkIndices(description: ScriptDescription): Record<Landmark, number> {
  const kinds = description.statements.map((s) => s.kind);
  const texts = description.statements.map((s) => s.text);
  const find = (predicate: (kind: string, text: string, index: number) => boolean): number => kinds.findIndex((k, i) => predicate(k, texts[i], i));

  const guards = find((kind, text) => kind === 'IfStatementAst' && /\bthrow\b/.test(text));
  // The preflight is identified by the dependency test it performs, never by
  // its display label. See `isDependencyPreflight`.
  const preflight = description.statements.findIndex(isDependencyPreflight);
  // The gate is identified by the command the parser resolved, never by the
  // statement's source text. See `isGovernanceGate`.
  const gate = description.statements.findIndex((s) => s.commands.some(isGovernanceGate));
  const exit = find((kind, text) => kind === 'IfStatementAst' && /\$GovernanceOnly/.test(text) && /\bexit\b/.test(text));
  const mirror = find((kind, text) => kind === 'ForEachStatementAst' && /\$mirrors/.test(text));
  return {
    param: description.statements.length > 0 ? 0 : -1,
    guards,
    preflight,
    gate,
    'governance-only-exit': exit,
    'mirror-loop': mirror,
  };
}

/** Rows M to P over one described script. */
export function releaseScriptFindings(description: ScriptDescription): Finding[] {
  const out: Finding[] = [];
  const at = 'release.ps1';
  const index = landmarkIndices(description);

  for (const landmark of LANDMARKS) {
    if (landmark === 'param') {
      continue;
    }
    if (index[landmark] < 0) {
      out.push({ invariant: 'M', at, detail: `the ${landmark} landmark is not a recognized top-level statement; the release script is no longer in the form this proof applies to` });
    }
  }
  if (LANDMARKS.some((l) => l !== 'param' && index[l] < 0)) {
    return out;
  }

  // Row M: the six landmarks, in order.
  const order: Landmark[] = ['guards', 'preflight', 'gate', 'governance-only-exit', 'mirror-loop'];
  for (let i = 1; i < order.length; i += 1) {
    if (!(index[order[i - 1]] < index[order[i]])) {
      out.push({ invariant: 'M', at, detail: `${order[i - 1]} does not precede ${order[i]}; no successful path may reach Phase 0 before a green gate` });
    }
  }

  // Row N: the guard block throws and only throws.
  if (!description.guardsThrowOnly) {
    out.push({ invariant: 'N', at, detail: 'a parameter guard does something other than throw; a guard that continues is not a guard' });
  }

  // Row N: the gate is unconditional. -SkipTests reaches neither step.
  for (const landmark of ['preflight', 'gate'] as const) {
    const statement = description.statements[index[landmark]];
    if (/\$SkipTests/.test(statement.text)) {
      out.push({ invariant: 'N', at, detail: `${landmark} is conditioned on -SkipTests; the gate is unconditional` });
    }
    // A `catch` anywhere in the gate step could swallow a red gate. A bare
    // `try`/`finally` cannot: with no catch clause it re-throws, so it is
    // permitted and only there to put the environment back.
    if (/\bcatch\b/.test(statement.text)) {
      out.push({ invariant: 'N', at, detail: `${landmark} contains a catch clause, which could swallow a failure; a finally with no catch is the only handler permitted here` });
    }
    if (UNRECOGNIZED.includes(statement.kind)) {
      out.push({ invariant: 'N', at, detail: `${landmark} sits inside a ${statement.kind}, which this bounded proof does not model; an unrecognized shape is never assumed safe` });
    }
  }

  // Row O: no switch that could skip or weaken the gate exists at all.
  for (const forbidden of ['SkipGovernance', 'Force', 'GovernanceWarningOnly']) {
    if (description.parameters.includes(forbidden)) {
      out.push({ invariant: 'O', at, detail: `-${forbidden} exists; there is no way to skip, weaken or warn instead of failing` });
    }
  }

  // Row P: the fixture root is accepted only with -GovernanceOnly.
  for (const required of ['GovernanceOnly', 'GovernanceFixtureRoot']) {
    if (!description.parameters.includes(required)) {
      out.push({ invariant: 'P', at, detail: `-${required} is missing; Phase 9 adds both and guards their combination` });
    }
  }
  const guardText = description.statements[index.guards]?.text ?? '';
  const allGuards = description.statements.filter((s) => s.kind === 'IfStatementAst' && /\bthrow\b/.test(s.text)).map((s) => s.text).join('\n');
  if (!/\$GovernanceFixtureRoot/.test(allGuards) || !/\$GovernanceOnly/.test(allGuards)) {
    out.push({ invariant: 'P', at, detail: `no throwing guard relates -GovernanceFixtureRoot to -GovernanceOnly; a normal release has no parameter that can change the root it inspects (${guardText.length > 0 ? 'guards present' : 'no guards present'})` });
  }

  return out;
}
