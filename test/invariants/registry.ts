/**
 * Row H: registry completeness, over the real production specs (Part G).
 *
 * **Reuse, not a second definition.** `validateSpec` is Witness's, reached
 * through the declared public surface, and the four spec constants are
 * imported by value and matched by identity rather than re-declared. Nothing
 * here restates the ten-field contract; Witness owns it.
 *
 * **Structural derivation, not activation.** The gate never executes a
 * product's `registerInteractions()`: importing a peer's private `src/`
 * would break the Part E boundary, and activating an extension is not
 * something a release test does. It locates the real
 * `registerInteraction(<literal>)` call sites through the compiler API,
 * materializes each argument, and hands the result to public `validateSpec`.
 * These are the production spec literals, not copies of them.
 */
import * as ts from 'typescript';
import {
  NOTHING_TO_VERIFY,
  NO_AUTHORIZATION_NEEDED,
  ONE_CORRECTION,
  USER_AUTHORIZES_ATTEMPT,
  validateSpec,
} from '@projectrevivesolutions/witness';
import { PackageProgram, normalized, resolved, walk, where } from '../program';
import type { Finding } from './ptp';

/** The public constants, by the name the production source imports them under. */
const PUBLIC_CONSTANTS: Readonly<Record<string, unknown>> = {
  NOTHING_TO_VERIFY,
  NO_AUTHORIZATION_NEEDED,
  ONE_CORRECTION,
  USER_AUTHORIZES_ATTEMPT,
};

/** Where each product declares what it can do. */
const INTERACTIONS = 'src/agent/interactions.ts';
const EXTENSION = 'src/extension.ts';

/** Rule 91: roadmap opportunity labels are never runtime registry keys. */
const O_NUMBER = /^O-?\d+/i;

export interface DerivedSpec {
  readonly id: string;
  readonly spec: Record<string, unknown>;
  readonly node: ts.Node;
}

const relOf = (pkg: PackageProgram, f: ts.SourceFile): string => normalized(pkg, f).slice(pkg.name.length + 1);

/**
 * Materializes an expression the specs are written from.
 *
 * Object and array literals, string, numeric and boolean literals, and
 * identifiers that resolve to one of the public Witness constants. Anything
 * else is `undefined`, which the caller treats as a failure rather than as an
 * absent field: a spec the gate cannot read is a spec the gate has not
 * checked.
 */
function materialize(pkg: PackageProgram, node: ts.Expression): unknown {
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  if (ts.isArrayLiteralExpression(node)) {
    const out: unknown[] = [];
    for (const element of node.elements) {
      const value = materialize(pkg, element);
      if (value === undefined) {
        return undefined;
      }
      out.push(value);
    }
    return out;
  }
  if (ts.isObjectLiteralExpression(node)) {
    const out: Record<string, unknown> = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))) {
        return undefined;
      }
      const value = materialize(pkg, property.initializer);
      if (value === undefined) {
        return undefined;
      }
      out[property.name.text] = value;
    }
    return out;
  }
  if (ts.isIdentifier(node)) {
    // A public Witness constant, matched by the symbol it resolves to rather
    // than by the spelling at the use site.
    const symbol = resolved(pkg.checker, node);
    const name = symbol?.getName();
    if (name && Object.prototype.hasOwnProperty.call(PUBLIC_CONSTANTS, name)) {
      return PUBLIC_CONSTANTS[name];
    }
    // A module-local `const X = '...'`, which is how the ids are written.
    const type = pkg.checker.getTypeAtLocation(node);
    if (type.isStringLiteral()) {
      return type.value;
    }
    if (type.isNumberLiteral()) {
      return type.value;
    }
    return undefined;
  }
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) {
    return materialize(pkg, node.expression);
  }
  return undefined;
}

/** Every production `registerInteraction(<literal>)`, materialized. */
export function derivedSpecs(pkg: PackageProgram): { specs: DerivedSpec[]; findings: Finding[] } {
  const specs: DerivedSpec[] = [];
  const findings: Finding[] = [];
  for (const f of pkg.production) {
    walk(f, (n) => {
      if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression) || n.expression.text !== 'registerInteraction') {
        return;
      }
      const file = relOf(pkg, f);
      if (file !== INTERACTIONS) {
        findings.push({ invariant: 'H', at: where(pkg, n), detail: `registerInteraction is called outside ${INTERACTIONS}; what a product can do is declared in one place` });
      }
      const argument = n.arguments[0];
      if (!argument) {
        findings.push({ invariant: 'H', at: where(pkg, n), detail: 'registerInteraction is called with no spec' });
        return;
      }
      const value = materialize(pkg, argument);
      if (value === undefined || typeof value !== 'object' || value === null || Array.isArray(value)) {
        findings.push({ invariant: 'H', at: where(pkg, n), detail: 'this registration is not a literal the release gate can read, so validateSpec cannot be applied to it; write the spec as a literal' });
        return;
      }
      const spec = value as Record<string, unknown>;
      const id = typeof spec.id === 'string' ? spec.id : '';
      if (!id) {
        findings.push({ invariant: 'H', at: where(pkg, n), detail: 'this registration has no resolvable string id' });
        return;
      }
      specs.push({ id, spec, node: n });
    });
  }
  return { specs, findings };
}

/**
 * Every string id an expression can evaluate to, or `undefined` when the
 * gate cannot say. A conditional counts as both of its branches: the live
 * tree writes `requireInteraction(pick.mode === 'refactor' ? A : B)`, and
 * both A and B are module constants.
 */
function possibleIds(pkg: PackageProgram, node: ts.Expression, depth = 0): string[] | undefined {
  if (ts.isConditionalExpression(node)) {
    const a = possibleIds(pkg, node.whenTrue, depth);
    const b = possibleIds(pkg, node.whenFalse, depth);
    return a && b ? [...a, ...b] : undefined;
  }
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
    return possibleIds(pkg, node.expression, depth);
  }
  // A first-party selector whose every return is a resolvable constant: the
  // union of what it can return. `requireInteraction(explainInteractionFor(
  // packet))` names two interactions, and both are named. This resolves one
  // level and no further, so a selector that calls another selector, or that
  // returns anything the checker cannot pin to a literal, is still
  // unresolvable and still fails closed. A computed id remains an
  // interaction nobody approved.
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && depth === 0) {
    const returns = returnedIdsOf(pkg, node.expression);
    if (returns) {
      return returns;
    }
  }
  const value = materialize(pkg, node);
  return typeof value === 'string' ? [value] : undefined;
}

/** The string ids a first-party function can return, or undefined. */
function returnedIdsOf(pkg: PackageProgram, callee: ts.Identifier): string[] | undefined {
  const symbol = resolved(pkg.checker, callee);
  const declaration = symbol?.declarations?.find(
    (d): d is ts.FunctionDeclaration => ts.isFunctionDeclaration(d) && !!d.body,
  );
  if (!declaration?.body) {
    return undefined;
  }
  const production = new Set(pkg.production.map((f) => f.fileName));
  if (!production.has(declaration.getSourceFile().fileName)) {
    return undefined;
  }
  const out: string[] = [];
  let resolvable = true;
  walk(declaration.body, (n) => {
    if (!ts.isReturnStatement(n)) {
      return;
    }
    if (!n.expression) {
      resolvable = false;
      return;
    }
    const ids = possibleIds(pkg, n.expression, 1);
    if (!ids) {
      resolvable = false;
      return;
    }
    out.push(...ids);
  });
  return resolvable && out.length > 0 ? out : undefined;
}

/**
 * Whether an id is the one carried on an attempt the person already
 * authorized, rather than a literal chosen at the call site.
 */
function isCarriedAttemptId(node: ts.Expression): boolean {
  return ts.isPropertyAccessExpression(node) && node.name.text === 'interactionId';
}

/**
 * Every id that can reach the authorized path, and where it came from.
 *
 * The carried id is only as governed as its origin. Each
 * `setPendingAttempt({ interactionId: X })` must take X from a spec the same
 * function obtained through `requireInteraction`, so nothing can be queued
 * for authorization under an id that never came through the registry.
 */
function pendingAttemptIds(pkg: PackageProgram): Finding[] {
  const out: Finding[] = [];
  for (const f of pkg.production) {
    walk(f, (n) => {
      if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression) || n.expression.text !== 'setPendingAttempt') {
        return;
      }
      const argument = n.arguments[0];
      const property =
        argument && ts.isObjectLiteralExpression(argument)
          ? argument.properties.find((p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'interactionId')
          : undefined;
      if (!property || !ts.isPropertyAssignment(property)) {
        out.push({ invariant: 'H', at: where(pkg, n), detail: 'a pending attempt is queued with no readable interaction id' });
        return;
      }
      const source = property.initializer;
      const fromRegistry =
        ts.isPropertyAccessExpression(source) &&
        source.name.text === 'id' &&
        ts.isIdentifier(source.expression) &&
        bindsRequiredSpec(pkg, source.expression);
      if (!fromRegistry) {
        out.push({
          invariant: 'H',
          at: where(pkg, n),
          detail: `a pending attempt is queued under ${source.getText()}, which does not come from requireInteraction; only a registered interaction may be authorized`,
        });
      }
    });
  }
  return out;
}

/** Whether an identifier is bound to the result of `requireInteraction(...)`. */
function bindsRequiredSpec(pkg: PackageProgram, identifier: ts.Identifier): boolean {
  const symbol = pkg.checker.getSymbolAtLocation(identifier);
  for (const declaration of symbol?.declarations ?? []) {
    if (
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer &&
      ts.isCallExpression(declaration.initializer) &&
      ts.isIdentifier(declaration.initializer.expression) &&
      declaration.initializer.expression.text === 'requireInteraction'
    ) {
      return true;
    }
  }
  return false;
}

/** Row H over one product. */
export function registryFindings(pkg: PackageProgram): Finding[] {
  const { specs, findings } = derivedSpecs(pkg);
  const out: Finding[] = [...findings];
  if (specs.length === 0) {
    out.push({ invariant: 'H', at: `${pkg.name}/${INTERACTIONS}`, detail: 'no production interaction registrations were derived; an empty registry proves nothing' });
    return out;
  }

  const seen = new Map<string, number>();
  for (const { id, spec, node } of specs) {
    seen.set(id, (seen.get(id) ?? 0) + 1);

    // The whole ten-field contract, checked by Witness's own validator.
    const verdict = validateSpec(spec as never);
    if (!verdict.ok) {
      const why = verdict.problems.map((p: { field?: string; why?: string }) => `${p.field ?? '?'}: ${p.why ?? ''}`).join('; ');
      out.push({ invariant: 'H', at: where(pkg, node), detail: `validateSpec rejects the production spec ${id}: ${why}` });
    }

    // Rule 91: roadmap namespace and runtime namespace stay apart.
    if (O_NUMBER.test(id)) {
      out.push({ invariant: 'H', at: where(pkg, node), detail: `${id} is an O-number; roadmap labels are never runtime registry keys` });
    }

    // Exactly one objective, and the shape that objective obliges.
    const objective = spec.objective;
    if (objective !== 'explain' && objective !== 'propose') {
      out.push({ invariant: 'H', at: where(pkg, node), detail: `${id} declares objective ${String(objective)}; it is one of explain or propose` });
      continue;
    }
    const allowed = (spec.allowed ?? {}) as Record<string, unknown>;
    if (objective === 'explain') {
      if (allowed.mayPropose !== false || (allowed.proposable as unknown[] | undefined)?.length !== 0) {
        out.push({ invariant: 'H', at: where(pkg, node), detail: `${id} explains but carries a proposal surface` });
      }
      if (JSON.stringify(spec.verification) !== JSON.stringify(NOTHING_TO_VERIFY)) {
        out.push({ invariant: 'H', at: where(pkg, node), detail: `${id} explains but declares source-change verification` });
      }
      if (JSON.stringify(spec.authorization) !== JSON.stringify(NO_AUTHORIZATION_NEEDED)) {
        out.push({ invariant: 'H', at: where(pkg, node), detail: `${id} explains but declares an authorization boundary` });
      }
    } else {
      if (allowed.mayPropose !== true) {
        out.push({ invariant: 'H', at: where(pkg, node), detail: `${id} proposes but mayPropose is not true` });
      }
      if (JSON.stringify(spec.authorization) !== JSON.stringify(USER_AUTHORIZES_ATTEMPT)) {
        out.push({ invariant: 'H', at: where(pkg, node), detail: `${id} proposes but does not carry the authorization boundary; the person authorizes every attempt that proposes` });
      }
      const verification = spec.verification as Record<string, unknown> | undefined;
      const measurements = verification?.measurements as unknown[] | undefined;
      if (!verification || verification.kind !== 're-measure' || !Array.isArray(measurements) || measurements.length === 0 || !verification.target) {
        out.push({ invariant: 'H', at: where(pkg, node), detail: `${id} proposes but does not name a re-measurement with at least one named measurement and a target` });
      }
    }
    if (spec.correction !== undefined && JSON.stringify(spec.correction) !== JSON.stringify(ONE_CORRECTION)) {
      out.push({ invariant: 'H', at: where(pkg, node), detail: `${id} declares a correction budget other than the one bounded correction (rules 59 and 60)` });
    }
  }

  for (const [id, count] of seen) {
    if (count > 1) {
      out.push({ invariant: 'H', at: `${pkg.name}/${INTERACTIONS}`, detail: `${id} is registered ${count} times within one product; one id resolves to one spec` });
    }
  }

  return [...out, ...wiring(pkg, specs), ...pendingAttemptIds(pkg)];
}

/**
 * The runtime wiring the literals do not cover.
 *
 * `registerInteractions()` is exported and called from `extension.ts`; every
 * id `requireInteraction` asks for is one of the registered ones; and every
 * registered spec has a production caller. The live registry has no dormant
 * concept, so a registration nobody reaches turns the gate red until somebody
 * removes it or uses it.
 */
function wiring(pkg: PackageProgram, specs: readonly DerivedSpec[]): Finding[] {
  const out: Finding[] = [];
  const interactions = pkg.production.find((f) => relOf(pkg, f) === INTERACTIONS);
  const extension = pkg.production.find((f) => relOf(pkg, f) === EXTENSION);
  if (!interactions) {
    return [{ invariant: 'H', at: `${pkg.name}/${INTERACTIONS}`, detail: 'the interactions module is missing' }];
  }
  if (!extension) {
    return [{ invariant: 'H', at: `${pkg.name}/${EXTENSION}`, detail: 'the extension entry module is missing' }];
  }

  const exported = interactions.statements.some(
    (s) =>
      ts.isFunctionDeclaration(s) &&
      s.name?.text === 'registerInteractions' &&
      !!s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
  );
  if (!exported) {
    out.push({ invariant: 'H', at: `${pkg.name}/${INTERACTIONS}`, detail: 'registerInteractions is not exported' });
  }
  let activated = false;
  walk(extension, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'registerInteractions') {
      activated = true;
    }
  });
  if (!activated) {
    out.push({ invariant: 'H', at: `${pkg.name}/${EXTENSION}`, detail: 'registerInteractions is never called at activation; an unregistered interaction cannot be required' });
  }

  // Every id asked for, and every id registered.
  const registered = new Set(specs.map((s) => s.id));
  const asked = new Set<string>();
  for (const f of pkg.production) {
    walk(f, (n) => {
      if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression) || n.expression.text !== 'requireInteraction') {
        return;
      }
      const first = n.arguments[0];
      if (!first) {
        out.push({ invariant: 'H', at: where(pkg, n), detail: 'requireInteraction is called with no id' });
        return;
      }
      // The authorized-proposal path carries the id the person already
      // authorized, on the attempt `takePendingAttempt()` just consumed. That
      // id was registered when the offer was made and redeemed once here, so
      // it is not an unnamed interaction; it is a named one, carried. Every
      // other unresolvable id still fails closed.
      // it is not an unnamed interaction; it is a named one, carried, and
      // `pendingAttemptIds` proves separately that what can be carried is
      // exactly what some literal call site already required. So this site
      // introduces no id of its own.
      if (isCarriedAttemptId(first)) {
        return;
      }
      const ids = possibleIds(pkg, first);
      if (ids === undefined) {
        out.push({ invariant: 'H', at: where(pkg, n), detail: 'an interaction id that cannot be resolved is an interaction nobody approved, so it fails closed' });
        return;
      }
      for (const id of ids) {
        asked.add(id);
        if (!registered.has(id)) {
          out.push({ invariant: 'H', at: where(pkg, n), detail: `${id} is required but never registered in this product` });
        }
      }
    });
  }
  for (const id of registered) {
    if (!asked.has(id)) {
      out.push({ invariant: 'H', at: `${pkg.name}/${INTERACTIONS}`, detail: `${id} is registered but has no production caller; the registry has no dormant concept, so remove it or use it` });
    }
  }
  return out;
}
