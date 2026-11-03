// Minimal `vscode` surface for the classifier controls. Self-contained on
// purpose: a fixture that needed five prepared node_modules trees would fail
// for reasons unrelated to what it is testing.
declare module 'vscode' {
  export interface LanguageModelChat { sendRequest(messages: unknown[]): Promise<{ text: AsyncIterable<string> }>; id: string; }
  export class LanguageModelChatMessage { static User(s: string): LanguageModelChatMessage; }
  export class LanguageModelError extends Error { code: string; }
  export interface Disposable { dispose(): void; }
  export const lm: { selectChatModels(): Promise<LanguageModelChat[]>; onDidChangeChatModels(l: () => void): Disposable };
  export const chat: { createChatParticipant(id: string, handler: (r: { model: LanguageModelChat }) => unknown): Disposable };
  export const commands: { executeCommand(command: string, ...rest: unknown[]): Promise<unknown> };
  export const env: { clipboard: { writeText(v: string): Promise<void> } };
  export const window: { showInformationMessage(m: string): Promise<string | undefined>; activeTextEditor: unknown };
  export const workspace: {
    fs: { writeFile(uri: unknown, content: Uint8Array): Promise<void>; delete(uri: unknown): Promise<void> };
    applyEdit(edit: WorkspaceEdit): Promise<boolean>;
    workspaceFolders: unknown[] | undefined;
  };
  export class WorkspaceEdit { replace(uri: unknown, range: unknown, text: string): void; }
  export class Uri { static file(p: string): Uri; }
}
