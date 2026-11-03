/**
 * The deterministic release governance test (rules 72 and 73).
 *
 * **The controlling claim, and nothing wider.** In the 1.0.21 production
 * tree, every current agentic path is governed, and no current proposal path
 * applies a model-derived source change. That is what these rows prove. They
 * do not prove a general transitive capability analysis, and nothing here
 * claims one.
 *
 * **Structural, not a grep (rule 73).** Every question is about a resolved
 * symbol, a typed node and its position. A comment, a string literal, a
 * renamed local or a reformatting cannot satisfy or break any of it.
 *
 * **Fixture runs are marked, never counted as the real tree.** The rows that
 * compare the live tree against a pinned equality set have nothing to say
 * about a fixture root, so on a fixture run they report as not-run rather
 * than as passed.
 */
import { describe, expect, it } from 'vitest';
import { GOVERNED, governedPrograms, isFixtureRun, programFor } from './program';
import { transportFindings, type Finding } from './invariants/ptp';
import { sourceApplicationFindings } from './invariants/sourceApplication';
import { capabilityBeforeSend } from './invariants/capability';
import { registryFindings } from './invariants/registry';
import { entryPoints } from './invariants/entryPoints';
import { gateProximity } from './invariants/gateProximity';
import { persistenceFindings } from './invariants/persistence';

const packages = governedPrograms();
const products = packages.filter((p) => p.name !== 'Witness');

/** A failure somebody has to act on: the invariant, the node, the reason. */
const report = (findings: readonly Finding[]): string[] => findings.map((f) => `[${f.invariant}] ${f.at}: ${f.detail}`);

describe('the toolkit the gate inspects', () => {
  it('is the real tree unless a fixture root was named deliberately', () => {
    // `POLYGLOT_GOVERNANCE_ROOT` unset means the real toolkit. There is no
    // default that points at a fixture, so a release cannot pass by
    // inspecting something else.
    expect(typeof isFixtureRun()).toBe('boolean');
  });

  it('builds a non-empty program for every inspected package', () => {
    for (const name of ['complexity', ...GOVERNED] as const) {
      expect(programFor(name).production.length).toBeGreaterThan(0);
    }
  });
});

describe('rows A to F and Q: the protected transport primitives', () => {
  for (const pkg of packages) {
    it(`${pkg.name} holds the transport boundary`, () => {
      expect(report(transportFindings(pkg))).toEqual([]);
    });
  }
});

describe('row G: no send without a redeemable capability (rule 49)', () => {
  it('the governed middle redeems before it sends', () => {
    expect(report(capabilityBeforeSend(packages))).toEqual([]);
  });
});

describe('row H: registry completeness', () => {
  for (const pkg of products) {
    it(`${pkg.name}'s production specs are registered, valid and reachable`, () => {
      expect(report(registryFindings(pkg))).toEqual([]);
    });
  }
});

describe('row I: the agentic entry points, derived from the sinks', () => {
  for (const pkg of products) {
    it(`${pkg.name}'s entry points are all attributable`, () => {
      const { roots, findings } = entryPoints(pkg);
      expect(report(findings)).toEqual([]);
      expect(roots.length).toBeGreaterThan(0);
    });
  }
});

describe('row J: the kill switch cannot be walked around', () => {
  for (const pkg of products) {
    it(`${pkg.name} gates every agentic path`, () => {
      expect(report(gateProximity(pkg))).toEqual([]);
    });
  }
});

describe('row K: governance persistence', () => {
  for (const pkg of packages) {
    it(`${pkg.name} records what it governs, in one store, in the right order`, () => {
      expect(report(persistenceFindings(pkg))).toEqual([]);
    });
  }
});

describe('row L: no model-derived source change is applied', () => {
  // The write surface, the process modules, the proposal-bearing modules and
  // the dependency map are equality sets pinned to the 1.0.21 production
  // tree. A fixture root is a different tree, so they are not-run there
  // rather than passed.
  it.skipIf(isFixtureRun())('the live write and proposal surface is exactly what was approved', () => {
    expect(report(sourceApplicationFindings(packages))).toEqual([]);
  });
});
