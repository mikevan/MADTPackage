import * as vscode from 'vscode';
export async function modelsAvailable(): Promise<boolean> {
  const models = await vscode.lm.selectChatModels();
  return models.length > 0;
}
