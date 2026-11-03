/**
 * Row I: the agentic entry points, derived backwards from the sinks.
 *
 * **Derived, never listed.** "The nine we know today" is an observation, not
 * a derivation, and a hand-kept inventory compared against a derived one
 * proves only that somebody kept the inventory current. This seeds from the
 * transport and authorization sinks, walks callers through the package's own
 * call graph resolved by symbol, and calls the functions nothing else calls
 * the entry points, whatever shape they are written in.
 *
 * **Unclassifiable fails closed.** A root the analysis cannot attribute to a
 * recognized initiation form is reported and the gate goes red. It is not
 * dropped and it is not assumed safe.
 */
import * as ts from 'typescript';
import { PackageProgram, enclosingFunction, normalized, resolved, walk, where } from '../program';
import type { Finding } from './ptp';

/** What an agentic path ends in. Reaching any of these makes a path agentic. */
const SINKS = ['prefillChat', 'runGovernedInteraction', 'setPendingAttempt', 'askToAuthorize', 'issueInteraction'];

/** The initiation forms a root may take, and the call that establishes each. */
const INITIATION: ReadonlyArray<readonly [form: string, callee: RegExp]> = [
  ['command', /(^|\.)registerCommand$|(^|\.)registerTextEditorCommand$/],
  ['participant', /(^|\.)createChatParticipant$/],
  [
    'ui-dispatch',
    /^(SidebarView|ConfigPanel|ReportPanel)(\.show)?$|(^|\.)registerWebviewViewProvider$|(^|\.)onDidReceiveMessage$|(^|\.)createTreeView$/,
  ],
];

export type FunctionNode = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration;

export interface EntryPoint {
  readonly key: string;
  readonly node: FunctionNode;
  readonly name: string;
  readonly form: string;
}

const isFunctionNode = (n: ts.Node): n is FunctionNode =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);

/** A stable identity for one function: where it is written. */
function keyOf(pkg: PackageProgram, node: ts.Node): string {
  return where(pkg, node);
}

/** The name a function is known by, for a message somebody has to act on. */
export function nameOf(node: FunctionNode): string {
  if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) && node.name) {
    return node.name.getText();
  }
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (parent && ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return '(anonymous)';
}

interface Graph {
  readonly functions: Map<string, FunctionNode>;
  /** callee key -> caller keys. */
  readonly callers: Map<string, Set<string>>;
  /** function key -> true when its own body calls a sink. */
  readonly sinks: Set<string>;
}

/**
 * The package's own call graph, callees resolved through the checker.
 *
 * A call whose callee resolves outside this package's production source is
 * not an edge: the graph is first-party by construction, which is what makes
 * "nothing calls this" mean "this is where a person starts".
 */
function graphOf(pkg: PackageProgram): Graph {
  const functions = new Map<string, FunctionNode>();
  const callers = new Map<string, Set<string>>();
  const sinks = new Set<string>();
  const production = new Set(pkg.production.map((f) => f.fileName));

  for (const file of pkg.production) {
    walk(file, (n) => {
      if (isFunctionNode(n)) {
        functions.set(keyOf(pkg, n), n);
      }
      if (!ts.isCallExpression(n)) {
        return;
      }
      const owner = enclosingFunction(n);
      const ownerKey = owner ? keyOf(pkg, owner) : `${normalized(pkg, file)}:module`;

      // An immediately invoked function expression is called by the function
      // it is written in. `void (async () => { ... })()` is how both products
      // run the asynchronous part of a synchronous handler, and treating it
      // as uncalled would invent an entry point nobody can reach.
      const invoked = immediatelyInvoked(n);
      if (invoked) {
        const set = callers.get(keyOf(pkg, invoked)) ?? new Set<string>();
        set.add(ownerKey);
        callers.set(keyOf(pkg, invoked), set);
      }

      const callee = ts.isPropertyAccessExpression(n.expression) ? n.expression.name : n.expression;
      if (!ts.isIdentifier(callee)) {
        return;
      }
      if (SINKS.includes(callee.text)) {
        sinks.add(ownerKey);
      }
      // A function literal written inside another function, and handed to
      // something that is not a recognized initiation form, is a callback
      // that function creates: `report: (p) => reportProblem(deps, p)`. It is
      // reached because its enclosing function passed it, so the gate that
      // covers the enclosing function covers it. A literal that IS an
      // initiation form keeps no such edge, which is what leaves the
      // participant handler and the command handlers as roots.
      for (const argument of (n.arguments ?? []) as readonly ts.Expression[]) {
        for (const literal of functionLiteralsIn(argument)) {
          if (formOfCall(n)) {
            continue;
          }
          const host = enclosingFunction(literal);
          if (!host) {
            continue;
          }
          const literalKey = keyOf(pkg, literal);
          const set = callers.get(literalKey) ?? new Set<string>();
          set.add(keyOf(pkg, host));
          callers.set(literalKey, set);
        }
      }

      // A first-party edge, if the callee is a function declared here. The
      // symbol is resolved through its import alias, so a function called
      // across modules is the same function.
      const symbol = resolved(pkg.checker, callee);
      for (const declaration of symbol?.declarations ?? []) {
        const target = isFunctionNode(declaration)
          ? declaration
          : ts.isVariableDeclaration(declaration) && declaration.initializer && isFunctionNode(declaration.initializer)
            ? declaration.initializer
            : undefined;
        if (!target || !production.has(target.getSourceFile().fileName)) {
          continue;
        }
        const targetKey = keyOf(pkg, target);
        const set = callers.get(targetKey) ?? new Set<string>();
        set.add(ownerKey);
        callers.set(targetKey, set);
      }
    });
  }
  return { functions, callers, sinks };
}

/** The function literals written directly in an argument, one level of object literal deep. */
function functionLiteralsIn(argument: ts.Expression): FunctionNode[] {
  if (isFunctionNode(argument)) {
    return [argument];
  }
  if (ts.isObjectLiteralExpression(argument)) {
    const out: FunctionNode[] = [];
    for (const property of argument.properties) {
      if (ts.isPropertyAssignment(property) && isFunctionNode(property.initializer)) {
        out.push(property.initializer);
      }
      if (ts.isMethodDeclaration(property)) {
        out.push(property);
      }
    }
    return out;
  }
  return [];
}

/** The function literal an expression immediately invokes, if it is one. */
function immediatelyInvoked(call: ts.CallExpression): FunctionNode | undefined {
  let target: ts.Expression = call.expression;
  while (ts.isParenthesizedExpression(target)) {
    target = target.expression;
  }
  return isFunctionNode(target) ? target : undefined;
}

/** Every function from which a sink is transitively reachable. */
function agenticClosure(graph: Graph): Set<string> {
  const reached = new Set<string>(graph.sinks);
  const queue = [...graph.sinks];
  while (queue.length > 0) {
    const key = queue.shift() as string;
    for (const caller of graph.callers.get(key) ?? []) {
      if (!reached.has(caller)) {
        reached.add(caller);
        queue.push(caller);
      }
    }
  }
  return reached;
}

/** The initiation form of a root, or undefined when it cannot be attributed. */
function initiationForm(pkg: PackageProgram, node: FunctionNode): string | undefined {
  // Written inline as an argument: the call it is an argument to decides.
  const inline = enclosingCallOf(node);
  const byInline = inline && formOfCall(inline);
  if (byInline) {
    return byInline;
  }
  // Named: the form comes from where its identifier is passed or, for the
  // activation hook, from the name the host itself calls.
  const name = nameOf(node);
  if (name === 'activate' || name === 'deactivate') {
    return 'activation';
  }
  let form: string | undefined;
  for (const file of pkg.production) {
    walk(file, (n) => {
      if (form || !ts.isIdentifier(n) || n.text !== name || n === (node as ts.Node)) {
        return;
      }
      const call = n.parent && ts.isCallExpression(n.parent) && n.parent.arguments.includes(n as ts.Expression) ? n.parent : undefined;
      const asNew = n.parent && ts.isNewExpression(n.parent) ? n.parent : undefined;
      const owner = call ?? asNew;
      if (owner) {
        form = formOfCall(owner);
      }
    });
  }
  return form;
}

/** The call expression a function literal is written as an argument to. */
function enclosingCallOf(node: FunctionNode): ts.CallExpression | ts.NewExpression | undefined {
  const parent = node.parent;
  if (parent && (ts.isCallExpression(parent) || ts.isNewExpression(parent)) && ((parent.arguments ?? []) as readonly ts.Expression[]).includes(node as ts.Expression)) {
    return parent;
  }
  return undefined;
}

function formOfCall(call: ts.CallExpression | ts.NewExpression): string | undefined {
  // The whole callee text, not just the last name: `ReportPanel.show` is a
  // UI dispatch and a bare `show` is nothing in particular.
  const name = call.expression.getText().trim();
  for (const [form, pattern] of INITIATION) {
    if (pattern.test(name)) {
      return form;
    }
  }
  return undefined;
}

/**
 * The derived agentic entry points of one package, and any root the gate
 * could not attribute to a recognized initiation form.
 */
export function entryPoints(pkg: PackageProgram): { roots: EntryPoint[]; findings: Finding[] } {
  const graph = graphOf(pkg);
  const closure = agenticClosure(graph);
  const roots: EntryPoint[] = [];
  const findings: Finding[] = [];

  for (const key of closure) {
    const node = graph.functions.get(key);
    if (!node) {
      // Module-level agentic code has no enclosing function to gate.
      findings.push({ invariant: 'I', at: key, detail: 'an agentic sink is reached from module top level, where no gate can precede it' });
      continue;
    }
    if ((graph.callers.get(key) ?? new Set()).size > 0) {
      continue;
    }
    const form = initiationForm(pkg, node);
    if (!form) {
      findings.push({
        invariant: 'I',
        at: key,
        detail: `${nameOf(node)} reaches an agentic sink and nothing in this product calls it, but its initiation form is not one the gate recognizes; an unclassified entry point fails closed`,
      });
      continue;
    }
    roots.push({ key, node, name: nameOf(node), form });
  }
  if (roots.length === 0) {
    findings.push({ invariant: 'I', at: pkg.name, detail: 'no agentic entry points were derived; an empty derivation proves nothing' });
  }
  return { roots, findings };
}
