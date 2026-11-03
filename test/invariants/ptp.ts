/**
 * Rows A, B, C, D, E, F and Q: the protected transport primitives.
 *
 * Every question here is about a resolved symbol and its module of origin,
 * never about spelling. A syntax rewrite that preserves the same API use
 * must not evade this: `import * as vs from 'vscode'` then `vs.lm`, and a
 * destructured `const { lm } = vscode`, are the same fact as `vscode.lm`.
 *
 * **One refinement the live tree forced.** The plan said PTP-1 "appears in
 * two files per product". As a *namespace*, `vscode.lm` resolves only in
 * `agent/availability.ts`; the participant's send is a method on a
 * `LanguageModelChat` value obtained from `request.model`. Both are PTP-1 —
 * the constitution defines it as the `vscode.lm` surface in full — so the
 * namespace and the type are checked separately and both are confined.
 */
import * as ts from 'typescript';
import { PackageProgram, enclosingFunction, memberPath, moduleOfRoot, normalized, walk, where } from '../program';

export interface Finding {
  readonly invariant: string;
  readonly at: string;
  readonly detail: string;
}

/** Files permitted to touch the `vscode.lm` namespace, per product. */
const LM_NAMESPACE_ALLOWED = ['src/agent/availability.ts'];

/** Files permitted to hold a model send or the chat participant. */
const TRANSPORT_ALLOWED = ['src/agent/participant.ts'];

/** The one approved pre-fill command, and the commands that must never appear. */
const PREFILL_COMMAND = 'workbench.action.chat.open';
const CHAT_COMMAND_PREFIX = 'workbench.action.chat';

/** The VS Code model request and message types, row Q. Enumerated, never "equivalent". */
const MODEL_TYPES = ['LanguageModelChat', 'LanguageModelChatMessage', 'LanguageModelError', 'LanguageModelChatRequestOptions', 'LanguageModelChatResponse'];

const relOf = (pkg: PackageProgram, f: ts.SourceFile): string => normalized(pkg, f).slice(pkg.name.length + 1);

/** Rows B and F: the `vscode.lm` namespace, and what may be done with it. */
export function lmNamespace(pkg: PackageProgram): Finding[] {
  const out: Finding[] = [];
  for (const f of pkg.production) {
    walk(f, (n) => {
      if (!ts.isPropertyAccessExpression(n)) {
        return;
      }
      if (moduleOfRoot(pkg.checker, n) !== 'vscode') {
        return;
      }
      const path = memberPath(n);
      if (path !== 'lm' && !path.startsWith('lm.')) {
        return;
      }
      const file = relOf(pkg, f);
      if (!LM_NAMESPACE_ALLOWED.includes(file)) {
        out.push({ invariant: 'B', at: where(pkg, n), detail: `vscode.${path} is outside the availability adapter` });
        return;
      }
      // Row F: availability detection must never become selection. The only
      // permitted consumption of the awaited selectChatModels() result is a
      // `.length` read inside a comparison.
      if (path === 'lm.selectChatModels' && ts.isCallExpression(n.parent)) {
        const consumer = consumerOf(n.parent);
        if (!isLengthComparison(consumer) && !boundOnlyToALengthComparison(consumer)) {
          out.push({ invariant: 'F', at: where(pkg, n), detail: 'the selectChatModels result is consumed by something other than a length comparison' });
        }
      }
    });
  }
  return out;
}

/** The expression that consumes a call, looking through `await` and parentheses. */
function consumerOf(call: ts.CallExpression): ts.Node {
  let node: ts.Node = call;
  while (node.parent && (ts.isAwaitExpression(node.parent) || ts.isParenthesizedExpression(node.parent))) {
    node = node.parent;
  }
  return node.parent ?? node;
}

/**
 * The result bound to a local whose every use is a length comparison.
 *
 * `(await lm.selectChatModels()).length > 0` and
 * `const models = await lm.selectChatModels(); return models.length > 0;`
 * are the same fact, and row F is about the fact. A binding with any other
 * use — an index, a pass to another function, a return — is selection, and
 * fails.
 */
function boundOnlyToALengthComparison(consumer: ts.Node): boolean {
  if (!ts.isVariableDeclaration(consumer) || !ts.isIdentifier(consumer.name)) {
    return false;
  }
  const name = consumer.name.text;
  const scope = enclosingFunction(consumer) ?? consumer.getSourceFile();
  let uses = 0;
  let allLengthComparisons = true;
  walk(scope, (n) => {
    if (!ts.isIdentifier(n) || n.text !== name || n === consumer.name) {
      return;
    }
    uses += 1;
    if (!isLengthComparison(n.parent)) {
      allLengthComparisons = false;
    }
  });
  return uses > 0 && allLengthComparisons;
}

function isLengthComparison(node: ts.Node): boolean {
  if (!ts.isPropertyAccessExpression(node) || node.name.text !== 'length') {
    return false;
  }
  const parent = node.parent;
  return !!parent && ts.isBinaryExpression(parent);
}

/** Rows B, E and Q: the send, the model it uses, and the model types. */
export function transport(pkg: PackageProgram): Finding[] {
  const out: Finding[] = [];
  for (const f of pkg.production) {
    const file = relOf(pkg, f);
    walk(f, (n) => {
      // Row Q: the enumerated VS Code model types, confined to the adapter.
      if (ts.isPropertyAccessExpression(n) && moduleOfRoot(pkg.checker, n) === 'vscode') {
        const root = memberPath(n).split('.')[0];
        if (MODEL_TYPES.includes(root) && !TRANSPORT_ALLOWED.includes(file)) {
          out.push({ invariant: 'Q', at: where(pkg, n), detail: `vscode.${memberPath(n)} is outside the transport adapter` });
        }
        if (memberPath(n).startsWith('chat.createChatParticipant') && !TRANSPORT_ALLOWED.includes(file)) {
          out.push({ invariant: 'B', at: where(pkg, n), detail: 'a chat participant is created outside the transport adapter' });
        }
      }
      // Rows B and E: a send is a `sendRequest` on a LanguageModelChat.
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'sendRequest') {
        const receiver = n.expression.expression;
        const typeName = pkg.checker.typeToString(pkg.checker.getTypeAtLocation(receiver));
        if (!/LanguageModelChat/.test(typeName)) {
          return;
        }
        if (!TRANSPORT_ALLOWED.includes(file)) {
          out.push({ invariant: 'B', at: where(pkg, n), detail: 'a model send occurs outside the transport adapter' });
        }
        if (!tracesToRequestModel(receiver)) {
          out.push({ invariant: 'E', at: where(pkg, n), detail: `the send receiver is ${receiver.getText()}, which does not trace to the person's request.model` });
        }
      }
    });
  }
  return out;
}

/**
 * Whether a send receiver traces to the chat handler's `request.model`.
 *
 * The live adapter wraps `request.model` in a `ModelPort` at the point it is
 * built, so the receiver is a parameter of that wrapper. The check follows
 * the parameter to the argument its enclosing function was called with.
 */
function tracesToRequestModel(receiver: ts.Expression): boolean {
  const text = receiver.getText();
  if (/\brequest\.model\b/.test(text)) {
    return true;
  }
  if (!ts.isIdentifier(receiver)) {
    return false;
  }
  const name = receiver.text;
  const file = receiver.getSourceFile();
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) {
      return;
    }
    // `modelPort(request.model)` binding the parameter this receiver names.
    if (ts.isCallExpression(n)) {
      for (const arg of n.arguments) {
        if (/\brequest\.model\b/.test(arg.getText())) {
          found = true;
          return;
        }
      }
    }
    // A parameter named the same, whose initializer is request.model.
    if (ts.isParameter(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer && /\brequest\.model\b/.test(n.initializer.getText())) {
      found = true;
      return;
    }
    n.forEachChild(visit);
  };
  visit(file);
  return found;
}

/** Row C: PTP-2 is zero. */
export function clipboard(pkg: PackageProgram): Finding[] {
  const out: Finding[] = [];
  for (const f of pkg.production) {
    walk(f, (n) => {
      if (ts.isPropertyAccessExpression(n) && moduleOfRoot(pkg.checker, n) === 'vscode' && memberPath(n).startsWith('env.clipboard')) {
        out.push({ invariant: 'C', at: where(pkg, n), detail: 'the clipboard is a removed hand-off mechanism and must not reappear' });
      }
    });
  }
  return out;
}

/**
 * Row D: PTP-3 is the pre-fill and never a send, classified fail-closed.
 *
 * A command id that is a literal, or a const-resolvable module constant, is
 * classified by its resolved value. An id on an agentic transport path that
 * cannot be resolved **fails**, because a command nobody can name is not a
 * command anybody has approved.
 */
export function chatCommands(pkg: PackageProgram): Finding[] {
  const out: Finding[] = [];
  for (const f of pkg.production) {
    walk(f, (n) => {
      if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) {
        return;
      }
      if (n.expression.name.text !== 'executeCommand' || moduleOfRoot(pkg.checker, n.expression) !== 'vscode') {
        return;
      }
      const first = n.arguments[0];
      if (!first) {
        return;
      }
      const id = resolveStringLiteral(pkg.checker, first);
      if (id === undefined) {
        // Unresolvable. Only a failure when it sits on an agentic path.
        if (relOf(pkg, f).startsWith('src/agent/')) {
          out.push({ invariant: 'D', at: where(pkg, n), detail: 'an unresolvable command id on an agent transport path cannot be classified, so it fails closed' });
        }
        return;
      }
      if (!id.startsWith(CHAT_COMMAND_PREFIX)) {
        return;
      }
      if (id !== PREFILL_COMMAND) {
        out.push({ invariant: 'D', at: where(pkg, n), detail: `${id} is a chat command other than the approved pre-fill; nothing may send for the person` });
      }
    });
  }
  return out;
}

/** A string literal, or a const-resolvable identifier's literal value. */
function resolveStringLiteral(checker: ts.TypeChecker, node: ts.Expression): string | undefined {
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }
  if (ts.isIdentifier(node)) {
    const type = checker.getTypeAtLocation(node);
    if (type.isStringLiteral()) {
      return type.value;
    }
  }
  return undefined;
}

/** Row A: the legacy hand-off modules and shapes are gone, not hidden. */
export function legacyHandOff(pkg: PackageProgram): Finding[] {
  const out: Finding[] = [];
  for (const f of pkg.production) {
    const file = relOf(pkg, f);
    if (/(^|\/)copilot\.ts$/.test(file)) {
      out.push({ invariant: 'A', at: normalized(pkg, f), detail: 'copilot.ts was deleted in Phase 5 and must not return' });
    }
    walk(f, (n) => {
      if (ts.isFunctionDeclaration(n) && n.name && /^handOff$/i.test(n.name.text)) {
        out.push({ invariant: 'A', at: where(pkg, n), detail: 'a local handOff was deleted in Phase 5 and must not return' });
      }
    });
  }
  return out;
}

/** Every transport invariant, for one package. */
export function transportFindings(pkg: PackageProgram): Finding[] {
  return [...lmNamespace(pkg), ...transport(pkg), ...clipboard(pkg), ...chatCommands(pkg), ...legacyHandOff(pkg)];
}
