'use strict';

import * as vscode from 'vscode';
import { parseDocument } from './symbols';

const ZONEINFO_MODE = 'zoneinfo';

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.languages.registerDocumentSymbolProvider(
    ZONEINFO_MODE, new ZoneinfoDocumentSymbolProvider());

  context.subscriptions.push(disposable);
}

export function deactivate() {}

class ZoneinfoDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

  public provideDocumentSymbols(
    document: vscode.TextDocument, token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.SymbolInformation[]> {

    let used = new Set();
    return parseDocument(document)
      .filter(symbol => {
        let key = [symbol.type, symbol.name].join(':');
        if (used.has(key)) {
          return false;
        }
        used.add(key);
        return true;
      })
      .map(symbol => symbol.toSymbolInformation());
  }

}
