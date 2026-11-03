import * as vscode from 'vscode';
import { ModelPort, requireInteraction, runGovernedInteraction } from '@projectrevivesolutions/witness';
import { agentsEnabled } from './killswitchReader';
import { takePendingAttempt } from './attempt';
import { FAILURE_EXPLAIN } from './interactions';

export function registerParticipant(deps: { currentProblem(): { headline: string } | undefined; persist(record: unknown): void }): vscode.Disposable {
  return vscode.chat.createChatParticipant('prs.deeptest.governed', async (request: { model: vscode.LanguageModelChat }) => {
    if (!agentsEnabled()) {
      return {};
    }
    const authorized = takePendingAttempt();
    if (authorized) {
      const spec = requireInteraction(authorized.interactionId);
      return runGovernedInteraction(spec, authorized.packet, { model: modelPort(request.model), persist: (record: unknown) => deps.persist(record) });
    }
    const packet = deps.currentProblem();
    if (!packet) {
      return {};
    }
    const spec = requireInteraction(FAILURE_EXPLAIN);
    return runGovernedInteraction(spec, packet, { model: modelPort(request.model), persist: (record: unknown) => deps.persist(record) });
  });
}

function modelPort(model: vscode.LanguageModelChat): ModelPort {
  return {
    id: model.id,
    async send(prompt: string): Promise<string> {
      const response = await model.sendRequest([vscode.LanguageModelChatMessage.User(prompt)]);
      let whole = '';
      for await (const part of response.text) {
        whole += part;
      }
      return whole;
    },
  };
}
