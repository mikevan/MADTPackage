export const DEEPTEST_AGENTS_KEY = 'deeptest.polyglot.agents.enabled';
export const UNTANGLEIT_AGENTS_KEY = 'untangleit.polyglot.agents.enabled';
export const AGENT_KEYS = [DEEPTEST_AGENTS_KEY, UNTANGLEIT_AGENTS_KEY] as const;
export type SettingReader = (key: string) => boolean | undefined;
export function effectiveAgentsEnabled(read: SettingReader): boolean {
  return AGENT_KEYS.every((key) => read(key) !== false);
}
