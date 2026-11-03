export interface PendingAttempt { readonly interactionId: string; readonly packet: { headline: string } }
let pending: PendingAttempt | undefined;
export function setPendingAttempt(attempt: PendingAttempt): void { pending = attempt; }
export function takePendingAttempt(): PendingAttempt | undefined {
  const held = pending;
  pending = undefined;
  return held;
}
