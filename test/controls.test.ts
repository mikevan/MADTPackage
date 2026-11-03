/**
 * The negative controls (Part L).
 *
 * **A control that only ever passes is worth as much as one that only ever
 * fires.** Both directions are here: eight fixtures that must turn the gate
 * red, and three that must not, each of the three a mistake this plan
 * actually made — `RegExp.exec` read as process execution, a property named
 * `writeFile` on an unrelated object read as `node:fs`, a property named
 * `lm` read as `vscode.lm`.
 *
 * **No production file is mutated, ever, not even temporarily.** Each
 * fixture is source text compiled in isolation.
 */
import { describe, expect, it } from 'vitest';
import { fixtureProgram } from './fixtures/harness';
import * as control from './fixtures/ts/controls';
import { transportFindings, type Finding } from './invariants/ptp';
import { writeSurface } from './invariants/sourceApplication';

const ids = (findings: readonly Finding[]): string[] => findings.map((f) => f.invariant);

/** The transport rows over one fixture, compiled as a production file. */
function transportOf(name: string, source: string, at = 'agent/rogue.ts'): Finding[] {
  return transportFindings(fixtureProgram(at, source, name));
}

/**
 * The write-surface rows about one fixture file.
 *
 * Filtered to the fixture's own path on purpose. Row L's equality set is
 * pinned to the 1.0.21 tree, so a one-file program is missing all of it, and
 * a control that accepted those findings would pass whatever the fixture
 * said. Each control must fail for its own reason.
 */
function writesOf(source: string, at = 'ui/rogue.ts'): Finding[] {
  return writeSurface([fixtureProgram(at, source, 'DeepTest')]).filter((f) => f.at.includes(at));
}

describe('must fail: the transport boundary', () => {
  it('a model send outside the adapter', () => {
    expect(ids(transportOf('DeepTest', control.SEND_OUTSIDE_ADAPTER))).toContain('B');
  });

  it('the same API through a renamed namespace import', () => {
    // Spelling changed, symbol identical. This is the whole reason the gate
    // resolves rather than matches.
    expect(ids(transportOf('DeepTest', control.LM_ALIAS_BYPASS))).toContain('B');
  });

  it('availability detection turned into selection', () => {
    expect(ids(transportOf('DeepTest', control.SELECT_THEN_SEND, 'agent/availability.ts'))).toContain('F');
  });

  it('the deleted clipboard hand-off returning', () => {
    expect(ids(transportOf('DeepTest', control.CLIPBOARD_HANDOFF))).toContain('C');
  });

  it('a chat command that sends for the person', () => {
    expect(ids(transportOf('DeepTest', control.AUTO_SEND))).toContain('D');
  });

  it('an unresolvable command id on an agent path fails closed', () => {
    expect(ids(transportOf('DeepTest', control.UNRESOLVABLE_COMMAND))).toContain('D');
  });

  it('a model type constructed outside the adapter', () => {
    expect(ids(transportOf('DeepTest', control.MODEL_TYPE_OUTSIDE))).toContain('Q');
  });

  it('the deleted local hand-off returning', () => {
    expect(ids(transportOf('DeepTest', control.LOCAL_HANDOFF))).toContain('A');
  });
});

describe('must fail: source application', () => {
  it('an editor apply primitive anywhere in production', () => {
    expect(ids(writesOf(control.EDITOR_APPLY))).toContain('D-1');
  });

  it('a new synchronous node:fs writer outside the equality set', () => {
    expect(ids(writesOf(control.NEW_NODE_WRITER_SYNC))).toContain('D-2');
  });

  it('the asynchronous node:fs writeFile a *Sync-shaped list misses', () => {
    // The plan's own miss. The list is by resolved member, not by suffix.
    expect(ids(writesOf(control.NEW_NODE_WRITER_ASYNC))).toContain('D-2');
  });

  it('the second family: a VS Code workspace filesystem write', () => {
    // `vscode.workspace.fs.writeFile` is not `node:fs`, and counting it as
    // one was the plan's third miss. It is its own family, and it fails here
    // for its own reason.
    expect(ids(writesOf(control.VSCODE_FS_WRITE))).toContain('D-2');
  });

  it('an open whose mode cannot be resolved fails closed', () => {
    expect(ids(writesOf(control.COMPUTED_OPEN_MODE))).toContain('D-2');
  });
});

describe('must not fail: the three misclassifications this plan made', () => {
  it('RegExp.exec is not process execution', () => {
    expect(writesOf(control.REGEXP_EXEC)).toEqual([]);
  });

  it('a property named writeFile on an unrelated object is not node:fs', () => {
    expect(writesOf(control.UNRELATED_WRITEFILE)).toEqual([]);
  });

  it('a property named lm on an unrelated object is not vscode.lm', () => {
    expect(transportOf('DeepTest', control.UNRELATED_LM, 'agent/settings.ts')).toEqual([]);
  });
});
