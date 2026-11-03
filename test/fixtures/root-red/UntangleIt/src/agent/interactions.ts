import { NOTHING_TO_VERIFY, NO_AUTHORIZATION_NEEDED, ONE_CORRECTION, USER_AUTHORIZES_ATTEMPT, isRegistered, registerInteraction } from '@projectrevivesolutions/witness';

export const FAILURE_EXPLAIN = 'failure.explain';
export const PROPOSE = 'untangleit.propose';

export function registerInteractions(): void {
  if (isRegistered(FAILURE_EXPLAIN)) {
    return;
  }
  registerInteraction({
    id: FAILURE_EXPLAIN,
    tool: 'UntangleIt',
    title: 'Explain a run that failed before the tests started.',
    objective: 'explain',
    allowed: { readable: [], proposable: [], mayPropose: false },
    constraints: ['C4'],
    validators: ['V-forbidden-paths'],
    correction: ONE_CORRECTION,
    authorization: NO_AUTHORIZATION_NEEDED,
    verification: NOTHING_TO_VERIFY,
  });
  registerInteraction({
    id: PROPOSE,
    tool: 'UntangleIt',
    title: 'Propose one change for a measured shortfall.',
    objective: 'propose',
    allowed: { readable: ['src/**'], proposable: ['**/*.test.*'], mayPropose: true },
    constraints: ['C1', 'C3', 'C4', 'C8'],
    validators: ['V-existing-tests', 'V-scope-paths', 'V-forbidden-paths', 'V-refusal-wellformed', 'V-response-shape'],
    correction: ONE_CORRECTION,
    authorization: USER_AUTHORIZES_ATTEMPT,
    verification: {
      kind: 're-measure',
      measurements: ['coverage-density'],
      target: { kind: 'lines', path: '', lines: [] },
    },
  });
}
