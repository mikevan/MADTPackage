import { agentsEnabled } from './killswitchReader';
import { modelsAvailable } from './availability';
export async function mayOfferAgentic(): Promise<boolean> {
  return agentsEnabled() && (await modelsAvailable());
}
export async function agenticGateOpen(): Promise<boolean> {
  return mayOfferAgentic();
}
