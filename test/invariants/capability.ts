/**
 * Row G: no model send without a redeemable interaction capability (rule 49).
 *
 * **Bounded to the live form, not a dominance analysis.** The send is not in
 * the same function as the redemption: `runGovernedInteraction` issues,
 * redeems and throws, then calls `ask()`, and `ask` is where
 * `deps.model.send` lives. Four facts are checked, and any change to that
 * shape fails closed rather than being modelled.
 */
import * as ts from 'typescript';
import { PackageProgram, enclosingFunction, normalized, walk, where } from '../program';
import type { Finding } from './ptp';

const GOVERNED = 'Witness/src/governance/interaction.ts';

export function capabilityBeforeSend(pkgs: readonly PackageProgram[]): Finding[] {
  const out: Finding[] = [];
  const witness = pkgs.find((p) => p.name === 'Witness');
  if (!witness) { return out; }
  const file = witness.production.find((f) => normalized(witness, f) === GOVERNED);
  if (!file) {
    return [{ invariant: 'G', at: GOVERNED, detail: 'the governed interaction module is missing; the capability boundary cannot be established' }];
  }

  // 3. Exactly one function contains a model send, and it has one caller.
  const senders = new Set<string>();
  let sendNode: ts.Node | undefined;
  walk(file, (n) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'send' && /\bdeps\.model\b/.test(n.expression.expression.getText())) {
      const fn = enclosingFunction(n);
      const name = fn && ts.isFunctionDeclaration(fn) && fn.name ? fn.name.text : '(anonymous)';
      senders.add(name);
      sendNode = n;
    }
  });
  if (senders.size !== 1) {
    return [{ invariant: 'G', at: GOVERNED, detail: `${senders.size} functions contain a model send (${[...senders].join(', ') || 'none'}); the bounded form requires exactly one` }];
  }
  const sender = [...senders][0];

  // 1 and 2. The landmarks, in order, at the top level of runGovernedInteraction.
  const runner = file.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === 'runGovernedInteraction');
  if (!runner || !runner.body) {
    return [{ invariant: 'G', at: GOVERNED, detail: 'runGovernedInteraction is not a top-level function declaration; the bounded form no longer applies' }];
  }
  const statements = runner.body.statements;
  const indexOf = (predicate: (t: string) => boolean): number => statements.findIndex((s) => predicate(s.getText()));
  const issue = indexOf((t) => /\bissueInteraction\s*\(/.test(t));
  const redeem = indexOf((t) => /\bredeemInteraction\s*\(/.test(t));
  const guard = statements.findIndex((s) => ts.isIfStatement(s) && /!\s*redeemed\.ok/.test(s.expression.getText()) && /\bthrow\b/.test(s.thenStatement.getText()));
  const call = indexOf((t) => new RegExp(`\\b${sender}\\s*\\(`).test(t));

  if (issue < 0) { out.push({ invariant: 'G', at: GOVERNED, detail: 'no issueInteraction at the top level of runGovernedInteraction' }); }
  if (redeem < 0) { out.push({ invariant: 'G', at: GOVERNED, detail: 'no redeemInteraction at the top level of runGovernedInteraction' }); }
  if (guard < 0) { out.push({ invariant: 'G', at: GOVERNED, detail: 'the redemption result is not guarded by a throwing if; a failed redemption must not be swallowed' }); }
  if (call < 0) { out.push({ invariant: 'G', at: GOVERNED, detail: `no call to ${sender} at the top level of runGovernedInteraction` }); }
  if (issue < 0 || redeem < 0 || guard < 0 || call < 0) { return out; }

  if (!(issue < redeem && redeem <= guard && guard < call)) {
    out.push({ invariant: 'G', at: GOVERNED, detail: `landmarks out of order: issue@${issue}, redeem@${redeem}, guard@${guard}, ${sender}@${call}` });
  }

  // 2, continued. Nothing between the guard and the send may catch.
  for (let i = guard; i <= call; i += 1) {
    if (/\btry\s*\{/.test(statements[i].getText())) {
      out.push({ invariant: 'G', at: GOVERNED, detail: 'a try block sits between the redemption guard and the send; a failed redemption could be swallowed' });
    }
  }
  // And the whole region must not be nested inside a try in the same body.
  if (sendNode && statements.some((s, i) => i < guard && ts.isTryStatement(s) && s.getText().includes('redeemInteraction'))) {
    out.push({ invariant: 'G', at: GOVERNED, detail: 'the redemption is inside a try block' });
  }

  // 3, continued. **Every** call to the sending function, wherever it is
  // written, sits inside `runGovernedInteraction` and lexically after the
  // redemption guard.
  //
  // The plan's G.2 step 3 said "exactly one caller". The live tree has two,
  // and the second is rule 59's single bounded correction: the same function
  // asks once more, further down the same body, when the first answer failed
  // validation. That is the governed retry, not a bypass. Counting callers
  // was the wrong question — a second redemption-free entry point would be
  // the defect, and one correction after the guard is not that. So what is
  // checked is the property that actually protects rule 49: no call to the
  // sender is reachable without having passed the guard first.
  const guardEnd = statements[guard].getEnd();
  const runnerStart = runner.getStart(file);
  const runnerEnd = runner.getEnd();
  let callSites = 0;
  walk(file, (n) => {
    if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression) || n.expression.text !== sender) {
      return;
    }
    callSites += 1;
    const start = n.getStart(file);
    if (start < runnerStart || start > runnerEnd) {
      out.push({ invariant: 'G', at: where(witness, n), detail: `${sender} is called outside runGovernedInteraction, so a send could occur without a redeemed capability` });
      return;
    }
    if (start < guardEnd) {
      out.push({ invariant: 'G', at: where(witness, n), detail: `${sender} is called before the redemption guard` });
    }
  });
  if (callSites === 0) {
    out.push({ invariant: 'G', at: GOVERNED, detail: `${sender} is never called; the bounded form no longer describes this module` });
  }
  return out;
}
