import * as vscode from 'vscode';
import { appendGovernanceRecord } from '@projectrevivesolutions/witness';
import { registerInteractions, PROPOSE } from './agent/interactions';
import { registerParticipant } from './agent/participant';
import { mayOfferAgentic, agenticGateOpen } from './agent/mayOffer';
import { prefillChat } from './agent/prefill';
import { setPendingAttempt } from './agent/attempt';
import { requireInteraction } from '@projectrevivesolutions/witness';

let current: { headline: string } | undefined;

export function activate(context: { subscriptions: vscode.Disposable[] }): void {
  registerInteractions();
  const explainFailure = async (): Promise<void> => {
    if (!(await mayOfferAgentic())) {
      return;
    }
    current = { headline: 'A run stopped before the tests started.' };
    await prefillChat('@deeptest explain this');
  };
  const propose = async (): Promise<void> => {
    if (!(await agenticGateOpen())) {
      return;
    }
    const spec = requireInteraction(PROPOSE);
    setPendingAttempt({ interactionId: spec.id, packet: { headline: 'A measured shortfall.' } });
  };
  context.subscriptions.push(
    vscode.commands.executeCommand ? registerParticipant({ currentProblem: () => current, persist: (record) => appendGovernanceRecord('.polyglot', record as never) }) : registerParticipant({ currentProblem: () => current, persist: () => undefined }),
  );
  context.subscriptions.push(registerCommand('deeptest.explain', explainFailure), registerCommand('deeptest.propose', propose));
}

function registerCommand(id: string, handler: () => Promise<void>): vscode.Disposable {
  return { dispose: () => undefined, id, handler } as unknown as vscode.Disposable;
}
