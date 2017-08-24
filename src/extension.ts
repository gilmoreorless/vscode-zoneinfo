'use strict';

import * as vscode from 'vscode';
import { ZoneSymbol, parseDocument } from './symbols';
import * as symbolCache from './symbol-cache';

const ZONEINFO_MODE = 'zoneinfo';

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.languages.registerDocumentSymbolProvider(
    ZONEINFO_MODE, new ZoneinfoDocumentSymbolProvider());

  context.subscriptions.push(disposable);
  console.log('--activate--');
}

export function deactivate() {
  console.log('--deactivate--');
  symbolCache.clear();
}

class ZoneinfoDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

  public uniqueSymbols(symbols: ZoneSymbol[]): vscode.ProviderResult<vscode.SymbolInformation[]> {
    let used = new Set();
    return symbols.filter(symbol => {
      let key = [symbol.type, symbol.name].join(':');
      if (used.has(key)) {
        return false;
      }
      used.add(key);
      return true;
    })
    .map(symbol => symbol.toSymbolInformation());
  }

  public provideDocumentSymbols(
    document: vscode.TextDocument, token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.SymbolInformation[]> {
    return this.uniqueSymbols(parseDocument(document));
  }

}
