// The Witness identities this fixture's source references.
export interface GovernancePacket { readonly objective: 'explain' | 'propose'; readonly headline: string; }
export interface InteractionSpec { readonly id: string; }
export interface ModelPort { readonly id: string; send(prompt: string): Promise<string>; }
export interface GovernanceRecord { readonly attemptId: string; }
export const ONE_CORRECTION: { readonly attempts: 1 };
export const NO_AUTHORIZATION_NEEDED: { readonly kind: 'none' };
export const USER_AUTHORIZES_ATTEMPT: { readonly kind: 'user-authorizes-attempt' };
export const NOTHING_TO_VERIFY: { readonly kind: 'nothing-to-verify' };
export function registerInteraction(spec: unknown): void;
export function requireInteraction(id: string): InteractionSpec;
export function isRegistered(id: string): boolean;
export function runGovernedInteraction(spec: InteractionSpec, packet: GovernancePacket, deps: unknown): Promise<{ kind: string }>;
export function appendGovernanceRecord(dir: string, record: GovernanceRecord): void;
export function attachVerification(dir: string, attemptId: string, outcome: unknown, kind: string, interactionId: string): { kind: string };
