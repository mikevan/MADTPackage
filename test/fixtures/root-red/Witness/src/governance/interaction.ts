/** The governed middle, in the bounded form row G recognizes. */
import { issueInteraction, redeemInteraction } from './capability';

export interface Deps { readonly model: { send(prompt: string): Promise<string> } }

export async function runGovernedInteraction(spec: { id: string }, packet: { headline: string }, deps: Deps): Promise<{ kind: string }> {
  const capability = issueInteraction(spec, packet);
  const redeemed = redeemInteraction(capability.value);
  if (!redeemed.ok) {
    throw new Error(`The interaction capability could not be redeemed: ${redeemed.why}`);
  }
  const attempt = await ask(packet.headline, deps);
  return { kind: attempt.length > 0 ? 'answered' : 'empty' };
}

async function ask(promptText: string, deps: Deps): Promise<string> {
  return deps.model.send(promptText);
}
