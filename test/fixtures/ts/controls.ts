/**
 * The violating fixtures, one per invariant, and the false-positive controls.
 *
 * **A control that only ever fires correctly is worth as much as one that
 * only ever passes.** The false-positive fixtures are not padding: this plan
 * misclassified `RegExp.exec` as process execution and
 * `vscode.workspace.fs.writeFile` as `node:fs`, both because a name looked
 * like something it was not. The gate must prove it does not repeat either.
 *
 * Every fixture is source text, compiled in isolation by the harness. No
 * production file is mutated, ever, not even temporarily.
 */

/** Row B: a model send outside the transport adapter. */
export const SEND_OUTSIDE_ADAPTER = `
import * as vscode from 'vscode';
export async function rogue(model: vscode.LanguageModelChat) {
  return model.sendRequest([vscode.LanguageModelChatMessage.User('hello')]);
}
`;

/** Row B, alias form: the same API through a renamed namespace import. */
export const LM_ALIAS_BYPASS = `
import * as vs from 'vscode';
export async function anyModels() {
  const models = await vs.lm.selectChatModels();
  return models[0];
}
`;

/** Row F: availability detection turned into selection. */
export const SELECT_THEN_SEND = `
import * as vscode from 'vscode';
export async function pick() {
  const models = await vscode.lm.selectChatModels();
  return models[0].sendRequest([]);
}
`;

/** Row C: the clipboard hand-off returning. */
export const CLIPBOARD_HANDOFF = `
import * as vscode from 'vscode';
export async function handOffBrief(brief: string) {
  await vscode.env.clipboard.writeText(brief);
}
`;

/** Row D: a chat command that sends for the person. */
export const AUTO_SEND = `
import * as vscode from 'vscode';
export async function ask() {
  await vscode.commands.executeCommand('workbench.action.chat.submit');
}
`;

/** Row D: an unresolvable command id on an agent path. */
export const UNRESOLVABLE_COMMAND = `
import * as vscode from 'vscode';
export async function ask(which: string) {
  await vscode.commands.executeCommand(which);
}
`;

/** Row Q: a model type constructed outside the adapter. */
export const MODEL_TYPE_OUTSIDE = `
import * as vscode from 'vscode';
export function build(text: string) {
  return vscode.LanguageModelChatMessage.User(text);
}
`;

/** Row A: the deleted local hand-off returning. */
export const LOCAL_HANDOFF = `
export function handOff(brief: string): string {
  return brief;
}
`;

// ---------------------------------------------------------------------------
// Source application, row L
// ---------------------------------------------------------------------------

/** D-1: an editor apply primitive anywhere in production. */
export const EDITOR_APPLY = `
import * as vscode from 'vscode';
export async function apply(uri: unknown, range: unknown, text: string) {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, range, text);
  return vscode.workspace.applyEdit(edit);
}
`;

/** D-2: a node:fs write in a module outside the equality set. */
export const NEW_NODE_WRITER_SYNC = `
import * as fs from 'node:fs';
export function save(p: string, body: string) {
  fs.writeFileSync(p, body, 'utf8');
}
`;

/** D-2: the asynchronous node:fs writeFile, the form a *Sync list misses. */
export const NEW_NODE_WRITER_ASYNC = `
import * as fs from 'node:fs';
export function save(p: string, body: string) {
  fs.writeFile(p, body, () => undefined);
}
`;

/** D-2, second family: a VS Code workspace filesystem write. */
export const VSCODE_FS_WRITE = `
import * as vscode from 'vscode';
export async function save(uri: unknown, body: Uint8Array) {
  await vscode.workspace.fs.writeFile(uri, body);
}
`;

/** D.3: an `open` whose mode cannot be resolved, which must fail closed. */
export const COMPUTED_OPEN_MODE = `
import * as fs from 'node:fs';
export function touch(p: string, mode: string) {
  return fs.openSync(p, mode);
}
`;

// ---------------------------------------------------------------------------
// False-positive controls. These must NOT fail.
// ---------------------------------------------------------------------------

/** `RegExp.exec` is not process execution. This plan got that wrong once. */
export const REGEXP_EXEC = `
export function parse(line: string) {
  const m = /(\\w+)=(\\d+)/g;
  let hit: RegExpExecArray | null;
  const out: string[] = [];
  while ((hit = m.exec(line)) !== null) { out.push(hit[1]); }
  return out;
}
`;

/** A property named `writeFile` on an unrelated object is not `node:fs`. */
export const UNRELATED_WRITEFILE = `
interface Reporter { writeFile(path: string, body: string): void }
export function report(r: Reporter, p: string, body: string) {
  r.writeFile(p, body);
}
`;

/** A property named `lm` on an unrelated object is not `vscode.lm`. */
export const UNRELATED_LM = `
interface Settings { lm: { selectChatModels(): string[] } }
export function names(s: Settings) {
  return s.lm.selectChatModels().length > 0;
}
`;
