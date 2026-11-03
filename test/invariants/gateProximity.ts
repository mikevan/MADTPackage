/**
 * Row J: the Phase 8 kill switch cannot be walked around (F.3).
 *
 * **Per function, never per file.** `decisions/commands.ts` holds two gated
 * agentic workflows beside four that are not agentic at all, so a gate
 * somewhere in the file proves nothing about the function beside it.
 *
 * **What is required.** Every function whose own body reaches a transport or
 * authorization sink is gated before that sink: a gate call lexically
 * precedes the first sink call in the same body. A function that is not
 * gated itself passes only when **every** path into it is gated, which is
 * how `untangleWorst` is covered by `untangle` and how the callback inside
 * `reportProblem` is covered by the check above it.
 *
 * **General dominance over arbitrary control flow is not attempted.** An
 * agentic function that is neither gated itself nor reached only through
 * gated callers **fails**, and somebody decides. An unrecognised shape is
 * never assumed safe.
 */
import * as ts from 'typescript';
import { PackageProgram, enclosingFunction, resolved, walk, where } from '../program';
import type { Finding } from './ptp';
import { nameOf } from './entryPoints';

/** The three gate calls the live tree uses, all built on the Phase 8 pair. */
const GATES = ['agenticGateOpen', 'agentsEnabled', 'mayOfferAgentic'];

/** What must not happen before a gate. */
const SINKS = ['prefillChat', 'runGovernedInteraction', 'setPendingAttempt', 'askToAuthorize', 'issueInteraction'];

/** The two settings, and the one place permitted to combine them. */
const KILLSWITCH_MODULES = ['src/agent/killswitch.ts', 'src/agent/killswitchReader.ts'];
const COMBINER = 'src/agent/killswitch.ts';

type FunctionNode = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration;

const isFunctionNode = (n: ts.Node): n is FunctionNode =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);

interface Fact {
  readonly node: FunctionNode;
  /** Position of the first sink call in this body, or undefined. */
  readonly sinkAt?: number;
  /** Position of the first gate call in this body, or undefined. */
  readonly gateAt?: number;
  readonly callers: Set<string>;
}

/** Row J over one package. */
export function gateProximity(pkg: PackageProgram): Finding[] {
  const out: Finding[] = [];
  const facts = new Map<string, Fact>();
  const production = new Set(pkg.production.map((f) => f.fileName));

  const factFor = (node: FunctionNode): Fact => {
    const key = where(pkg, node);
    const hit = facts.get(key);
    if (hit) {
      return hit;
    }
    const made: Fact = { node, callers: new Set<string>() };
    facts.set(key, made);
    return made;
  };

  const record = (node: FunctionNode, field: 'sinkAt' | 'gateAt', position: number): void => {
    const key = where(pkg, node);
    const fact = factFor(node);
    const current = fact[field];
    facts.set(key, { ...fact, [field]: current === undefined ? position : Math.min(current, position) });
  };

  for (const file of pkg.production) {
    walk(file, (n) => {
      if (isFunctionNode(n)) {
        factFor(n);
      }
      if (!ts.isCallExpression(n)) {
        return;
      }
      const callee = ts.isPropertyAccessExpression(n.expression) ? n.expression.name : n.expression;
      if (!ts.isIdentifier(callee)) {
        return;
      }
      const owner = enclosingFunction(n);
      if (!owner) {
        if (SINKS.includes(callee.text)) {
          out.push({ invariant: 'J', at: where(pkg, n), detail: 'an agentic sink is reached at module top level, where no gate can precede it' });
        }
        return;
      }
      if (SINKS.includes(callee.text)) {
        record(owner as FunctionNode, 'sinkAt', n.getStart(file));
      }
      if (GATES.includes(callee.text)) {
        record(owner as FunctionNode, 'gateAt', n.getStart(file));
      }
      // Caller edges, for the transitive case.
      const symbol = resolved(pkg.checker, callee);
      for (const declaration of symbol?.declarations ?? []) {
        const target = isFunctionNode(declaration)
          ? declaration
          : ts.isVariableDeclaration(declaration) && declaration.initializer && isFunctionNode(declaration.initializer)
            ? declaration.initializer
            : undefined;
        if (target && production.has(target.getSourceFile().fileName)) {
          factFor(target).callers.add(where(pkg, owner));
        }
      }
    });
  }

  const gatedDirectly = (fact: Fact): boolean => fact.gateAt !== undefined && (fact.sinkAt === undefined || fact.gateAt < fact.sinkAt);

  /** Gated itself, or reached only through gated callers. A cycle is not a gate. */
  const covered = (key: string, seen = new Set<string>()): boolean => {
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    const fact = facts.get(key);
    if (!fact) {
      return false;
    }
    if (gatedDirectly(fact)) {
      return true;
    }
    if (fact.callers.size === 0) {
      return false;
    }
    return [...fact.callers].every((caller) => covered(caller, seen));
  };

  for (const [key, fact] of facts) {
    if (fact.sinkAt === undefined) {
      continue;
    }
    if (fact.gateAt !== undefined && fact.gateAt > fact.sinkAt) {
      out.push({ invariant: 'J', at: key, detail: `${nameOf(fact.node)} consults the kill switch after it has already reached an agentic sink` });
      continue;
    }
    if (!covered(key)) {
      out.push({
        invariant: 'J',
        at: key,
        detail: `${nameOf(fact.node)} reaches an agentic sink without consulting the kill switch, and not every path into it does either`,
      });
    }
  }

  return [...out, ...participantOrder(pkg), ...settingsConfinement(pkg)];
}

/**
 * Form 2, the one ordering a gate position cannot express: the participant's
 * disabled check precedes `takePendingAttempt`, so a turn that arrives while
 * agents are off does not consume the person's one authorized attempt.
 */
function participantOrder(pkg: PackageProgram): Finding[] {
  const out: Finding[] = [];
  for (const file of pkg.production) {
    let gate: number | undefined;
    let take: number | undefined;
    walk(file, (n) => {
      if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) {
        return;
      }
      if (n.expression.text === 'agentsEnabled' && gate === undefined) {
        gate = n.getStart(file);
      }
      if (n.expression.text === 'takePendingAttempt' && take === undefined) {
        take = n.getStart(file);
      }
    });
    if (take === undefined) {
      continue;
    }
    if (gate === undefined || gate > take) {
      out.push({
        invariant: 'J',
        at: `${pkg.name}/${file.fileName.split('/').slice(-3).join('/')}`,
        detail: 'a pending authorized attempt is taken before the kill switch is consulted; a disabled turn must not spend the person\'s one yes',
      });
    }
  }
  return out;
}

/**
 * Only the kill-switch modules read the two settings, and only one place
 * combines them. A second combination is a second answer to a question that
 * has one.
 */
function settingsConfinement(pkg: PackageProgram): Finding[] {
  const out: Finding[] = [];
  for (const file of pkg.production) {
    const rel = file.fileName.slice(pkg.root.length + 1).split('\\').join('/');
    walk(file, (n) => {
      if (!ts.isStringLiteralLike(n)) {
        return;
      }
      if (!/^(deeptest|untangleit)\.polyglot\.agents\.enabled$/.test(n.text)) {
        return;
      }
      if (!KILLSWITCH_MODULES.includes(rel)) {
        out.push({ invariant: 'J', at: where(pkg, n), detail: `${n.text} is read outside the kill-switch modules` });
      }
    });
    if (rel !== COMBINER) {
      walk(file, (n) => {
        if (ts.isFunctionDeclaration(n) && n.name?.text === 'effectiveAgentsEnabled') {
          out.push({ invariant: 'J', at: where(pkg, n), detail: 'a second place combines the two settings; the effective state has one definition' });
        }
      });
    }
  }
  return out;
}
