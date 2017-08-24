'use strict';

import * as vscode from 'vscode';
import * as symbolCache from './symbol-cache';
import { parseDocument, parseCurrentWorkspace } from './symbol-parser';
import ZoneSymbol from './zone-symbol';

const ZONEINFO_MODE = 'zoneinfo';

export function activate(context: vscode.ExtensionContext) {
  console.log('--activate--');
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(ZONEINFO_MODE, new ZoneinfoDocumentSymbolProvider()),
    vscode.languages.registerWorkspaceSymbolProvider(new ZoneinfoWorkspaceSymbolProvider()),
  );
  process.nextTick(parseCurrentWorkspace);
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

class ZoneinfoWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {

  private symbolProvider: ZoneinfoDocumentSymbolProvider;

  public constructor() {
    this.symbolProvider = new ZoneinfoDocumentSymbolProvider();
  }

  public filteredSymbols(symbols: ZoneSymbol[], query: string): vscode.ProviderResult<vscode.SymbolInformation[]> {
    // let queryLetters = [...query].map(c => c.toLocaleLowerCase());
    // TODO: Less-naïve checking of string matches
    let filtered = symbols.filter((symbol: ZoneSymbol) =>
      symbol.name.indexOf(query) !== -1);
    return this.symbolProvider.uniqueSymbols(filtered);
  }

  // TODO: Test this with single files rather than the tz folder
  public provideWorkspaceSymbols(
    query: string, token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.SymbolInformation[]> {
    
    console.log('--provideWorkspaceSymbols--');
    let allSymbols = symbolCache.getForCurrentWorkspace();
    console.log(`  (cache has ${allSymbols ? allSymbols.length : 'nothing'})`);
    let promise = (allSymbols !== null) ?
      Promise.resolve(allSymbols) :
      parseCurrentWorkspace();

    return promise.then(symbols => this.filteredSymbols(allSymbols, query));
  }

}
