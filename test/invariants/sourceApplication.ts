/**
 * Row L: no model-derived change is applied to customer source, through the
 * checked production forms.
 *
 * **The controlling claim, and it is about the current tree.** In the 1.0.21
 * production tree, no current proposal path applies a model-derived source
 * change. What establishes it: zero editor-apply primitives (D-1); the
 * `(path, family, primitive)` write-surface equality across the four
 * mutation families (D-2); the VS Code API surface pinned at the proposal
 * boundary (D-4); the injected mutation-capable callbacks bounded by
 * approved source-free carriers (D-5), with those carriers pinned by the
 * gate itself rather than inherited from a suite (D-6); and the declared
 * package surface (D-7).
 *
 * **Transitive module or symbol reachability is deliberately not part of
 * this.** It was specified, implemented, and removed: the live tree reaches
 * a writer module transitively for one pure predicate, `isTestPath`, and a
 * requirement that fails on that is measuring module layout rather than
 * capability. D-2 already turns red if a proposal module calls a writer,
 * which is the protection that matters.
 *
 * **What it does not.** A value laundered through `any` or `unknown` and
 * re-widened. Dynamic dispatch through a computed property or a dynamic
 * `import()`. Reflection. Source mutation through a previously unknown
 * write-capable dependency or API, which is outside the proof until that
 * primitive is classified. A VS Code mutation API outside the four
 * enumerated families. Dependency-mediated writes, which D-7 makes visible
 * but does not judge. An unrecognised primitive introduced inside an
 * already-approved module. **None of that is claimed here, and no message
 * this file emits may imply otherwise.**
 *
 * **Why type-at-sink is not the proof.** `writeFileSync(p, proposal.edits[0].replacement)`
 * passes a `string`. An earlier revision of the plan relied on sink argument
 * types and would have let that through. The proof is the capability
 * separation, and D-5's carrier rule is what closes the remaining route.
 */
import * as ts from 'typescript';
import { PackageProgram, memberPath, moduleOfRoot, normalized, walk, where } from '../program';
import type { Finding } from './ptp';

// ---------------------------------------------------------------------------
// D.3, the canonical node write primitive set. This is the implementation
// contract and the negative-control surface.
// ---------------------------------------------------------------------------

export const NODE_WRITE_PRIMITIVES: ReadonlySet<string> = new Set([
  'writeFile', 'writeFileSync', 'appendFile', 'appendFileSync',
  'mkdir', 'mkdirSync', 'rm', 'rmSync', 'rmdir', 'rmdirSync',
  'rename', 'renameSync', 'unlink', 'unlinkSync',
  'copyFile', 'copyFileSync', 'cp', 'cpSync',
  'truncate', 'truncateSync', 'write', 'writeSync', 'createWriteStream',
]);

/** `open`/`openSync` count only when the mode resolves to a write-capable literal. */
const OPEN_PRIMITIVES: ReadonlySet<string> = new Set(['open', 'openSync']);
const READ_ONLY_MODES: ReadonlySet<string> = new Set(['r']);

const NODE_FS_MODULES: ReadonlySet<string> = new Set(['node:fs', 'fs', 'node:fs/promises', 'fs/promises']);

/** D.2, the VS Code workspace filesystem members that mutate. */
const VSCODE_FS_MUTATORS: ReadonlySet<string> = new Set(['writeFile', 'delete', 'rename', 'copy', 'createDirectory']);

/** D.2, the editor apply primitives. Zero in production. */
const EDITOR_APPLY: ReadonlySet<string> = new Set(['workspace.applyEdit', 'WorkspaceEdit', 'TextEdit']);
const EDITOR_APPLY_METHODS: ReadonlySet<string> = new Set(['insertSnippet']);

const CHILD_PROCESS_MODULES: ReadonlySet<string> = new Set(['node:child_process', 'child_process']);
const PROCESS_PRIMITIVES: ReadonlySet<string> = new Set(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']);

export type Family = 'node-fs' | 'vscode-fs' | 'editor-apply' | 'process';

export interface Capability {
  readonly file: string;
  readonly family: Family;
  readonly primitive: string;
  readonly at: string;
}

// ---------------------------------------------------------------------------
// D.4, the live equality set. `(normalized path, family, primitive)` triples,
// so a new recognised primitive inside an approved module turns the gate red.
// ---------------------------------------------------------------------------

export const APPROVED_WRITE_SURFACE: readonly string[] = [
  'DeepTest/src/decisions/decisions.ts|node-fs|mkdirSync',
  'DeepTest/src/decisions/decisions.ts|node-fs|writeFileSync',
  'DeepTest/src/languages/python/coverage.ts|node-fs|mkdirSync',
  'DeepTest/src/languages/python/coverage.ts|node-fs|unlinkSync',
  'DeepTest/src/languages/python/coverage.ts|node-fs|writeFileSync',
  'DeepTest/src/languages/shared/treeSitter.ts|node-fs|copyFileSync',
  'DeepTest/src/languages/shared/treeSitter.ts|node-fs|mkdirSync',
  'DeepTest/src/languages/typescript/coverage.ts|node-fs|mkdirSync',
  'DeepTest/src/languages/typescript/coverage.ts|node-fs|rmSync',
  'DeepTest/src/languages/typescript/coverage.ts|node-fs|writeFileSync',
  'DeepTest/src/ui/reportPanel.ts|vscode-fs|writeFile',
  'UntangleIt/src/languages/shared/treeSitter.ts|node-fs|copyFileSync',
  'UntangleIt/src/languages/shared/treeSitter.ts|node-fs|mkdirSync',
  'UntangleIt/src/runs.ts|node-fs|mkdirSync',
  'UntangleIt/src/runs.ts|node-fs|writeFileSync',
  'Witness/src/behaviour/gate.ts|node-fs|mkdirSync',
  'Witness/src/behaviour/gate.ts|node-fs|rmSync',
  'Witness/src/behaviour/gate.ts|node-fs|writeFileSync',
  'Witness/src/behaviour/python.ts|node-fs|mkdirSync',
  'Witness/src/behaviour/typescript.ts|node-fs|mkdirSync',
  'Witness/src/behaviour/typescript.ts|node-fs|rmSync',
  'Witness/src/behaviour/typescript.ts|node-fs|writeFileSync',
  'Witness/src/delivery.ts|node-fs|copyFileSync',
  'Witness/src/delivery.ts|node-fs|mkdirSync',
  'Witness/src/delivery.ts|node-fs|writeFileSync',
  'Witness/src/governance/store.ts|node-fs|appendFileSync',
  'Witness/src/governance/store.ts|node-fs|mkdirSync',
  'Witness/src/treeSitter.ts|node-fs|copyFileSync',
  'Witness/src/treeSitter.ts|node-fs|mkdirSync',
];

/** The two modules permitted to execute a process. */
export const APPROVED_PROCESS_MODULES: readonly string[] = [
  'DeepTest/src/languages/shared/process.ts',
  'Witness/src/process.ts',
];

/** Every mutation capability a package reaches, by resolved symbol. */
export function capabilities(pkg: PackageProgram): Capability[] {
  const out: Capability[] = [];
  for (const f of pkg.production) {
    const file = normalized(pkg, f);
    walk(f, (n) => {
      if (!ts.isPropertyAccessExpression(n)) {
        return;
      }
      const mod = moduleOfRoot(pkg.checker, n);
      const mp = memberPath(n);
      const leaf = n.name.text;

      if (mod !== undefined && NODE_FS_MODULES.has(mod)) {
        const member = mp.replace(/^promises\./, '');
        if (NODE_WRITE_PRIMITIVES.has(member)) {
          out.push({ file, family: 'node-fs', primitive: member, at: where(pkg, n) });
        } else if (OPEN_PRIMITIVES.has(member)) {
          // Fail closed unless the mode resolves to a read-only literal.
          const mode = ts.isCallExpression(n.parent) ? n.parent.arguments[1] : undefined;
          const literal = mode && ts.isStringLiteralLike(mode) ? mode.text : undefined;
          if (literal === undefined || !READ_ONLY_MODES.has(literal)) {
            out.push({ file, family: 'node-fs', primitive: member, at: where(pkg, n) });
          }
        }
        return;
      }

      if (mod === 'vscode') {
        if (/^workspace\.fs\./.test(mp) && VSCODE_FS_MUTATORS.has(leaf)) {
          out.push({ file, family: 'vscode-fs', primitive: leaf, at: where(pkg, n) });
          return;
        }
        if (EDITOR_APPLY.has(mp) || EDITOR_APPLY.has(leaf)) {
          out.push({ file, family: 'editor-apply', primitive: mp, at: where(pkg, n) });
          return;
        }
        return;
      }

      if (mod !== undefined && CHILD_PROCESS_MODULES.has(mod) && PROCESS_PRIMITIVES.has(leaf)) {
        out.push({ file, family: 'process', primitive: leaf, at: where(pkg, n) });
      }
    });

    // Named imports from the capability modules: `import { spawn } from 'node:child_process'`.
    walk(f, (n) => {
      if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) {
        return;
      }
      const mod = moduleOfRoot(pkg.checker, n.expression);
      const name = n.expression.text;
      if (mod !== undefined && CHILD_PROCESS_MODULES.has(mod) && PROCESS_PRIMITIVES.has(name)) {
        out.push({ file, family: 'process', primitive: name, at: where(pkg, n) });
      }
      if (mod !== undefined && NODE_FS_MODULES.has(mod) && NODE_WRITE_PRIMITIVES.has(name)) {
        out.push({ file, family: 'node-fs', primitive: name, at: where(pkg, n) });
      }
      if (mod === 'vscode' && EDITOR_APPLY_METHODS.has(name)) {
        out.push({ file, family: 'editor-apply', primitive: name, at: where(pkg, n) });
      }
    });
  }
  return out;
}

/** D-1 and D-2 over every governed package at once. */
export function writeSurface(pkgs: readonly PackageProgram[]): Finding[] {
  const out: Finding[] = [];
  const found = pkgs.flatMap(capabilities);

  for (const c of found) {
    if (c.family === 'editor-apply') {
      out.push({ invariant: 'D-1', at: c.at, detail: `an editor-apply primitive (${c.primitive}) exists in production; Polyglot renders a proposal and the person applies it` });
    }
  }

  const writes = found.filter((c) => c.family === 'node-fs' || c.family === 'vscode-fs');
  const actual = [...new Set(writes.map((c) => `${c.file}|${c.family}|${c.primitive}`))].sort();
  const approved = [...APPROVED_WRITE_SURFACE].sort();
  for (const triple of actual) {
    if (!approved.includes(triple)) {
      const hit = writes.find((c) => `${c.file}|${c.family}|${c.primitive}` === triple)!;
      out.push({ invariant: 'D-2', at: hit.at, detail: `${triple} is not in the approved write surface` });
    }
  }
  for (const triple of approved) {
    if (!actual.includes(triple)) {
      out.push({ invariant: 'D-2', at: triple, detail: 'an approved write no longer exists; the equality is stale and somebody must look' });
    }
  }

  const processModules = [...new Set(found.filter((c) => c.family === 'process').map((c) => c.file))].sort();
  for (const m of processModules) {
    if (!APPROVED_PROCESS_MODULES.includes(m)) {
      out.push({ invariant: 'D-2', at: m, detail: 'process execution outside the two approved process modules' });
    }
  }
  return out;
}

/** The proposal-bearing modules, by normalized path. */
export const PROPOSAL_BEARING: readonly string[] = [
  'Witness/src/governance/interaction.ts',
  'DeepTest/src/agent/participant.ts',
  'DeepTest/src/agent/proposals.ts',
  'DeepTest/src/agent/diff.ts',
  'UntangleIt/src/agent/participant.ts',
  'UntangleIt/src/agent/proposals.ts',
  'UntangleIt/src/agent/diff.ts',
];

// ---------------------------------------------------------------------------
// D-4 and D-7: the VS Code API surface and the package surface at the
// proposal boundary. `vscode` is not harmless because it is allowed.
// ---------------------------------------------------------------------------

const APPROVED_VSCODE_SURFACE: Readonly<Record<string, readonly string[]>> = {
  participant: [
    'ChatResponseStream', 'ChatResult', 'Disposable', 'LanguageModelChat', 'LanguageModelChatMessage',
    'LanguageModelError', 'MarkdownString', 'Uri', 'chat', 'lm', 'workspace',
  ],
  diff: ['Disposable', 'Uri', 'commands', 'window', 'workspace'],
};

/** Packages a proposal-bearing module may import, D-7. */
const APPROVED_PACKAGES: ReadonlySet<string> = new Set(['vscode', 'node:crypto', '@projectrevivesolutions/witness']);

/** The one command id a proposal-bearing module may execute. */
const APPROVED_PROPOSAL_COMMANDS: ReadonlySet<string> = new Set(['vscode.diff']);

export function proposalBoundary(pkgs: readonly PackageProgram[]): Finding[] {
  const out: Finding[] = [];
  for (const pkg of pkgs) {
    for (const f of pkg.production) {
      const file = normalized(pkg, f);
      if (!PROPOSAL_BEARING.includes(file)) {
        continue;
      }
      const kind = /participant\.ts$/.test(file) ? 'participant' : /diff\.ts$/.test(file) ? 'diff' : undefined;

      // D-7: the declared package surface.
      for (const statement of f.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
          continue;
        }
        const spec = statement.moduleSpecifier.text;
        if (spec.startsWith('.')) {
          continue;
        }
        if (!APPROVED_PACKAGES.has(spec)) {
          out.push({ invariant: 'D-7', at: `${file}`, detail: `imports the package ${spec}, which is outside the declared surface for a proposal-bearing module` });
        }
      }

      // D-4: the VS Code surface, and the one approved command.
      walk(f, (n) => {
        if (ts.isPropertyAccessExpression(n) && moduleOfRoot(pkg.checker, n) === 'vscode') {
          const root = memberPath(n).split('.')[0];
          const allowed = kind ? APPROVED_VSCODE_SURFACE[kind] : [];
          if (!allowed.includes(root)) {
            out.push({ invariant: 'D-4', at: where(pkg, n), detail: `reaches vscode.${memberPath(n)}, outside the approved surface for this proposal-bearing module` });
          }
          if (/^workspace\.fs\b/.test(memberPath(n))) {
            out.push({ invariant: 'D-4', at: where(pkg, n), detail: 'a proposal-bearing module reaches the VS Code workspace filesystem' });
          }
        }
        if (
          ts.isCallExpression(n) &&
          ts.isPropertyAccessExpression(n.expression) &&
          n.expression.name.text === 'executeCommand' &&
          moduleOfRoot(pkg.checker, n.expression) === 'vscode'
        ) {
          const first = n.arguments[0];
          const id = first && ts.isStringLiteralLike(first) ? first.text : undefined;
          if (id === undefined) {
            out.push({ invariant: 'D-4', at: where(pkg, n), detail: 'an unresolvable command id in a proposal-bearing module fails closed' });
          } else if (!APPROVED_PROPOSAL_COMMANDS.has(id)) {
            out.push({ invariant: 'D-4', at: where(pkg, n), detail: `executes ${id}; only ${[...APPROVED_PROPOSAL_COMMANDS].join(', ')} is approved from a proposal-bearing module` });
          }
        }
      });
    }
  }
  return out;
}

/** Row L in full. */
export function sourceApplicationFindings(pkgs: readonly PackageProgram[]): Finding[] {
  return [...writeSurface(pkgs), ...proposalBoundary(pkgs), ...carriers(pkgs)];
}

// ---------------------------------------------------------------------------
// D-5 and D-6: the injected dependencies that cross the boundary, and the
// carriers they accept.
//
// This is the route that remains once a proposal-bearing module holds no
// mutation capability of its own: a capability handed in. `persist` really
// does write, and that is deliberate — Phase 7 put it there. What makes it
// safe is the carrier, and the carrier is pinned here by the release gate
// rather than inherited from a behavioural suite the gate does not run.
//
// **A generic writer accepting `string` is not safe merely because its
// parameter is not `ProposeResponse`.**
// ---------------------------------------------------------------------------

/** The members `GovernedDeps` may carry, and what each is allowed to accept. */
const APPROVED_DEPS: Readonly<Record<string, { readonly mutationCapable: boolean; readonly carrier: RegExp }>> = {
  model: { mutationCapable: false, carrier: /ModelPort/ },
  surface: { mutationCapable: false, carrier: /SurfacePort/ },
  keepProposal: { mutationCapable: false, carrier: /ProposeResponse/ },
  persist: { mutationCapable: true, carrier: /GovernanceRecord/ },
  recordAttempt: { mutationCapable: true, carrier: /AttemptIdentity|ApplicationAnchor/ },
  onCapability: { mutationCapable: false, carrier: /attemptId|AttemptIdentity/ },
  repository: { mutationCapable: false, carrier: /RepositoryPort/ },
  syntax: { mutationCapable: false, carrier: /SyntaxPort/ },
  log: { mutationCapable: false, carrier: /string/ },
  authorization: { mutationCapable: false, carrier: /Authorization/ },
};

/** Field names a source-free carrier may never acquire. */
const SOURCE_BEARING = /proposal|source|prompt|response|edits|replacement|diff|patch|content|text/i;

/** D-5 and D-6 over the governed packages. */
export function carriers(pkgs: readonly PackageProgram[]): Finding[] {
  const out: Finding[] = [];
  const witness = pkgs.find((p) => p.name === 'Witness');
  if (!witness) {
    return out;
  }
  for (const f of witness.production) {
    if (normalized(witness, f) !== 'Witness/src/governance/interaction.ts') {
      continue;
    }
    walk(f, (n) => {
      if (!ts.isInterfaceDeclaration(n) || n.name.text !== 'GovernedDeps') {
        return;
      }
      for (const member of n.members) {
        if (!ts.isPropertySignature(member) || !member.name || !ts.isIdentifier(member.name)) {
          continue;
        }
        const name = member.name.text;
        const approved = APPROVED_DEPS[name];
        if (!approved) {
          out.push({ invariant: 'D-5', at: where(witness, member), detail: `GovernedDeps.${name} is a new injected dependency; classify its carrier before the release passes` });
          continue;
        }
        const typeText = member.type ? member.type.getText() : '';
        if (!approved.carrier.test(typeText)) {
          out.push({ invariant: 'D-5', at: where(witness, member), detail: `GovernedDeps.${name} carries ${typeText}, which is not its approved carrier` });
        }
        if (approved.mutationCapable && /\b(string|unknown|any)\b/.test(typeText.replace(/'[^']*'/g, ''))) {
          out.push({ invariant: 'D-5', at: where(witness, member), detail: `GovernedDeps.${name} is mutation-capable and accepts a bare scalar; only an approved source-free carrier may cross that boundary` });
        }
      }
    });
  }
  out.push(...sourceFreeCarriers(witness));
  return out;
}

/**
 * D-6. The carriers a mutation-capable dependency accepts must be source-free,
 * proved here rather than inherited.
 *
 * `RECORD_FIELDS` is Witness's own frozen field list, exported publicly, so
 * no second schema is defined. The gate reads the declared record interface
 * and requires every field name to be outside the source-bearing set.
 */
function sourceFreeCarriers(witness: PackageProgram): Finding[] {
  const out: Finding[] = [];
  const targets = new Map<string, string>([
    ['GovernanceRecord', 'Witness/src/governance/record.ts'],
    ['ApplicationAnchor', 'Witness/src/governance/anchor.ts'],
  ]);
  for (const f of witness.production) {
    const file = normalized(witness, f);
    walk(f, (n) => {
      const isDecl = ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n);
      if (!isDecl || !n.name) {
        return;
      }
      const name = n.name.text;
      if (targets.get(name) !== file) {
        return;
      }
      if (ts.isInterfaceDeclaration(n)) {
        for (const member of n.members) {
          if (ts.isPropertySignature(member) && member.name && ts.isIdentifier(member.name) && SOURCE_BEARING.test(member.name.text)) {
            out.push({ invariant: 'D-6', at: where(witness, member), detail: `${name}.${member.name.text} is a source-bearing field name on a carrier a mutation-capable dependency accepts` });
          }
        }
      } else {
        // Property NAMES only. String-literal type values are stripped first:
        // `ApplicationAnchor`'s discriminant is the literal 'content-digest',
        // and matching the word `content` inside it would be exactly the
        // spelling-over-meaning error this gate exists to prevent. It caught
        // itself doing that once, here.
        const withoutLiterals = n.type.getText().replace(/'[^']*'/g, "''");
        const propertyNames = [...withoutLiterals.matchAll(/(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*\??\s*:/g)].map((m) => m[1]);
        for (const prop of propertyNames) {
          if (SOURCE_BEARING.test(prop)) {
            out.push({ invariant: 'D-6', at: where(witness, n), detail: `${name}.${prop} is a source-bearing field name on a carrier a mutation-capable dependency accepts` });
          }
        }
      }
    });
  }
  return out;
}
