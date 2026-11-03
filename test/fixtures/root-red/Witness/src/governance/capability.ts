export function issueInteraction(spec: { id: string }, packet: { headline: string }): { value: string; attemptId: string } {
  return { value: `${spec.id}:${packet.headline.length}`, attemptId: spec.id };
}
export function redeemInteraction(value: string): { ok: boolean; why: string } {
  return value.length > 0 ? { ok: true, why: '' } : { ok: false, why: 'empty capability' };
}
