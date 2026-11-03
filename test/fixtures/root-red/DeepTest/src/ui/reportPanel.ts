/**
 * **The one planted violation in this fixture root.**
 *
 * A `sendRequest` on a `LanguageModelChat` outside the transport adapter.
 * It is the least ambiguous violation available: row B fails, the gate
 * exits nonzero, and `release.ps1` stops before Phase 0. Nothing else in
 * this root is intended to fail, so a second finding means the fixture
 * drifted and somebody has to look.
 */
import * as vscode from 'vscode';

export async function explainFromThePanel(model: vscode.LanguageModelChat, question: string): Promise<string> {
  const response = await model.sendRequest([vscode.LanguageModelChatMessage.User(question)]);
  let whole = '';
  for await (const part of response.text) {
    whole += part;
  }
  return whole;
}
