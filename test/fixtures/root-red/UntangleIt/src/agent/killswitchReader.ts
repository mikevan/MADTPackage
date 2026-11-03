import { AGENT_KEYS, effectiveAgentsEnabled } from './killswitch';
export function agentsEnabled(): boolean {
  return effectiveAgentsEnabled(() => true) && AGENT_KEYS.length > 0;
}
