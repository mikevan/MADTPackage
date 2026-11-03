import * as vscode from 'vscode';
const PREFILL = 'workbench.action.chat.open';
export async function prefillChat(text: string): Promise<void> {
  await vscode.commands.executeCommand(PREFILL, { query: text });
}
