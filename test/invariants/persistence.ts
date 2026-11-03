/**
 * Row K: governance persistence (Part I).
 *
 * Three facts. Every `runGovernedInteraction` call site supplies `persist`,
 * so no governed interaction runs without somewhere to record it. The
 * governance store exists once, in Witness, reached only through its
 * exported API: no product declares a second serializer, writer or fold.
 * And in every resolver the governance attachment precedes the product save,
 * because a product record that says "verified" while the governance record
 * does not is the one ordering that cannot be recovered from.
 */
import * as ts from 'typescript';
import { PackageProgram, enclosingFunction, normalized, walk, where } from '../program';
import type { Finding } from './ptp';

const WITNESS = '@projectrevivesolutions/witness';

/** The store API, which exists once and is imported, never re-declared. */
const STORE_API = ['appendGovernanceRecord', 'attachVerification', 'readGovernance', 'governancePath'];

/** How a product names its own durable save. */
const SAVE = /^save[A-Z]/;

type FunctionNode = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration;

const isFunctionNode = (n: ts.Node): n is FunctionNode =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);

export function persistenceFindings(pkg: PackageProgram): Finding[] {
  const out: Finding[] = [];

  // 1. Every governed interaction is given somewhere to be recorded.
  for (const file of pkg.production) {
    walk(file, (n) => {
      if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression) || n.expression.text !== 'runGovernedInteraction') {
        return;
      }
      const deps = n.arguments[2];
      const supplied =
        deps &&
        ts.isObjectLiteralExpression(deps) &&
        deps.properties.some((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && ts.isIdentifier(p.name) && p.name.text === 'persist');
      if (!supplied) {
        out.push({ invariant: 'K', at: where(pkg, n), detail: 'a governed interaction is run without a persist dependency; an interaction with nowhere to be recorded is not a governed interaction' });
      }
    });
  }

  // 2. One store, in Witness, reached through its exported API.
  for (const file of pkg.production) {
    const rel = normalized(pkg, file);
    walk(file, (n) => {
      if (isFunctionNode(n) && (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name && STORE_API.includes(n.name.getText()) && pkg.name !== 'Witness') {
        out.push({ invariant: 'K', at: where(pkg, n), detail: `${n.name.getText()} is declared in a product; the governance store exists once, in Witness` });
      }
      if (pkg.name === 'Witness' || !ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) {
        return;
      }
      if (!STORE_API.includes(n.expression.text)) {
        return;
      }
      const symbol = pkg.checker.getSymbolAtLocation(n.expression);
      const source = symbol?.declarations?.[0];
      const module = source ? importedFrom(source) : undefined;
      if (module !== WITNESS) {
        out.push({ invariant: 'K', at: where(pkg, n), detail: `${n.expression.text} in ${rel} does not come from ${WITNESS}; the store is reached only through Witness's exported API` });
      }
    });
  }

  return [...out, ...writeOrder(pkg)];
}

function importedFrom(declaration: ts.Declaration): string | undefined {
  let node: ts.Node | undefined = declaration;
  while (node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      return node.moduleSpecifier.text;
    }
    node = node.parent;
  }
  return undefined;
}

/**
 * The attachment precedes the product save, per resolver.
 *
 * Both live resolvers call `attachVerification` through a small helper, so
 * the check resolves one level: a function that calls `attachVerification`
 * directly is an attacher, and a call to an attacher counts as the
 * attachment in the resolver that makes it.
 */
function writeOrder(pkg: PackageProgram): Finding[] {
  const out: Finding[] = [];
  const attachers = new Set<string>();

  for (const file of pkg.production) {
    walk(file, (n) => {
      if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression) || n.expression.text !== 'attachVerification') {
        return;
      }
      const owner = enclosingFunction(n);
      if (owner) {
        attachers.add(nameOfFunction(owner as FunctionNode));
      }
    });
  }

  for (const file of pkg.production) {
    const perFunction = new Map<ts.Node, { attach?: number; save?: number }>();
    walk(file, (n) => {
      if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) {
        return;
      }
      const owner = enclosingFunction(n);
      if (!owner) {
        return;
      }
      const name = n.expression.text;
      const isAttach = name === 'attachVerification' || attachers.has(name);
      const isSave = SAVE.test(name);
      if (!isAttach && !isSave) {
        return;
      }
      const entry = perFunction.get(owner) ?? {};
      const at = n.getStart(file);
      if (isAttach && entry.attach === undefined) {
        entry.attach = at;
      }
      if (isSave && entry.save === undefined) {
        entry.save = at;
      }
      perFunction.set(owner, entry);
    });
    for (const [owner, entry] of perFunction) {
      if (entry.attach === undefined || entry.save === undefined) {
        continue;
      }
      if (entry.attach > entry.save) {
        out.push({
          invariant: 'K',
          at: where(pkg, owner),
          detail: `${nameOfFunction(owner as FunctionNode)} saves its own record before attaching the governance verification; a product record that says verified while the governance record does not is the ordering nothing recovers from`,
        });
      }
    }
  }
  return out;
}

function nameOfFunction(node: FunctionNode): string {
  if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) && node.name) {
    return node.name.getText();
  }
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return '(anonymous)';
}
